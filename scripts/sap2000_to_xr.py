#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SAP2000 Excel database -> Structural IFC XR JSON (compatible + rich).

Usage:
    python sap2000_to_xr.py Modelo.xlsx -o Modelo_XR.json

By default exports the backward-compatible JSON: arrays nodes/frames/loads/cases
plus force diagrams and modal data for the updated viewer. Use --format rich
for the original nested schema imis.sap2000.xr/1.

Pure Python 3.10+: no SAP2000 installation or third-party modules required.
Reads the *complete SAP2000 database export* with one table per worksheet.
For a new model, export model definition AND analysis results, with all
joints/frames and requested load cases, from SAP2000.

WARNING: Modal displacements are eigenvectors with arbitrary scale. Use
normalized_shape for animation, NOT raw_shape_m as physical displacements.
Frame forces are in SAP2000 LOCAL 1/2/3 axes. If their orientation is not
exported, do not assume they coincide with global XYZ.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

XML = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'

# Canonical SI display units: m, kN, kN*m, rad, Hz, kN/m, kN/m^3.
LENGTH = {'mm': .001, 'cm': .01, 'm': 1., 'in': .0254, 'ft': .3048}
FORCE = {'n': .001, 'kn': 1., 'mn': 1000., 'lb': .0044482216152605,
         'lbf': .0044482216152605, 'kip': 4.4482216152605, 'tonf': 9.80665}


def num(value, default=None):
    if value is None or value == '':
        return default
    try:
        v = float(value)
    except (ValueError, TypeError):
        return default
    return v if math.isfinite(v) else default


def integer(value, default=None):
    n = num(value)
    return int(n) if n is not None else default


def text(value):
    return '' if value is None else str(value)


def col_index(cell_reference):
    letters = re.match(r'[A-Z]+', cell_reference or '')
    if not letters:
        return 0
    pos = 0
    for c in letters.group(0):
        pos = pos * 26 + (ord(c) - 64)
    return pos - 1


class ExcelDatabase:
    """Reads XLSX spreadsheets using only Python's standard library."""

    def __init__(self, path):
        self.path = Path(path)
        self.zip = ZipFile(self.path, 'r')
        self.sheets = self._list_sheets()
        self.cache = {}
        self.shared_strings = self._strings()

    def _strings(self):
        if 'xl/sharedStrings.xml' not in self.zip.namelist():
            return []
        root = ET.fromstring(self.zip.read('xl/sharedStrings.xml'))
        return [''.join(t.text or '' for t in si.iter(XML + 't'))
                for si in root.findall(XML + 'si')]

    def _list_sheets(self):
        wb = ET.fromstring(self.zip.read('xl/workbook.xml'))
        rels = ET.fromstring(self.zip.read('xl/_rels/workbook.xml.rels'))
        paths = {r.attrib['Id']: r.attrib['Target'] for r in rels.findall(PKG_REL + 'Relationship')}
        result = {}
        for sheet in wb.findall('.//' + XML + 'sheet'):
            target = paths.get(sheet.get(REL + 'id'))
            if target:
                file = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
                result[sheet.get('name')] = file
        return result

    def _cell(self, c):
        kind = c.get('t')
        if kind == 'inlineStr':
            return ''.join(n.text or '' for n in c.iter(XML + 't'))
        value_el = c.find(XML + 'v')
        if value_el is None or value_el.text is None:
            return None
        value = value_el.text
        if kind == 's':
            return self.shared_strings[int(value)]
        if kind in ('str', 'e', 'd'):
            return value
        if kind == 'b':
            return value == '1'
        try:
            return float(value) if ('.' in value or 'E' in value.upper()) else int(value)
        except ValueError:
            return value

    def get(self, name):
        """Returns (records, {column: units}); empty for absent tables."""
        if name in self.cache:
            return self.cache[name]
        if name not in self.sheets:
            return [], {}
        root = ET.fromstring(self.zip.read(self.sheets[name]))
        row_cells = {}
        for r in root.findall('.//' + XML + 'sheetData/' + XML + 'row'):
            rnum = int(r.get('r', '0'))
            if rnum == 1:
                continue  # SAP's title line, not field definitions
            cells = {col_index(c.get('r')): self._cell(c)
                     for c in r.findall(XML + 'c')}
            row_cells[rnum] = cells
        headers = row_cells.get(2, {})
        field_names = [text(headers.get(i)).strip() for i in range(max(headers, default=-1) + 1)]
        units = {name: text(row_cells.get(3, {}).get(i)).strip()
                 for i, name in enumerate(field_names) if name}
        records = []
        for rnum in sorted(k for k in row_cells if k >= 4):
            values = row_cells[rnum]
            record = {name: values.get(i) for i, name in enumerate(field_names) if name}
            if any(v is not None and v != '' for v in record.values()):
                records.append(record)
        self.cache[name] = (records, units)
        return records, units

    def close(self):
        self.zip.close()


