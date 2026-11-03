"""Exporta nodos, desplazamientos de un caso y cargas frame de SAP2000.

Uso en Windows, con SAP2000 abierto, modelo calculado:
    py -m pip install comtypes
    py scripts\\exportar_sap2000.py --case DEAD --out resultado_sap.json

NOTA: no se ha probado en una instancia real de SAP2000. El OAPI y las
versiones del puente COM pueden variar; se informa de los fallos sin inventar datos.
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def value(raw):
    return raw if isinstance(raw, (list, tuple)) else [raw]


def assert_ret(raw, operation):
    a = value(raw)
    if not a or a[-1] != 0:
        raise RuntimeError(f'{operation}: SAP2000 devolvió código {a[-1] if a else "vacío"}')
    return a


def call_with_fallback(method, variants, label):
    errors = []
    for args in variants:
        try:
            return assert_ret(method(*args), label)
        except (TypeError, AttributeError, ValueError) as exc:
            errors.append(str(exc))
    raise RuntimeError(f'{label}: no fue posible llamar al OAPI. {errors[:2]}')


def names(obj, label):
    raw = call_with_fallback(obj.GetNameList, [(0, []), ()], label)
    arrays = [r for r in raw[:-1] if isinstance(r, (tuple, list))]
    if not arrays:
        return []
    return [str(v) for v in arrays[0]]


def coordinates(model, node):
    raw = call_with_fallback(model.PointObj.GetCoordCartesian,
                             [(node, 0.0, 0.0, 0.0, 'Global'),
                              (node, 0.0, 0.0, 0.0), (node,)],
                             'GetCoordCartesian ' + node)
    return list(map(float, raw[:3]))


def frame_points(model, name):
    raw = call_with_fallback(model.FrameObj.GetPoints,
                             [(name, '', ''), (name,)], 'GetPoints '+name)
    return str(raw[0]), str(raw[1])


def joint_disp(model, node):
    # 11 output arrays: Obj, Elm, LoadCase, StepType, StepNum, U1..U3, R1..R3.
    raw = call_with_fallback(model.Results.JointDispl,
                             [(node, 0, 0, *([[]] * 11)), (node, 0)],
                             'JointDispl '+node)
    # ByRef layout: NRes Obj Elm LoadCase StepType StepNum U1 U2 U3 R1 R2 R3 ret
    if not raw[0]:
        return {'node': node, 'ux': 0.0, 'uy': 0.0, 'uz': 0.0}, False
    try:
        # For multi-step analyses only the last result is used. Prefer a static case.
        idx = int(raw[0]) - 1
        return {'node': node, 'ux': float(raw[6][idx]),
                'uy': float(raw[7][idx]), 'uz': float(raw[8][idx])}, True
    except (IndexError, TypeError) as exc:
        raise RuntimeError(f'JointDispl {node}: salida inesperada: {exc}') from exc


def distributed_loads(model, frame):
    args = (frame, 0, *([[]] * 11))
    # Actual outputs: NumberItems, FrameName, LoadPat, MyType, CSys, Dir,
    # RD1, RD2, Dist1, Dist2, Val1, Val2, return_code.
    raw = call_with_fallback(model.FrameObj.GetLoadDistributed,
                             [args + (0,), args], 'GetLoadDistributed '+frame)
    out = []
    for j in range(int(raw[0])):
        if int(raw[3][j]) != 1:  # type=2 is moment per unit length: not plotted
            continue
        out.append({
            'frame': str(raw[1][j]), 'pattern': str(raw[2][j]),
            'type': 'force_per_length', 'csys': str(raw[4][j]),
            'dir': int(raw[5][j]), 'start': float(raw[6][j]),
            'end': float(raw[7][j]), 'w1': float(raw[10][j]),
            'w2': float(raw[11][j])
        })
    return out


def main():
    parser = argparse.ArgumentParser(description='SAP2000 → JSON para Structural XR')
    parser.add_argument('--case', required=True, help='Nombre exacto del caso de carga calculado, por ejemplo DEAD')
    parser.add_argument('--out', default='resultado_sap.json')
    args = parser.parse_args()
    try:
        import comtypes.client
        sap = comtypes.client.GetActiveObject('CSI.SAP2000.API.SapObject')
    except Exception as exc:
        print('ERROR: Abre SAP2000 con el modelo antes de ejecutar el script; instala comtypes.',file=sys.stderr)
        print(str(exc),file=sys.stderr)
        return 1
    model = sap.SapModel
    # eUnits=6: kN, m, °C. Restore the user's choice at the end.
    original_units = model.GetPresentUnits()
    print('SAP2000 conectado. Extrayendo resultados…')
    try:
        assert_ret(model.SetPresentUnits(6), 'SetPresentUnits(kN_m_C)')
        node_names = names(model.PointObj, 'PointObj.GetNameList')
        frame_names = names(model.FrameObj, 'FrameObj.GetNameList')
        print(f'{len(node_names)} nudos; {len(frame_names)} barras.')
        node_rows = []
        for name in node_names:
            x,y,z = coordinates(model,name)
            node_rows.append({'id':name,'x':x,'y':y,'z':z})
        frame_rows=[]
        for name in frame_names:
            i,j=frame_points(model,name)
            frame_rows.append({'id':name,'i':i,'j':j})
        assert_ret(model.Results.Setup.DeselectAllCasesAndCombosForOutput(), 'DeselectAllCasesAndCombosForOutput')
        case_ret = model.Results.Setup.SetCaseSelectedForOutput(args.case)
        if case_ret != 0:
            # A SAP2000 result combination uses a distinct OAPI selector.
            assert_ret(model.Results.Setup.SetComboSelectedForOutput(args.case),
                       'SetComboSelectedForOutput '+args.case)
        displacements=[]; no_results=[]
        for name in node_names:
            row,ok=joint_disp(model,name)
            displacements.append(row)
            if not ok:no_results.append(name)
        if no_results:
            raise RuntimeError(f'Sin resultados de desplazamientos para {len(no_results)} nudos. Verifica que el caso {args.case} se ha analizado.')
        load_rows=[]
        for name in frame_names:
            load_rows.extend(distributed_loads(model,name))
        data={
            'meta':{'source':'SAP2000 OAPI','case':args.case,
                    'created':datetime.now().isoformat(timespec='seconds'),
                    'units':'m, kN','notes':'Static case preferred. Multi-step: last result per joint.'},
            'nodes':node_rows,'frames':frame_rows,'loads':load_rows,
            'cases':[{'name':args.case,'displacements':displacements}]
        }
        p=Path(args.out);p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
        print(f'EXPORTACIÓN COMPLETA: {p.resolve()}')
        print('Comprueba la correspondencia geométrica IFC/SAP antes de interpretar la deformada.')
        return 0
    except Exception as exc:
        print('NO se exportaron resultados:',exc,file=sys.stderr)
        return 2
    finally:
        try:model.SetPresentUnits(original_units)
        except Exception:pass

if __name__=='__main__':sys.exit(main())
