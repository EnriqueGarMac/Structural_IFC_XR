"""SAP2000 Excel -> XR JSON converter against small synthetic workbooks.

The workbooks follow the SAP2000 'MS Excel Spreadsheet' layout (title row,
field names, units, data). They are NOT exported from a real SAP2000.
"""
import sys
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sap2000_to_xr import ExcelDatabase, export_xr, projection_factor, to_compatible

XMLNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
RELNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKGNS = 'http://schemas.openxmlformats.org/package/2006/relationships'


def cell(column, row, value):
    ref = chr(65 + column) + str(row)
    if value is None or value == '':
        return ''
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def workbook(tables):
    path = Path(tempfile.mkdtemp()) / 'model.xlsx'
    names = list(tables)
    with ZipFile(path, 'w') as z:
        z.writestr('xl/workbook.xml', f'<workbook xmlns="{XMLNS}" xmlns:r="{RELNS}"><sheets>' + ''.join(
            f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, n in enumerate(names))
            + '</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', f'<Relationships xmlns="{PKGNS}">' + ''.join(
            f'<Relationship Id="rId{i + 1}" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(names)))
            + '</Relationships>')
        for i, name in enumerate(names):
            fields, units, rows = tables[name]
            lines = [['TABLE:  ' + name], fields, units] + rows
            data = ''.join(f'<row r="{r + 1}">' + ''.join(cell(c, r + 1, v) for c, v in enumerate(vals))
                           + '</row>' for r, vals in enumerate(lines))
            z.writestr(f'xl/worksheets/sheet{i + 1}.xml', f'<worksheet xmlns="{XMLNS}"><sheetData>{data}</sheetData></worksheet>')
    return path


def convert(tables):
    db = ExcelDatabase(workbook(tables))
    try:
        rich = export_xr(db)
    finally:
        db.close()
    return rich, to_compatible(rich)


def joints(rows):
    return (['Joint', 'GlobalX', 'GlobalY', 'GlobalZ'], ['', 'm', 'm', 'm'], rows)


def frame_model(force='KN'):
    """Portal frame 1-2-3-4 in the XZ plane, beam 2 from (0,0,3) to (4,0,3)."""
    disp = ['Joint', 'OutputCase', 'CaseType', 'StepType', 'StepNum', 'U1', 'U2', 'U3', 'R1', 'R2', 'R3']
    return {
        'Joint Coordinates': joints([[1, 0, 0, 0], [2, 0, 0, 3], [3, 4, 0, 3], [4, 4, 0, 0]]),
        'Connectivity - Frame': (['Frame', 'JointI', 'JointJ', 'Length'], ['', '', '', 'm'],
                                 [[1, 1, 2, 3], [2, 2, 3, 4], [3, 4, 3, 3]]),
        'Load Pattern Definitions': (['LoadPat', 'SelfWtMult'], ['', ''], [['LIVE', 0]]),
        'Frame Loads - Distributed': (
            ['Frame', 'LoadPat', 'CoordSys', 'Type', 'Dir', 'RelDistA', 'RelDistB', 'FOverLA', 'FOverLB'],
            ['', '', '', '', '', '', '', force + '/m', force + '/m'],
            [[2, 'LIVE', 'GLOBAL', 'Force', 'Gravity', 0, 1, 1000, 1000],
             [2, 'LIVE', 'Local', 'Force', 2, 0, .5, -5, -5],
             [2, 'LIVE', 'GLOBAL', 'Moment', 'Gravity', 0, 1, 1, 1]]),
        'Joint Displacements': (disp, [''] * 5 + ['m'] * 3 + ['Radians'] * 3, [
            [j, 'ENV', 'Combination', step, None, 0, 0, uz, 0, 0, 0]
            for step, uz in (('Max', -.001), ('Min', -.004)) for j in (1, 2, 3, 4)]),
    }


def test_distributed_loads_reach_the_viewer_with_global_sign():
    rich, flat = convert(frame_model())
    gravity, local = flat['loads']
    assert gravity == {'frame': '2', 'pattern': 'LIVE', 'type': 'force_per_length', 'csys': 'Global',
                       'dir': 6, 'start': 0, 'end': 1, 'w1': -1000., 'w2': -1000.}
    assert (local['csys'], local['dir'], local['end'], local['w1']) == ('Local', 2, .5, -5.)
    # Moments cannot be drawn: kept raw and reported, never silently dropped.
    assert len(rich['loads']['other_assignments']) == 1
    assert any('distributed moments' in w for w in rich['warnings'])


def test_kgf_units_are_converted():
    _, flat = convert(frame_model(force='Kgf'))
    assert abs(flat['loads'][0]['w1'] + 9.80665) < 1e-9


def test_envelope_max_and_min_stay_separate():
    _, flat = convert(frame_model())
    cases = {c['name']: c['displacements'][1]['uz'] for c in flat['cases']}
    assert cases == {'ENV (Max)': -.001, 'ENV (Min)': -.004}


def test_projected_load_uses_member_projection():
    rafter = {'start_xyz_m': [0, 0, 0], 'end_xyz_m': [4, 0, 3]}
    assert abs(projection_factor(rafter, 2) - .8) < 1e-12


def shell_model():
    """Two 1 x 1 m plates in the XY plane with a buckling case and a joint load."""
    disp = ['Joint', 'OutputCase', 'CaseType', 'StepType', 'StepNum', 'U1', 'U2', 'U3', 'R1', 'R2', 'R3']
    units = [''] * 5 + ['m'] * 3 + ['Radians'] * 3
    ids = [1, 2, 3, 4, 5, 6]
    return {
        'Joint Coordinates': joints([[1, 0, 0, 0], [2, 1, 0, 0], [3, 2, 0, 0],
                                     [4, 0, 1, 0], [5, 1, 1, 0], [6, 2, 1, 0]]),
        'Connectivity - Area': (['Area', 'NumJoints', 'Joint1', 'Joint2', 'Joint3', 'Joint4', 'AreaArea'],
                                [''] * 6 + ['m2'], [[10, 4, 1, 2, 5, 4, 1], [11, 4, 2, 3, 6, 5, 1]]),
        'Area Section Properties': (['Section', 'Material', 'Type', 'Thickness', 'WMod'], ['', '', '', 'm', ''],
                                    [['PL20', 'STEEL', 'Shell-Thin', .02, 1]]),
        'Area Section Assignments': (['Area', 'Section', 'MatProp'], ['', '', ''],
                                     [[10, 'PL20', 'Default'], [11, 'PL20', 'Default']]),
        'MatProp 02 - Basic Mech Props': (['Material', 'UnitWeight', 'E1'], ['', 'KN/m3', 'KN/m2'],
                                          [['STEEL', 77, 2e8]]),
        'Load Pattern Definitions': (['LoadPat', 'SelfWtMult'], ['', ''], [['DEAD', 1], ['P', 0]]),
        'Joint Loads - Force': (['Joint', 'LoadPat', 'CoordSys', 'F1', 'F2', 'F3', 'M1', 'M2', 'M3'],
                                ['', '', '', 'N', 'N', 'N', 'N-m', 'N-m', 'N-m'],
                                [[3, 'P', 'GLOBAL', -2000, 0, 0, 0, 0, 0]]),
        'Case - Buckling 2 - Loads': (['Case', 'LoadType', 'LoadName', 'LoadSF'], [''] * 4,
                                      [['BUCK', 'Load pattern', 'P', 1], ['BUCKSW', 'Load pattern', 'DEAD', 2]]),
        'Buckling Factors': (['OutputCase', 'StepType', 'StepNum', 'ScaleFactor'], [''] * 4,
                             [['BUCK', 'Mode', 1, -12.5], ['BUCKSW', 'Mode', 1, 3]]),
        'Joint Displacements': (disp, units,
                                [[j, 'DEAD', 'LinStatic', None, None, 0, 0, -.001 * (j % 3), 0, 0, 0] for j in ids] +
                                [[j, case, 'LinBuckling', 'Mode', 1, 0, 0, .5 * (j % 3), 0, 0, 0]
                                 for case in ('BUCK', 'BUCKSW') for j in ids]),
    }


def test_shell_model_with_buckling():
    rich, flat = convert(shell_model())
    assert [a['joints'] for a in flat['areas']] == [['1', '2', '5', '4'], ['2', '3', '6', '5']]
    assert flat['areas'][0]['thickness_m'] == .02 and flat['frames'] == []
    # No beam curves: the viewer must fall back to the nodal displacements.
    assert flat['frameCurves'] == {}
    assert flat['pointLoads'] == [{'pattern': 'P', 'joint': '3', 'xyz_m': [2, 0, 0],
                                   'force_kN': [-2., 0., 0.], 'moment_kNm': [0., 0., 0.]}]
    by_case = {m['case']: m for m in flat['bucklingModes']}
    buck = by_case['BUCK']
    assert buck['factor'] == -12.5 and buck['critical_force_resultant_kN'] == [25., 0., 0.]
    assert max(abs(v[2]) for v in buck['jointShape'].values()) == 1.
    # Self-weight of the plates: 2 m2 x 0.02 m x 77 kN/m3, doubled by the case factor.
    reference = flat['bucklingReference']['BUCKSW']
    assert reference['complete'] and abs(reference['force_resultant_kN'][2] + 2 * 3.08) < 1e-12
    assert abs(by_case['BUCKSW']['critical_force_resultant_kN'][2] + 3 * 2 * 3.08) < 1e-12
    assert rich['geometry']['areas']['10']['area_m2'] == 1


def test_incomplete_buckling_reference_reports_only_factors():
    tables = shell_model()
    tables['Area Loads - Uniform'] = (['Area', 'LoadPat', 'CoordSys', 'Dir', 'UnifLoad'],
                                      ['', '', '', '', 'KN/m2'], [[10, 'P', 'GLOBAL', 'Gravity', 1]])
    rich, flat = convert(tables)
    mode = next(m for m in flat['bucklingModes'] if m['case'] == 'BUCK')
    assert 'critical_force_resultant_kN' not in mode and mode['factor'] == -12.5
    assert not flat['bucklingReference']['BUCK']['complete']
    assert any('reference load incomplete' in w for w in rich['warnings'])


if __name__ == '__main__':
    for name, test in list(globals().items()):
        if name.startswith('test_'):
            test()
    print('OK: conversor SAP2000 Excel -> XR (libros sintéticos, NO exportados de SAP2000 real)')