def fact(unit, expected):
    """Convert one value from SAP worksheet units to target SI display units.

    Supported expected: length, force, moment, line_force, weight_density,
    area, stress, rotation. Unknown units raise instead of silently corrupting.
    """
    u = re.sub(r'\s+', '', text(unit)).lower().replace('²', '2').replace('³', '3')
    if expected == 'rotation':
        if u in ('radians', 'rad', ''):
            return 1.
        if u in ('degrees', 'deg'):
            return math.pi / 180.
    if expected == 'length' and u in LENGTH:
        return LENGTH[u]
    if expected == 'area' and u.endswith('2') and u[:-1] in LENGTH:
        return LENGTH[u[:-1]] ** 2
    if expected == 'force' and u in FORCE:
        return FORCE[u]
    if expected in ('moment', 'line_force', 'weight_density', 'stress'):
        if expected == 'moment' and '-' in u:
            a, b = u.split('-', 1)
            if a in FORCE and b in LENGTH:
                return FORCE[a] * LENGTH[b]
        if '/' in u:
            a, b = u.split('/', 1)
            if a in FORCE:
                if expected == 'line_force' and b in LENGTH:
                    return FORCE[a] / LENGTH[b]
                if expected == 'stress' and b.endswith('2') and b[:-1] in LENGTH:
                    return FORCE[a] / LENGTH[b[:-1]]**2  # kN/m2
                if expected == 'weight_density' and b.endswith('3') and b[:-1] in LENGTH:
                    return FORCE[a] / LENGTH[b[:-1]]**3  # kN/m3
    raise ValueError(f"Unit conversion unavailable: '{unit}' for {expected}")


def converted(row, units, key, expected, default=None):
    v = num(row.get(key))
    if v is None:
        return default
    return v * fact(units.get(key), expected)


def transfer_raw_si(row, units):
    """Preserves all load-assignment fields and converts known dimensions.

    Coordinate systems/directions/types must still be interpreted by XR;
    local components are NOT automatically transformed to global axes.
    """
    scaled = {}
    for k, v in row.items():
        n = num(v)
        if n is None:
            continue
        u = units.get(k, '')
        if not u:
            continue
        kind = None
        lu = u.lower().replace(' ', '')
        if lu in LENGTH:
            kind = 'length'
        elif lu in FORCE:
            kind = 'force'
        elif re.match(r'(?i)^(kip|kn|n|lb|lbf|mn|tonf)-', lu):
            kind = 'moment'
        elif '/' in lu and lu.split('/')[0] in FORCE:
            if lu.endswith('3'):
                kind = 'weight_density'
            elif lu.endswith('2'):
                kind = 'stress'
            else:
                kind = 'line_force'
        elif lu in ('rad', 'radians', 'degrees', 'deg'):
            kind = 'rotation'
        if kind:
            try:
                scaled[k] = n * fact(u, kind)
            except ValueError:
                pass
    return scaled


def result_key(row):
    case = text(row.get('OutputCase') or row.get('Case'))
    step = text(row.get('StepType'))
    stepnum = row.get('StepNum')
    if not step or stepnum is None:
        return case
    return f'{case}|{step}|{stepnum}'



def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def unit_vector(v):
    mag = math.sqrt(dot(v, v))
    if mag < 1.e-14:
        raise ValueError('Zero-length vector')
    return [x/mag for x in v]


def inferred_frame_axes(a, b, angle_deg=0.):
    """Default SAP frame orientation: 1 along i->j, 2 upwards in 1-Z plane.

    3 = 1 cross 2. For vertical members, 2 is global +X. Optional
    local-axis angle rotates 2 and 3 about local +1 (right-hand rule).
    See CSI SAP2000 Frame - Local Axes documentation.
    """
    axis_1 = unit_vector([y-x for x,y in zip(a,b)])
    if math.hypot(axis_1[0], axis_1[1]) < 1.e-3:
        axis_2 = [1., 0., 0.]
    else:
        vertical = [0.,0.,1.]
        axis_2 = unit_vector([vertical[i]-dot(vertical,axis_1)*axis_1[i] for i in range(3)])
    axis_3 = unit_vector(cross(axis_1,axis_2))
    theta=math.radians(angle_deg)
    if theta:
        c, st = math.cos(theta), math.sin(theta)
        a2 = [c*axis_2[i]+st*axis_3[i] for i in range(3)]
        a3 = [-st*axis_2[i]+c*axis_3[i] for i in range(3)]
        axis_2,axis_3=a2,a3
    return [axis_1,axis_2,axis_3]


def frame_curve(frame, first, last, count=17):
    """Approximate centerline deformation from joint 6-DOF values.

    Cubic Hermite bending interpolation (Euler-Bernoulli kinematics),
    linear axial interpolation. Not exact for every SAP element formulation;
    provided only as an XR display curve, not a substitute for FEM results.
    """
    axes = frame['local_axes']['basis_global']
    length = frame['length_m']
    ui, uj = first['translation_m'], last['translation_m']
    ri, rj = first['rotation_rad'], last['rotation_rad']
    uil = [dot(ui, axis) for axis in axes]
    ujl = [dot(uj, axis) for axis in axes]
    ril = [dot(ri, axis) for axis in axes]
    rjl = [dot(rj, axis) for axis in axes]
    samples=[]
    for j in range(count):
        t = j/(count-1)
        h1, h2 = 2*t**3-3*t**2+1, t**3-2*t**2+t
        h3, h4 = -2*t**3+3*t**2, t**3-t**2
        axial = (1-t)*uil[0]+t*ujl[0]
        trans_2 = h1*uil[1]+h2*length*ril[2]+h3*ujl[1]+h4*length*rjl[2]
        trans_3 = h1*uil[2]-h2*length*ril[1]+h3*ujl[2]-h4*length*rjl[1]
        disp=[axial*axes[0][i]+trans_2*axes[1][i]+trans_3*axes[2][i] for i in range(3)]
        samples.append(disp)
    return samples


def frame_curves(frames, nodal, count=17, normalizer=1.):
    curves={}
    for fid, frame in frames.items():
        a, b = frame['joint_i'],frame['joint_j']
        if a in nodal and b in nodal and frame.get('length_m'):
            curve=frame_curve(frame,nodal[a],nodal[b],count=count)
            curves[fid]=[[c/normalizer for c in vec] for vec in curve] if normalizer else curve
    return curves


def load_categories(db):
    """Find explicit assignments in SAP Excel, without inventing missing loads."""
    loads = {'joint_forces': [], 'frame_distributed': [], 'frame_point': [],
             'other_assignments': [], 'self_weight': []}
    for name in db.sheets:
        low = name.casefold()
        if not ('load' in low and (('joint' in low or 'frame' in low or 'area' in low)
                                    and ('loads -' in low or 'loads  -' in low))):
            continue
        rows, units = db.get(name)
        if 'joint loads' in low and 'force' in low:
            group = 'joint_forces'
        elif 'frame loads' in low and 'distributed' in low:
            group = 'frame_distributed'
        elif 'frame loads' in low and 'point' in low:
            group = 'frame_point'
        else:
            group = 'other_assignments'
        for row in rows:
            loads[group].append({'table': name, 'data': row,
                                 'si': transfer_raw_si(row, units),
                                 'source_units': units})
    return loads


def export_xr(db, curve_points=17):
    warnings = []
    program, _ = db.get('Program Control')
    prog = program[0] if program else {}
    source_units = text(prog.get('CurrUnits') or 'unknown')
    if not {'Joint Coordinates', 'Connectivity - Frame'}.issubset(db.sheets):
        raise ValueError('Missing essential SAP tables: Joint Coordinates and/or Connectivity - Frame')

    coords, cu = db.get('Joint Coordinates')
    restraints, _ = db.get('Joint Restraint Assignments')
    joint_restr = {text(r['Joint']): [text(r.get(k)).lower() == 'yes'
                  for k in ('U1', 'U2', 'U3', 'R1', 'R2', 'R3')] for r in restraints}
    joints = {}
    for r in coords:
        jid = text(r['Joint'])
        xyz = [converted(r, cu, k, 'length') for k in ('GlobalX', 'GlobalY', 'GlobalZ')]
        if any(v is None for v in xyz):
            xyz = [converted(r, cu, k, 'length') for k in ('XorR', 'Y', 'Z')]
        if any(v is None for v in xyz):
            warnings.append(f'Joint {jid}: incomplete coordinates')
            continue
        joints[jid] = {'xyz_m': xyz, 'restrained_dof': joint_restr.get(jid, [False]*6)}

    mats_g, _ = db.get('MatProp 01 - General')
    mats_p, mu = db.get('MatProp 02 - Basic Mech Props')
    materials = {text(r['Material']): {'type': r.get('Type'), 'grade': r.get('Grade')}
                 for r in mats_g}
    for r in mats_p:
        name = text(r['Material'])
        m = materials.setdefault(name, {})
        try:
            m['unit_weight_kN_per_m3'] = converted(r, mu, 'UnitWeight', 'weight_density')
            m['E_GPa'] = converted(r, mu, 'E1', 'stress') / 1e6  # kN/m2 -> GPa
        except (ValueError, TypeError):
            warnings.append(f'Material {name}: weight or Young modulus conversion unsupported')

    sections_table, su = db.get('Frame Props 01 - General')
    sections = {}
    for r in sections_table:
        name = text(r['SectionName'])
        section = {'material': r.get('Material'), 'shape': r.get('Shape')}
        for fld in ('t3', 't2', 'tf', 'tw', 't2b', 'tfb'):
            v = converted(r, su, fld, 'length')
            if v is not None:
                section[fld + '_m'] = v
        area = converted(r, su, 'Area', 'area')
        if area is not None:
            section['area_m2'] = area
        sections[name] = section

    assigns, _ = db.get('Frame Section Assignments')
    frame_section = {text(r['Frame']): text(r.get('AnalSect') or r.get('DesignSect')) for r in assigns}
    releases_table, _ = db.get('Frame Releases 1 - General')
    releases = {text(r['Frame']): {k: text(v).lower() == 'yes' for k, v in r.items()
                if k not in ('Frame', 'PartialFix')} for r in releases_table}
    axes_records = {}
    for table_name in db.sheets:
        if 'frame' in table_name.casefold() and 'local ax' in table_name.casefold():
            records, _ = db.get(table_name)
            for assignment in records:
                frame_id = text(assignment.get('Frame') or assignment.get('Label'))
                raw_angle = assignment.get('Ang', assignment.get('Angle', assignment.get('AngleDeg', 0)))
                if frame_id:
                    axes_records[frame_id] = {'angle_deg': num(raw_angle, 0.),
                                             'advanced': text(assignment.get('Advanced')).lower() == 'yes',
                                             'table': table_name}
    conns, fu = db.get('Connectivity - Frame')
    frames = {}
    for r in conns:
        fid, ji, jj = (text(r.get(k)) for k in ('Frame', 'JointI', 'JointJ'))
        if ji not in joints or jj not in joints:
            warnings.append(f'Frame {fid}: endpoint joint missing')
            continue
        name = frame_section.get(fid, '')
        section = sections.get(name, {})
        assigned_axes=axes_records.get(fid, {})
        if assigned_axes.get('advanced'):
            warnings.append(f'Frame {fid}: advanced local axes cannot be reconstructed from an angle alone')
        inferred_axes = inferred_frame_axes(joints[ji]['xyz_m'], joints[jj]['xyz_m'],
                                           assigned_axes.get('angle_deg', 0.))
        frames[fid] = {
            'joint_i': ji, 'joint_j': jj,
            'start_xyz_m': joints[ji]['xyz_m'], 'end_xyz_m': joints[jj]['xyz_m'],
            'length_m': converted(r, fu, 'Length', 'length'),
            'section': name, 'material': section.get('material'),
            'releases': releases.get(fid, {}),
            'forces_local_axes': 'SAP2000_1_2_3',
            'local_axes': {'basis_global': inferred_axes,
                           'angle_deg': assigned_axes.get('angle_deg', 0.),
                           'source': 'SAP default geometry + angle assignment' if assigned_axes else 'SAP default inferred from geometry',
                           'advanced_unresolved': bool(assigned_axes.get('advanced'))},
        }

    patterns, _ = db.get('Load Pattern Definitions')
    load_patterns = {text(r['LoadPat']): {'type': r.get('DesignType'),
                      'self_weight_multiplier': num(r.get('SelfWtMult'), 0)} for r in patterns}
    load_cases, _ = db.get('Load Case Definitions')
    case_defs = {text(r['Case']): {'type': r.get('Type'), 'status': r.get('CaseStatus')}
                 for r in load_cases}
    loads = load_categories(db)
    for pattern, config in load_patterns.items():
        factor = config['self_weight_multiplier']
        if not factor:
            continue
        for fid, fr in frames.items():
            section = sections.get(fr['section'], {})
            material = materials.get(fr.get('material'), {})
            area, unit_weight = section.get('area_m2'), material.get('unit_weight_kN_per_m3')
            if area is None or unit_weight is None:
                warnings.append(f'Frame {fid}: unable to calculate self-weight')
                continue
            # Gravity assumed -global Z for standard SAP2000 global coordinates.
            loads['self_weight'].append({
                'load_pattern': pattern, 'frame': fid,
                'direction_global': [0, 0, -1],
                'q_global_kN_per_m': [0., 0., -area * unit_weight * factor],
                'source': 'material unit weight * section area * SelfWtMult',
            })
    if not any(loads[k] for k in ('joint_forces', 'frame_distributed', 'frame_point')):
        warnings.append('No explicit joint/frame force load assignments found. Self-weight may still apply.')

    disp_rows, du = db.get('Joint Displacements')
    displacements = {}
    eigenvectors = {}
    for r in disp_rows:
        jid = text(r.get('Joint'))
        value = {
            'translation_m': [converted(r, du, k, 'length', 0.) for k in ('U1', 'U2', 'U3')],
            'rotation_rad': [converted(r, du, k, 'rotation', 0.) for k in ('R1', 'R2', 'R3')],
        }
        if text(r.get('StepType')).lower() == 'mode':
            case, no = text(r.get('OutputCase')), integer(r.get('StepNum'))
            if no is not None:
                eigenvectors.setdefault((case, no), {})[jid] = value
        else:
            displacements.setdefault(result_key(r), {})[jid] = value

    force_rows, efu = db.get('Element Forces - Frames')
    frame_forces = {}
    modal_frame_forces = {}
    for r in force_rows:
        key, fid = result_key(r), text(r.get('Frame'))
        is_modal_force = text(r.get('StepType')).lower() == 'mode'
        sample = {'station_m': converted(r, efu, 'Station', 'length', 0.),
                  'frame_element': r.get('FrameElem')}
        for fld in ('P', 'V2', 'V3'):
            sample[fld + '_kN'] = converted(r, efu, fld, 'force', 0.)
        for fld in ('T', 'M2', 'M3'):
            sample[fld + '_kNm'] = converted(r, efu, fld, 'moment', 0.)
        target = modal_frame_forces if is_modal_force else frame_forces
        target.setdefault(key, {}).setdefault(fid, []).append(sample)
    for per_case in list(frame_forces.values()) + list(modal_frame_forces.values()):
        for per_frame in per_case.values():
            per_frame.sort(key=lambda s: s['station_m'])

    reaction_rows, ru = db.get('Joint Reactions')
    reactions = {}
    for r in reaction_rows:
        if text(r.get('StepType')).lower() == 'mode':
            continue
        jid = text(r.get('Joint'))
        reactions.setdefault(result_key(r), {})[jid] = {
            'force_kN': [converted(r, ru, k, 'force', 0.) for k in ('F1', 'F2', 'F3')],
            'moment_kNm': [converted(r, ru, k, 'moment', 0.) for k in ('M1', 'M2', 'M3')]
        }

    modal_rows, _ = db.get('Modal Periods And Frequencies')
    ratio_rows, _ = db.get('Modal Participating Mass Ratios')
    ratio_map = {(text(r.get('OutputCase')), integer(r.get('StepNum'))): r for r in ratio_rows}
    modes = []
    for r in modal_rows:
        case, no = text(r.get('OutputCase')), integer(r.get('StepNum'))
        if no is None:
            continue
        raw = eigenvectors.get((case, no), {})
        max_disp = max((math.sqrt(sum(x*x for x in v['translation_m'])) for v in raw.values()), default=0.)
        normalized = {jid: [x/max_disp for x in v['translation_m']] if max_disp else [0., 0., 0.]
                      for jid, v in raw.items()}
        # The maximum translational modal shape vector is exactly length 1.
        mode = {'case': case, 'number': no, 'frequency_hz': num(r.get('Frequency')),
                'period_s': num(r.get('Period')),
                'omega_rad_per_s': num(r.get('CircFreq')),
                'normalized_shape': normalized, 'raw_shape': raw,
                'normalization': 'maximum nodal translation vector magnitude = 1; arbitrary modal scale',
                'raw_shape_translation_unit': 'm (eigenvector components, NOT physical motion)'}
        ratio = ratio_map.get((case, no))
        if ratio:
            mode['participating_mass_ratios'] = {k: num(v) for k, v in ratio.items()
                if k not in ('OutputCase', 'StepType', 'StepNum', 'Period') and num(v) is not None}
        if len(raw) != len(joints):
            warnings.append(f'Mode {case} #{no}: {len(raw)}/{len(joints)} nodal eigenvectors found')
        modes.append(mode)

    # Precomputed deformed centerlines: 17 samples per frame, for direct XR
    # display at arbitrary amplification. Nodal displacements remain definitive.
    for mode in modes:
        norm = max((math.sqrt(sum(x*x for x in v['translation_m']))
                    for v in mode['raw_shape'].values()), default=0.)
        mode['frame_curve_normalized'] = frame_curves(frames, mode['raw_shape'],
                                                       curve_points, norm) if norm else {}
    static_curves = {case: frame_curves(frames, v, curve_points) for case,v in displacements.items()}

    max_disp = {case: max((math.sqrt(sum(d*d for d in v['translation_m']))
                        for v in nodes.values()), default=0.)
                for case, nodes in displacements.items()}

    return {
        'schema': 'imis.sap2000.xr/1',
        'source': {'workbook': db.path.name, 'software': prog.get('ProgramName'),
                   'version': prog.get('Version'), 'original_units': source_units,
                   'exported_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()},
        'units': {'length': 'm', 'translation': 'm', 'force': 'kN',
                  'moment': 'kN*m', 'rotation': 'rad', 'frequency': 'Hz',
                  'distributed_load': 'kN/m'},
        'coordinate_system': {'name': 'SAP2000_GLOBAL', 'vertical_axis': 'Z',
                              'frame_internal_force_axes': 'LOCAL_1_2_3'},
        'geometry': {'joints': joints, 'frames': frames,
                     'sections': sections, 'materials': materials},
        'loads': {'patterns': load_patterns, **loads},
        'results': {'cases': case_defs, 'joint_displacements': displacements,
                    'frame_forces': frame_forces,
                    'modal_frame_forces_arbitrary_scale': modal_frame_forces,
                    'joint_reactions': reactions,
                    'modes': modes, 'frame_curves_m': static_curves,
                    'curve_sampling': {'samples_per_frame': curve_points, 'method': 'cubic Hermite from nodal 6-DOF, visualization approximation'},
                    'max_joint_displacement_m': max_disp},
        'coverage': {'input_worksheets': len(db.sheets),
                     'num_joints': len(joints), 'num_frames': len(frames),
                     'num_modes': len(modes),
                     'num_static_force_samples': sum(len(samples) for per_case in frame_forces.values()
                                                    for samples in per_case.values()),
                     'num_explicit_loads': sum(len(loads[k]) for k in ('joint_forces', 'frame_distributed', 'frame_point'))},
        'warnings': sorted(set(warnings)),
    }



def to_compatible(rich: dict) -> dict:
    """Convert rich SAP tables to an old-viewer-safe extended schema.

    The legacy app expects arrays at top level. The upgraded app also reads
    extra fields `forces`, `modes`, `frameCurves` and `sections`.
    """
    if rich.get('schema') != 'imis.sap2000.xr/1':
        raise ValueError('Unexpected internal SAP export schema')
    geom, load_db, res = rich['geometry'], rich['loads'], rich['results']

    nodes = [
        {'id': str(joint_id), 'x': joint['xyz_m'][0],
         'y': joint['xyz_m'][1], 'z': joint['xyz_m'][2],
         'restrained_dof': joint.get('restrained_dof', [])}
        for joint_id, joint in geom['joints'].items()
    ]
    frames = [
        {'id': str(frame_id), 'i': str(frame['joint_i']),
         'j': str(frame['joint_j']), 'section': frame.get('section'),
         'material': frame.get('material'),
         'local_axes': frame.get('local_axes'),
         'length_m': frame.get('length_m')}
        for frame_id, frame in geom['frames'].items()
    ]

    # The existing viewer draws only GLOBAL axis-aligned distributed forces.
    # Preserve all other assignments separately rather than misrepresenting them.
    loads = []
    for q in load_db.get('self_weight', []):
        for axis, value in enumerate(q['q_global_kN_per_m']):
            if abs(value) > 1.e-14:
                loads.append({
                    'frame': str(q['frame']), 'pattern': str(q['load_pattern']),
                    'type': 'force_per_length', 'csys': 'Global',
                    'dir': axis + 4, 'start': 0.0, 'end': 1.0,
                    'w1': value, 'w2': value
                })
    for q in load_db.get('frame_distributed', []):
        # Only explicit, resolved GLOBAL loads in the viewer's native units.
        if (str(q.get('csys', '')).lower() == 'global'
                and integer(q.get('dir')) in (4, 5, 6)
                and num(q.get('w1_kN_per_m')) is not None
                and num(q.get('w2_kN_per_m')) is not None):
            loads.append({
                'frame': str(q['frame']), 'pattern': str(q['pattern']),
                'type': 'force_per_length', 'csys': 'Global',
                'dir': integer(q['dir']), 'start': num(q.get('start'), 0),
                'end': num(q.get('end'), 1),
                'w1': num(q['w1_kN_per_m']), 'w2': num(q['w2_kN_per_m'])
            })

    cases = [
        {'name': case, 'displacements': [
            {'node': str(joint_id),
             'ux': d['translation_m'][0], 'uy': d['translation_m'][1],
             'uz': d['translation_m'][2],
             'rotations_rad': d.get('rotation_rad', [0, 0, 0])}
            for joint_id, d in table.items()
        ]}
        for case, table in res['joint_displacements'].items()
    ]
    modes = [
        {'number': m['number'], 'case': m.get('case'),
         'frequency_hz': m['frequency_hz'], 'period_s': m['period_s'],
         'jointShape': m['normalized_shape'],
         'frameCurves': m['frame_curve_normalized'],
         'normalization': m.get('normalization'),
         'participating_mass_ratios': m.get('participating_mass_ratios', {})}
        for m in res['modes']
    ]
    compatible = {
        'schema': 'imis.sap2000.xr/compatible-1',
        'meta': {
            'source': 'SAP2000 Excel', 'units': 'm, kN',
            'name': rich['source']['workbook'],
            'note': 'Los esfuerzos son LOCALES. Las formas modales son relativas, no desplazamientos físicos.',
        },
        'nodes': nodes, 'frames': frames, 'loads': loads, 'cases': cases,
        'forces': res['frame_forces'], 'modes': modes,
        'sections': geom['sections'], 'materials': geom['materials'],
        'frameCurves': res['frame_curves_m'],
        'jointReactions': res['joint_reactions'],
        'loadAssignments': load_db,
        'modalFrameForcesArbitraryScale': res['modal_frame_forces_arbitrary_scale'],
        'sourceInfo': rich['source'],
        'warnings': rich['warnings'],
        'coverage': rich['coverage'],
    }
    if not compatible['nodes'] or not compatible['frames']:
        raise ValueError('No valid SAP geometry available')
    return compatible


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('input', type=Path, help='SAP2000 Excel export (.xlsx)')
    ap.add_argument('-o', '--output', type=Path, help='Output Structural XR JSON')
    ap.add_argument('--compact', action='store_true', help='Remove whitespace (smaller file)')
    ap.add_argument('--format', choices=('compatible', 'rich'), default='compatible',
                    help='compatible: works in old and updated XR apps (default); rich: original nested schema')
    ap.add_argument('--curve-points', type=int, default=17, help='Centerline points per frame (default: 17)')
    args = ap.parse_args()
    if args.curve_points < 2 or args.curve_points > 101:
        ap.error('--curve-points must be between 2 and 101')
    output = args.output or args.input.with_name(args.input.stem + '_XR.json')
    with ZipFile(args.input) as z:
        if 'xl/workbook.xml' not in z.namelist():
            ap.error('Input does not look like a valid .xlsx workbook')
    db = ExcelDatabase(args.input)
    try:
        payload = export_xr(db, curve_points=args.curve_points)
    finally:
        db.close()
    exported = to_compatible(payload) if args.format == 'compatible' else payload
    with output.open('w', encoding='utf8') as fp:
        json.dump(exported, fp, ensure_ascii=False, allow_nan=False,
                  indent=None if args.compact else 2)
        fp.write('\n')
    coverage = payload['coverage']
    print(f'JSON saved: {output} (format: {args.format})')
    print('Counts:', json.dumps(coverage, ensure_ascii=False))
    print('Analysis cases:', ', '.join(payload['results']['cases']))
    print('Modes (Hz):', ', '.join(f"{m['frequency_hz']:.3f}" for m in payload['results']['modes']))
    if payload['warnings']:
        print('Warnings:')
        for warning in payload['warnings']:
            print('  -', warning)


if __name__ == '__main__':
    main()
