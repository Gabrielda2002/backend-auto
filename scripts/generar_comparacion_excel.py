"""Genera dashboard interactivo Nordvital — TODO POR FÓRMULAS.

Regla cero: ninguna celda del dashboard contiene un valor pegado.
Las únicas fuentes son las dos hojas del archivo `citas_db_costos.xlsx`:
  - `Hoja1`                       -> tblCostos  (344K filas, 37 cols)
  - `citas_db notas_tecnicas`     -> tblNT      (7,700 filas, 12 cols)

Una tercera tabla `tblNTMap` se DERIVA de tblNT con reglas claras (split
SUBSIDIADO/CONTRIBUTIVO). Las reglas están documentadas en README y en
el código de `derive_nt_map`.

Todos los KPIs y tablas de los 5 dashboards son fórmulas
(COUNTIFS, SUMIFS, AVERAGEIFS, XLOOKUP, SUMPRODUCT) que apuntan a esas
3 tablas. Cambia un dato -> recalcula automáticamente.

Solo títulos, etiquetas, encabezados y nombres de KPI son strings.
"""
from __future__ import annotations
import os
from datetime import datetime
import pandas as pd
import xlsxwriter

EXCEL_IN = 'citas_db_costos.xlsx'
EXCEL_OUT = os.path.join('docs', 'dashboards', 'comparacion_dashboards.xlsx')

NAVY = '#0B3B5E'
TURQ = '#1F8E8E'
GREEN = '#2E7D32'
AMBER = '#FBC02D'
RED = '#D32F2F'
LIGHT = '#F7F9FB'
GRID = '#C2C7CF'


# ════════════════════════════════════════════════════════════════
#  CARGA Y DERIVACIÓN
# ════════════════════════════════════════════════════════════════
def load_workbook_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    print(f'[1/2] Leyendo {EXCEL_IN} (puede tardar 1-2 min)...')
    costos = pd.read_excel(EXCEL_IN, sheet_name='Hoja1', engine='openpyxl')
    nt = pd.read_excel(EXCEL_IN, sheet_name='citas_db notas_tecnicas', engine='openpyxl')
    print(f'      tblCostos: {len(costos):,} filas, {len(costos.columns)} cols')
    print(f'      tblNT:     {len(nt):,} filas, {len(nt.columns)} cols')

    # Tipados defensivos
    for c in ['fecha_cita', 'fecha_deseada', 'fecha_asig', 'fecha_carga']:
        if c in costos.columns:
            costos[c] = pd.to_datetime(costos[c], errors='coerce')
    for c in ['valor_recuperacion', 'costo_servicio']:
        if c in costos.columns:
            costos[c] = pd.to_numeric(costos[c], errors='coerce').fillna(0)
    if 'costo_medio_evento' in nt.columns:
        nt['costo_medio_evento'] = pd.to_numeric(nt['costo_medio_evento'], errors='coerce').fillna(0)
    if 'n_eventos_mes' in nt.columns:
        nt['n_eventos_mes'] = pd.to_numeric(nt['n_eventos_mes'], errors='coerce').fillna(0)
    if 'cups' in nt.columns:
        nt['cups'] = nt['cups'].astype(str).str.strip()
    if 'cups' in costos.columns:
        costos['cups'] = costos['cups'].astype(str).str.strip()
    return costos, nt


def derive_nt_map(nt: pd.DataFrame) -> pd.DataFrame:
    """Deriva nt_map desde tblNT replicando EXACTAMENTE el SQL de extraer_datos_dashboards.py.

    Reglas (idénticas al SQL del JSON, para que los matchs coincidan 1:1):
      Primera pasada (siempre):
        - Si convenio termina en " / SUBSIDIADO"  -> nombre_convenio = convenio sin sufijo
        - sino                                    -> nombre_convenio = convenio tal cual
      Segunda pasada (solo si termina " / SUBSIDIADO"):
        - nombre_convenio = REPLACE(REPLACE(convenio,' / SUBSIDIADO',''),' CONTRIBUTIVO',' SUBSIDIADO')

    Esto produce dos filas para los convenios duplex (X CONTRIBUTIVO / SUBSIDIADO):
       1) "X CONTRIBUTIVO"      (machea costos.nombre_convenio = "X CONTRIBUTIVO")
       2) "X SUBSIDIADO"        (machea costos.nombre_convenio = "X SUBSIDIADO")

    Clave de lookup = nombre_convenio | cups  (sin regimen — alineado con SQL).
    """
    print('      Derivando tblNTMap (reglas del JSON: split exacto y matching por nombre completo)...')
    rows: list[dict] = []
    for r in nt.itertuples(index=False):
        conv = (str(r.convenio) if r.convenio is not None else '').strip().upper()
        if not conv:
            continue
        cups = str(r.cups).strip() if r.cups is not None else ''
        if not cups or cups.upper() == 'NAN':
            continue
        costo = float(r.costo_medio_evento or 0)
        n_ev = float(r.n_eventos_mes or 0)
        desc = (str(r.descripcion) if r.descripcion is not None else '').strip()

        # Primera pasada
        if conv.endswith(' / SUBSIDIADO'):
            nc1 = conv[: -len(' / SUBSIDIADO')].strip()
        else:
            nc1 = conv
        rows.append({'nombre_convenio': nc1, 'cups': cups, 'meta_mes': n_ev,
                     'costo_medio': costo, 'descripcion': desc})

        # Segunda pasada (solo duplex)
        if conv.endswith(' / SUBSIDIADO'):
            nc2 = conv[: -len(' / SUBSIDIADO')].strip()
            nc2 = nc2.replace(' CONTRIBUTIVO', ' SUBSIDIADO')
            if nc2 != nc1:
                rows.append({'nombre_convenio': nc2, 'cups': cups, 'meta_mes': n_ev,
                             'costo_medio': costo, 'descripcion': desc})

    df = pd.DataFrame(rows)
    df['key'] = df['nombre_convenio'] + '|' + df['cups']
    df = df.drop_duplicates(subset=['key'], keep='first').reset_index(drop=True)
    print(f'      tblNTMap derivado: {len(df):,} filas')
    return df


def derive_ntmap_meses(costos: pd.DataFrame, ntmap: pd.DataFrame) -> pd.DataFrame:
    """Para cada par (nombre_convenio, cups) en ntmap, cuenta cuántos meses distintos
    hay en costos con funcionalidad='CONSULTA' (replica el COUNT(DISTINCT ...) del JSON).
    Añade columnas `meses_observados` y `meta_periodo = meta_mes * meses_observados`.
    """
    print('      Calculando meses_observados y meta_periodo de tblNTMap...')
    fc = pd.to_datetime(costos.get('fecha_cita'), errors='coerce')
    func = costos.get('funcionalidad', pd.Series([''] * len(costos))).astype(str).str.strip().str.upper()
    mask = (func == 'CONSULTA') & fc.notna()

    sub = pd.DataFrame({
        'nombre_convenio': costos.loc[mask, 'nombre_convenio'].astype(str).str.strip().str.upper(),
        'cups': costos.loc[mask, 'cups'].astype(str).str.strip(),
        'mes_key': fc[mask].dt.strftime('%Y-%m'),
    })
    meses = sub.groupby(['nombre_convenio', 'cups'])['mes_key'].nunique().to_dict()

    df = ntmap.copy()
    df['meses_observados'] = df.apply(
        lambda r: int(meses.get((str(r['nombre_convenio']).strip().upper(),
                                  str(r['cups']).strip()), 0)),
        axis=1,
    )
    df['meta_periodo'] = (df['meta_mes'] * df['meses_observados']).astype('int64')
    print(f'      meta_periodo total: {df["meta_periodo"].sum():,}  ({(df["meses_observados"]>0).sum()} pares con meses>0)')
    return df


def derive_costos_calc(costos: pd.DataFrame, ntmap: pd.DataFrame) -> pd.DataFrame:
    """Precomputa columnas calculadas de tblCostos como valores.

    Reglas alineadas al SQL del extractor_datos_dashboards.py (fuente de verdad):
      - oportunidad_dias: solo cuando fecha_deseada NOT NULL y fecha_cita >= fecha_deseada;
        sino vacío (no 0, para que AVERAGE/MEDIAN/COUNT no lo cuenten).
      - cumplida_flag:    1 si estado_consulta = 'CUMPLIDA'.
      - con_estado_flag:  1 si estado_consulta NOT NULL/'' (denominador correcto).
      - consulta_flag:    1 si funcionalidad = 'CONSULTA' (filtro de scope del workbook).
      - nt_lookup_key:    UPPER(nombre_convenio) | cups   (SIN regimen — alineado con JSON).
      - nt_costo_unit:    lookup de tblNTMap.costo_unitario por clave.
      - nt_costo_total:   = nt_costo_unit (no se multiplica por cumplida — alineado con JSON).
    """
    print('      Precomputando columnas calculadas de tblCostos (alineadas al JSON)...')
    df = costos.copy()

    fc = pd.to_datetime(df.get('fecha_cita'), errors='coerce')
    fd = pd.to_datetime(df.get('fecha_deseada'), errors='coerce')

    df['mes_key'] = fc.dt.strftime('%Y-%m').fillna('')

    diff = (fc - fd).dt.days
    # vacio cuando no es valido (fecha_deseada null o fecha_cita < fecha_deseada)
    valid_opo = fd.notna() & (diff >= 0)
    df['oportunidad_dias'] = diff.where(valid_opo, other=pd.NA)

    estado = df.get('estado_consulta', pd.Series([''] * len(df)))
    estado_norm = estado.astype(str).str.strip().str.upper()
    df['cumplida_flag']   = (estado_norm == 'CUMPLIDA').astype('int64')
    df['con_estado_flag'] = (estado.notna() & (estado_norm != '') & (estado_norm != 'NAN')).astype('int64')

    func = df.get('funcionalidad', pd.Series([''] * len(df))).astype(str).str.strip().str.upper()
    df['consulta_flag'] = (func == 'CONSULTA').astype('int64')

    conv = df.get('nombre_convenio', pd.Series([''] * len(df))).astype(str).str.strip().str.upper()
    cups = df.get('cups', pd.Series([''] * len(df))).astype(str).str.strip()
    df['nt_lookup_key'] = conv + '|' + cups

    lookup = dict(zip(ntmap['key'].astype(str), ntmap['costo_medio'].astype(float)))
    df['nt_costo_unit'] = df['nt_lookup_key'].map(lookup).fillna(0.0)
    df['nt_costo_total'] = df['nt_costo_unit']

    n_match = int((df['nt_costo_unit'] > 0).sum())
    n_match_consulta = int(((df['nt_costo_unit'] > 0) & (df['consulta_flag'] == 1)).sum())
    print(f'      Filas con match NT: {n_match:,}  (de ellas CONSULTA: {n_match_consulta:,})')
    return df


# ════════════════════════════════════════════════════════════════
#  FORMATOS
# ════════════════════════════════════════════════════════════════
def build_formats(wb: xlsxwriter.Workbook) -> dict[str, object]:
    F: dict[str, object] = {}
    F['title']    = wb.add_format({'bold': True, 'font_size': 18, 'font_color': NAVY,
                                   'align': 'left', 'valign': 'vcenter'})
    F['subtitle'] = wb.add_format({'italic': True, 'font_size': 9, 'font_color': '#42474E'})
    F['section']  = wb.add_format({'bold': True, 'font_size': 11, 'font_color': 'white',
                                   'bg_color': NAVY, 'align': 'left', 'valign': 'vcenter',
                                   'indent': 1})
    F['kpi_label'] = wb.add_format({'bold': True, 'font_size': 8, 'font_color': '#42474E',
                                    'bg_color': LIGHT, 'align': 'center', 'valign': 'vcenter',
                                    'top': 2, 'top_color': TURQ, 'left': 1, 'right': 1,
                                    'left_color': GRID, 'right_color': GRID})
    F['kpi_value_num'] = wb.add_format({'bold': True, 'font_size': 18, 'font_color': NAVY,
                                        'bg_color': LIGHT, 'align': 'center', 'valign': 'vcenter',
                                        'num_format': '#,##0', 'left': 1, 'right': 1,
                                        'left_color': GRID, 'right_color': GRID})
    F['kpi_value_pct'] = wb.add_format({'bold': True, 'font_size': 18, 'font_color': NAVY,
                                        'bg_color': LIGHT, 'align': 'center', 'valign': 'vcenter',
                                        'num_format': '0.0%', 'left': 1, 'right': 1,
                                        'left_color': GRID, 'right_color': GRID})
    F['kpi_value_curr'] = wb.add_format({'bold': True, 'font_size': 18, 'font_color': NAVY,
                                         'bg_color': LIGHT, 'align': 'center', 'valign': 'vcenter',
                                         'num_format': '"$"#,##0.0,,"M"', 'left': 1, 'right': 1,
                                         'left_color': GRID, 'right_color': GRID})
    F['kpi_value_days'] = wb.add_format({'bold': True, 'font_size': 18, 'font_color': NAVY,
                                         'bg_color': LIGHT, 'align': 'center', 'valign': 'vcenter',
                                         'num_format': '0.0" días"', 'left': 1, 'right': 1,
                                         'left_color': GRID, 'right_color': GRID})
    F['kpi_caption'] = wb.add_format({'italic': True, 'font_size': 8, 'font_color': '#5F6368',
                                      'bg_color': LIGHT, 'align': 'center', 'valign': 'vcenter',
                                      'bottom': 1, 'left': 1, 'right': 1,
                                      'bottom_color': GRID, 'left_color': GRID, 'right_color': GRID,
                                      'text_wrap': True})
    F['th'] = wb.add_format({'bold': True, 'font_size': 9, 'font_color': 'white',
                             'bg_color': NAVY, 'align': 'center', 'valign': 'vcenter',
                             'border': 1, 'border_color': NAVY, 'text_wrap': True})
    F['td_text'] = wb.add_format({'font_size': 10, 'align': 'left', 'valign': 'vcenter',
                                  'border': 1, 'border_color': GRID})
    F['td_num']  = wb.add_format({'font_size': 10, 'align': 'right', 'valign': 'vcenter',
                                  'num_format': '#,##0', 'border': 1, 'border_color': GRID})
    F['td_pct']  = wb.add_format({'font_size': 10, 'align': 'right', 'valign': 'vcenter',
                                  'num_format': '0.0%', 'border': 1, 'border_color': GRID})
    F['td_curr'] = wb.add_format({'font_size': 10, 'align': 'right', 'valign': 'vcenter',
                                  'num_format': '"$"#,##0.0,,"M"', 'border': 1, 'border_color': GRID})
    F['td_days'] = wb.add_format({'font_size': 10, 'align': 'right', 'valign': 'vcenter',
                                  'num_format': '0.0', 'border': 1, 'border_color': GRID})
    F['note'] = wb.add_format({'italic': True, 'font_size': 8, 'font_color': '#5F6368',
                               'align': 'left'})
    F['formula_tag'] = wb.add_format({'italic': True, 'font_size': 8, 'font_color': TURQ,
                                      'align': 'left'})
    F['data_date'] = wb.add_format({'num_format': 'yyyy-mm-dd', 'font_size': 9})
    return F


# ════════════════════════════════════════════════════════════════
#  HOJAS DE DATOS (tablas Excel reales)
# ════════════════════════════════════════════════════════════════
COSTOS_HEADERS = [
    'id', 'fuente', 'codigo_origen', 'fecha_cita', 'hora_cita', 'fecha_deseada',
    'fecha_asig', 'tipo_documento', 'identificacion', 'nombre', 'sexo',
    'idsoft_medico', 'id_medico', 'nombre_medico', 'especialidad', 'pym',
    'procedimiento_especifico', 'grupo', 'cie10_dxppal', 'tipo_cita',
    'valor_recuperacion', 'costo_servicio', 'funcionalidad', 'tipo_agenda',
    'estado_autorizacion', 'estado_consulta', 'nombre_usuario_asignacion',
    'proceso_cita', 'nombre_convenio', 'regimen', 'nombre_sede', 'cups',
    'tipo_servicio', 'grupo_especialidad', 'nombre_mpio',
    'entidad_administradora', 'fecha_carga',
]
# Columnas calculadas que se agregan al final de tblCostos.
# Antes eran fórmulas Excel aplicadas a cada fila (344K × 6 = ~2M fórmulas) y
# corrompían sheet7.xml + table1.xml al abrir. Ahora se precomputan en pandas
# (derive_costos_calc) y se escriben como valores. Los dashboards las usan
# por nombre con tblCostos[col_name] -> el comportamiento visible no cambia.
COSTOS_CALC_HEADERS = [
    'mes_key',
    'oportunidad_dias',
    'cumplida_flag',
    'con_estado_flag',
    'consulta_flag',
    'nt_lookup_key',
    'nt_costo_unit',
    'nt_costo_total',
]

NT_HEADERS = ['id', 'convenio', 'cups', 'descripcion', 'n_eventos_mes',
              'eventos_ano', 'fu', 'costo_medio_evento', 'programa',
              'fecha_de_nt', 'centro_de_costo', 'unidad_de_costo']

NTMAP_HEADERS = ['nombre_convenio', 'cups', 'descripcion', 'meta_mes',
                 'costo_medio', 'meses_observados', 'meta_periodo', 'key']


def write_data_costos(wb: xlsxwriter.Workbook, F: dict, df: pd.DataFrame) -> None:
    print('      Escribiendo data_costos (tblCostos)...')
    ws = wb.add_worksheet('data_costos')
    ws.set_tab_color(NAVY)
    n = len(df)
    n_base = len(COSTOS_HEADERS)
    n_total = n_base + len(COSTOS_CALC_HEADERS)

    # Encabezados
    headers = COSTOS_HEADERS + COSTOS_CALC_HEADERS
    for c, h in enumerate(headers):
        ws.write(0, c, h, F['th'])

    # Datos base — escribimos por columnas tipadas
    date_cols = {'fecha_cita', 'fecha_deseada', 'fecha_asig', 'fecha_carga'}
    num_cols = {'valor_recuperacion', 'costo_servicio'}
    for c, h in enumerate(COSTOS_HEADERS):
        if h not in df.columns:
            continue
        col = df[h]
        if h in date_cols:
            for r, v in enumerate(col, start=1):
                if pd.notna(v):
                    ws.write_datetime(r, c, v.to_pydatetime() if hasattr(v, 'to_pydatetime') else v, F['data_date'])
        elif h in num_cols:
            for r, v in enumerate(col, start=1):
                ws.write_number(r, c, float(v) if pd.notna(v) else 0)
        else:
            for r, v in enumerate(col, start=1):
                ws.write(r, c, '' if pd.isna(v) else v)

    # Columnas calculadas — valores precomputados en pandas (no fórmulas)
    int_cols  = {'cumplida_flag', 'con_estado_flag', 'consulta_flag'}
    num_cols2 = {'nt_costo_unit', 'nt_costo_total'}
    opo_col   = 'oportunidad_dias'
    for j, h in enumerate(COSTOS_CALC_HEADERS):
        c = n_base + j
        if h not in df.columns:
            continue
        col = df[h]
        if h == opo_col:
            # Vacío (no 0) cuando la oportunidad no es válida → AVERAGE/MEDIAN/COUNT lo ignoran.
            for r, v in enumerate(col, start=1):
                if pd.isna(v):
                    ws.write_blank(r, c, None)
                else:
                    ws.write_number(r, c, float(v))
        elif h in int_cols:
            for r, v in enumerate(col, start=1):
                ws.write_number(r, c, int(v) if pd.notna(v) else 0)
        elif h in num_cols2:
            for r, v in enumerate(col, start=1):
                ws.write_number(r, c, float(v) if pd.notna(v) else 0)
        else:
            for r, v in enumerate(col, start=1):
                ws.write(r, c, '' if pd.isna(v) else v)

    # Tabla (sin fórmulas en columnas: las celdas ya tienen valores)
    last_col_letter = xlsxwriter.utility.xl_col_to_name(n_total - 1)
    table_range = f'A1:{last_col_letter}{n + 1}'
    columns_spec = [{'header': h} for h in headers]
    ws.add_table(table_range, {
        'name': 'tblCostos',
        'style': 'Table Style Medium 2',
        'columns': columns_spec,
    })

    # Anchos
    ws.set_column('A:A', 6)
    ws.set_column('D:D', 11)
    ws.set_column('F:G', 11)
    ws.set_column('O:O', 18)
    ws.set_column('U:V', 12)
    ws.set_column('AC:AC', 26)
    ws.set_column('AE:AE', 22)
    ws.set_column('AF:AF', 9)
    ws.set_column(n_base, n_total - 1, 14)
    ws.freeze_panes(1, 0)


def write_data_nt(wb: xlsxwriter.Workbook, F: dict, df: pd.DataFrame) -> None:
    print('      Escribiendo data_nt (tblNT)...')
    ws = wb.add_worksheet('data_nt')
    ws.set_tab_color(TURQ)
    n = len(df)
    for c, h in enumerate(NT_HEADERS):
        ws.write(0, c, h, F['th'])
    date_cols = {'fecha_de_nt'}
    num_cols = {'n_eventos_mes', 'eventos_ano', 'costo_medio_evento'}
    for c, h in enumerate(NT_HEADERS):
        if h not in df.columns:
            continue
        col = df[h]
        if h in date_cols:
            for r, v in enumerate(col, start=1):
                if pd.notna(v):
                    try:
                        ws.write_datetime(r, c, v.to_pydatetime() if hasattr(v, 'to_pydatetime') else v, F['data_date'])
                    except Exception:
                        ws.write(r, c, str(v))
        elif h in num_cols:
            for r, v in enumerate(col, start=1):
                ws.write_number(r, c, float(v) if pd.notna(v) else 0)
        else:
            for r, v in enumerate(col, start=1):
                ws.write(r, c, '' if pd.isna(v) else v)
    last_col = xlsxwriter.utility.xl_col_to_name(len(NT_HEADERS) - 1)
    ws.add_table(f'A1:{last_col}{n + 1}', {
        'name': 'tblNT',
        'style': 'Table Style Medium 4',
        'columns': [{'header': h} for h in NT_HEADERS],
    })
    ws.set_column('B:B', 38)
    ws.set_column('D:D', 36)
    ws.set_column('H:H', 14)
    ws.set_column('I:I', 24)
    ws.freeze_panes(1, 0)


def write_nt_map(wb: xlsxwriter.Workbook, F: dict, df: pd.DataFrame) -> None:
    print('      Escribiendo nt_map (tblNTMap — derivado)...')
    ws = wb.add_worksheet('nt_map')
    ws.set_tab_color(GREEN)
    # Nota explicando la derivación
    ws.merge_range('A1:H1',
                   'tblNTMap — derivado de tblNT por reglas (ver README)',
                   F['section'])
    n = len(df)
    for c, h in enumerate(NTMAP_HEADERS):
        ws.write(2, c, h, F['th'])
    num_cols = {'meta_mes', 'costo_medio', 'meses_observados', 'meta_periodo'}
    for c, h in enumerate(NTMAP_HEADERS):
        if h not in df.columns:
            continue
        col = df[h]
        for r, v in enumerate(col, start=3):
            if h in num_cols:
                ws.write_number(r, c, float(v) if pd.notna(v) else 0)
            else:
                ws.write(r, c, '' if pd.isna(v) else v)
    last_col = xlsxwriter.utility.xl_col_to_name(len(NTMAP_HEADERS) - 1)
    ws.add_table(f'A3:{last_col}{n + 3}', {
        'name': 'tblNTMap',
        'style': 'Table Style Medium 5',
        'columns': [{'header': h} for h in NTMAP_HEADERS],
    })
    ws.set_column('A:A', 38)   # nombre_convenio
    ws.set_column('B:B', 12)   # cups
    ws.set_column('C:C', 50)   # descripcion
    ws.set_column('D:D', 12)   # meta_mes
    ws.set_column('E:E', 14)   # costo_medio
    ws.set_column('F:F', 16)   # meses_observados
    ws.set_column('G:G', 16)   # meta_periodo
    ws.set_column('H:H', 50)   # key
    ws.freeze_panes(3, 0)


# ════════════════════════════════════════════════════════════════
#  HELPERS DASHBOARD
# ════════════════════════════════════════════════════════════════
def kpi_card(ws, row, col, label, formula, value_fmt, caption, F, col_span=3):
    """Renderiza un KPI card. `formula` es la fórmula Excel (string sin '=' inicial)."""
    ws.merge_range(row, col, row, col + col_span - 1, label, F['kpi_label'])
    ws.set_row(row, 22)
    ws.merge_range(row + 1, col, row + 1, col + col_span - 1, '', value_fmt)
    ws.write_formula(row + 1, col, formula, value_fmt)
    ws.set_row(row + 1, 42)
    ws.merge_range(row + 2, col, row + 2, col + col_span - 1, caption, F['kpi_caption'])
    ws.set_row(row + 2, 26)


# ════════════════════════════════════════════════════════════════
#  DASHBOARD 1 — RESUMEN GERENCIAL
# ════════════════════════════════════════════════════════════════
def write_resumen(wb, F):
    print('      Escribiendo dashboard 1 (Resumen Gerencial)...')
    ws = wb.add_worksheet('1 · Resumen Gerencial')
    ws.set_tab_color('#1F8E8E')

    ws.merge_range('A1:N1', 'Dashboard 1 · Resumen Gerencial', F['title'])
    ws.merge_range('A2:N2',
                   'Scope: solo CONSULTAS (consulta_flag=1). Cumplimiento usa con_estado_flag como denominador.',
                   F['subtitle'])
    ws.set_row(0, 28)

    ws.merge_range('A4:N4', '  KPIs principales', F['section'])
    ws.set_row(3, 22)

    # KPIs (todos fórmulas)
    kpi_card(ws, 5, 0, 'CUMPLIMIENTO GLOBAL',
             '=IFERROR(SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[cumplida_flag]=1))'
             '/SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[con_estado_flag]=1)),0)',
             F['kpi_value_pct'],
             'CUMPLIDAS / CON ESTADO (solo CONSULTAS)', F, 3)
    kpi_card(ws, 5, 3, 'CITAS CUMPLIDAS',
             '=SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[cumplida_flag]=1))',
             F['kpi_value_num'],
             'estado=CUMPLIDA y funcionalidad=CONSULTA', F, 3)
    kpi_card(ws, 5, 6, 'RECUPERACIÓN',
             '=SUMIFS(tblCostos[valor_recuperacion],tblCostos[consulta_flag],1)',
             F['kpi_value_curr'],
             'SUM(valor_recuperacion) en CONSULTAS', F, 3)
    kpi_card(ws, 5, 9, 'OPORTUNIDAD PROM.',
             '=IFERROR(AVERAGEIFS(tblCostos[oportunidad_dias],tblCostos[consulta_flag],1),0)',
             F['kpi_value_days'],
             'AVG(fecha_cita-fecha_deseada) válidas, CONSULTAS', F, 3)

    # Evolución mensual — tabla calculada
    ws.merge_range('A11:F11', '  Evolución mensual de consultas', F['section'])
    ws.set_row(10, 22)
    headers = ['mes', 'consultas', 'cumplidas', '% cumplim.', 'recuperación', 'oportunidad prom.']
    for c, h in enumerate(headers):
        ws.write(12, c, h, F['th'])

    meses = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
    for i, mes in enumerate(meses):
        r = 13 + i
        ws.write(r, 0, mes, F['td_text'])
        ws.write_formula(r, 1,
                         f'=COUNTIFS(tblCostos[mes_key],$A{r + 1},tblCostos[consulta_flag],1)',
                         F['td_num'])
        ws.write_formula(r, 2,
                         f'=SUMIFS(tblCostos[cumplida_flag],tblCostos[mes_key],$A{r + 1},tblCostos[consulta_flag],1)',
                         F['td_num'])
        ws.write_formula(r, 3,
                         f'=IFERROR(C{r + 1}/SUMIFS(tblCostos[con_estado_flag],tblCostos[mes_key],$A{r + 1},tblCostos[consulta_flag],1),0)',
                         F['td_pct'])
        ws.write_formula(r, 4,
                         f'=SUMIFS(tblCostos[valor_recuperacion],tblCostos[mes_key],$A{r + 1},tblCostos[consulta_flag],1)',
                         F['td_curr'])
        ws.write_formula(r, 5,
                         f'=IFERROR(AVERAGEIFS(tblCostos[oportunidad_dias],tblCostos[mes_key],$A{r + 1},tblCostos[consulta_flag],1),0)',
                         F['td_days'])

    # Chart evolución
    ch = wb.add_chart({'type': 'column'})
    ch.add_series({
        'name': 'Consultas',
        'categories': ['1 · Resumen Gerencial', 13, 0, 12 + len(meses), 0],
        'values':     ['1 · Resumen Gerencial', 13, 1, 12 + len(meses), 1],
        'fill': {'color': NAVY}, 'border': {'color': NAVY},
    })
    ch.add_series({
        'name': 'Cumplidas',
        'categories': ['1 · Resumen Gerencial', 13, 0, 12 + len(meses), 0],
        'values':     ['1 · Resumen Gerencial', 13, 2, 12 + len(meses), 2],
        'fill': {'color': TURQ}, 'border': {'color': TURQ},
    })
    ch.set_title({'name': 'Evolución mensual de CONSULTAS'})
    ch.set_y_axis({'major_gridlines': {'visible': True, 'line': {'color': GRID}}})
    ch.set_legend({'position': 'bottom'})
    ch.set_size({'width': 580, 'height': 280})
    ws.insert_chart('H13', ch)

    # Cumplimiento por convenio (top 25 por volumen de CONSULTAS) — UNIQUE + COUNTIFS
    ws.merge_range('A22:F22', '  Cumplimiento por convenio (top 25 por volumen de consultas)', F['section'])
    ws.set_row(21, 22)
    for c, h in enumerate(['convenio', 'régimen', 'consultas', 'cumplidas', '% cumplim.', 'en riesgo']):
        ws.write(23, c, h, F['th'])

    # Lista dinámica de pares convenio+régimen únicos, ordenados por volumen DESC (solo consultas).
    ws.write_dynamic_array_formula(
        24, 0, 48, 1,
        '=IFERROR(INDEX(SORTBY(UNIQUE(FILTER(tblCostos[[nombre_convenio]:[regimen]],tblCostos[consulta_flag]=1)),'
        'COUNTIFS(tblCostos[nombre_convenio],INDEX(UNIQUE(FILTER(tblCostos[[nombre_convenio]:[regimen]],tblCostos[consulta_flag]=1)),,1),'
        'tblCostos[regimen],INDEX(UNIQUE(FILTER(tblCostos[[nombre_convenio]:[regimen]],tblCostos[consulta_flag]=1)),,2),'
        'tblCostos[consulta_flag],1),-1),SEQUENCE(25),{1,2}),"")',
        F['td_text'],
    )
    for i in range(25):
        r = 24 + i
        ws.write_formula(r, 2,
                         f'=IF(A{r + 1}="","",COUNTIFS(tblCostos[nombre_convenio],A{r + 1},tblCostos[regimen],B{r + 1},tblCostos[consulta_flag],1))',
                         F['td_num'])
        ws.write_formula(r, 3,
                         f'=IF(A{r + 1}="","",SUMIFS(tblCostos[cumplida_flag],tblCostos[nombre_convenio],A{r + 1},tblCostos[regimen],B{r + 1},tblCostos[consulta_flag],1))',
                         F['td_num'])
        ws.write_formula(r, 4,
                         f'=IFERROR(D{r + 1}/SUMIFS(tblCostos[con_estado_flag],tblCostos[nombre_convenio],A{r + 1},tblCostos[regimen],B{r + 1},tblCostos[consulta_flag],1),0)',
                         F['td_pct'])
        ws.write_formula(r, 5,
                         f'=IF(AND(C{r + 1}>100,E{r + 1}<0.7),"⚠ RIESGO","")',
                         F['td_text'])

    # Formato condicional sobre % cumplim
    ws.conditional_format(24, 4, 48, 4, {
        'type': '3_color_scale',
        'min_color': RED, 'mid_color': AMBER, 'max_color': GREEN,
        'min_type': 'num', 'min_value': 0,
        'mid_type': 'num', 'mid_value': 0.7,
        'max_type': 'num', 'max_value': 1,
    })

    # KPI derivado: convenios en riesgo (sobre consultas) — usa los pares listados en la tabla.
    ws.write(5, 12, 'CONVENIOS EN RIESGO', F['kpi_label'])
    ws.write_formula(6, 12,
                     '=SUMPRODUCT((C25:C49>100)*(E25:E49<0.7)*(E25:E49>0))',
                     F['kpi_value_num'])
    ws.write(7, 12, '<70% cumplim. y >100 consultas (top 25)', F['kpi_caption'])
    ws.set_row(6, 42)
    ws.set_row(7, 26)

    # Anchos
    ws.set_column('A:A', 38); ws.set_column('B:B', 14); ws.set_column('C:E', 12)
    ws.set_column('F:F', 14); ws.set_column('G:G', 14)
    ws.set_column('M:N', 22)


# ════════════════════════════════════════════════════════════════
#  DASHBOARD 2 — EJECUCIÓN vs NT
# ════════════════════════════════════════════════════════════════
def write_ejec_nt(wb, F):
    print('      Escribiendo dashboard 2 (Ejecución vs NT)...')
    ws = wb.add_worksheet('2 · Ejecución vs NT')
    ws.set_tab_color('#1F8E8E')

    ws.merge_range('A1:N1', 'Dashboard 2 · Ejecución vs Nota Técnica', F['title'])
    ws.merge_range('A2:N2',
                   'Ejecutado = consultas con match NT (cualquier estado). '
                   'Meta = Σ meta_mes × meses_observados por par convenio+cups (alineado al JSON).',
                   F['subtitle'])
    ws.set_row(0, 28)

    ws.merge_range('A4:N4', '  KPI Cumplimiento vs NT', F['section'])
    ws.set_row(3, 22)

    # Ejecutado = consultas con NT match (cualquier estado) — alineado al SQL del JSON
    kpi_card(ws, 5, 0, 'EJECUTADO',
             '=SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))',
             F['kpi_value_num'],
             'Consultas con NT vigente (cualquier estado)', F, 3)
    # Meta acumulada = SUM(meta_periodo) — meta_mes × meses_observados (precalculado)
    kpi_card(ws, 5, 3, 'META PERIODO',
             '=SUM(tblNTMap[meta_periodo])',
             F['kpi_value_num'],
             'Σ meta_mes × meses_observados por par', F, 3)
    kpi_card(ws, 5, 6, '% CUMPLIMIENTO NT',
             '=IFERROR(SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))'
             '/SUM(tblNTMap[meta_periodo]),0)',
             F['kpi_value_pct'],
             'Ejecutado / Meta', F, 3)
    kpi_card(ws, 5, 9, 'CITAS NT CUMPLIDAS',
             '=SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0)*(tblCostos[cumplida_flag]=1))',
             F['kpi_value_num'],
             'Consultas matched y estado=CUMPLIDA', F, 3)

    # Heatmap: convenio × top 8 CUPS (matriz por SUMIFS)
    ws.merge_range('A11:J11', '  Heatmap Convenio × Top 8 CUPS (% cumplimiento vs meta)', F['section'])
    ws.set_row(10, 22)

    # Top 8 CUPS de tblNTMap (con mayor meta_periodo)
    ws.write(12, 0, 'convenio', F['th'])
    ws.write_dynamic_array_formula(
        12, 1, 12, 8,
        '=TRANSPOSE(TAKE(SORTBY(UNIQUE(tblNTMap[cups]),'
        'SUMIFS(tblNTMap[meta_periodo],tblNTMap[cups],UNIQUE(tblNTMap[cups])),-1),8))',
        F['th'],
    )
    # Lista de convenios (top 20 de tblNTMap por meta_periodo)
    ws.write_dynamic_array_formula(
        13, 0, 32, 0,
        '=TAKE(SORTBY(UNIQUE(tblNTMap[nombre_convenio]),'
        'SUMIFS(tblNTMap[meta_periodo],tblNTMap[nombre_convenio],UNIQUE(tblNTMap[nombre_convenio])),-1),20)',
        F['td_text'],
    )
    # Matriz 20×8: % = ejecutado(consultas) / meta_periodo(NT)
    for i in range(20):
        for j in range(8):
            r = 13 + i
            cups_cell = xlsxwriter.utility.xl_rowcol_to_cell(12, 1 + j)
            ws.write_formula(
                r, 1 + j,
                f'=IFERROR(COUNTIFS(tblCostos[nombre_convenio],$A{r + 1},tblCostos[cups],{cups_cell},tblCostos[consulta_flag],1)'
                f'/SUMIFS(tblNTMap[meta_periodo],tblNTMap[nombre_convenio],$A{r + 1},tblNTMap[cups],{cups_cell}),"")',
                F['td_pct'],
            )

    # Color scale sobre la matriz
    ws.conditional_format(13, 1, 32, 8, {
        'type': '3_color_scale',
        'min_color': RED, 'mid_color': AMBER, 'max_color': GREEN,
        'min_type': 'num', 'min_value': 0,
        'mid_type': 'num', 'mid_value': 0.7,
        'max_type': 'num', 'max_value': 1.2,
    })

    ws.set_column('A:A', 38)
    ws.set_column('B:I', 12)
    ws.freeze_panes(13, 1)


# ════════════════════════════════════════════════════════════════
#  DASHBOARD 3 — ANÁLISIS FINANCIERO
# ════════════════════════════════════════════════════════════════
def write_financiero(wb, F):
    print('      Escribiendo dashboard 3 (Financiero)...')
    ws = wb.add_worksheet('3 · Análisis Financiero')
    ws.set_tab_color('#1F8E8E')

    ws.merge_range('A1:N1', 'Dashboard 3 · Análisis Financiero', F['title'])
    ws.merge_range('A2:N2',
                   'Costo real = Σ nt_costo_unit de consultas matched (cualquier estado, alineado al JSON). '
                   'Esperado = Σ meta_mes × costo × 5.',
                   F['subtitle'])
    ws.set_row(0, 28)

    ws.merge_range('A4:N4', '  KPIs Financieros', F['section'])
    ws.set_row(3, 22)

    kpi_card(ws, 5, 0, 'COSTO REAL EJECUTADO',
             '=SUMIFS(tblCostos[nt_costo_total],tblCostos[consulta_flag],1)',
             F['kpi_value_curr'],
             'Σ costo NT de consultas matched (cualquier estado)', F, 3)
    kpi_card(ws, 5, 3, 'COSTO ESPERADO NT',
             '=SUMPRODUCT(tblNTMap[meta_mes],tblNTMap[costo_medio])*5',
             F['kpi_value_curr'],
             'Σ meta × costo × 5 meses (alineado al JSON)', F, 3)
    kpi_card(ws, 5, 6, 'RECUPERACIÓN',
             '=SUMIFS(tblCostos[valor_recuperacion],tblCostos[consulta_flag],1)',
             F['kpi_value_curr'],
             'Σ valor_recuperacion en consultas', F, 3)
    kpi_card(ws, 5, 9, '% EFICIENCIA',
             '=IFERROR(SUMIFS(tblCostos[valor_recuperacion],tblCostos[consulta_flag],1)'
             '/SUMIFS(tblCostos[nt_costo_total],tblCostos[consulta_flag],1),0)',
             F['kpi_value_pct'],
             'Recuperación / Costo Real', F, 3)

    # Pareto Top 10 CUPS por costo real (en consultas)
    ws.merge_range('A11:E11', '  Pareto Top 10 CUPS por costo real (consultas)', F['section'])
    ws.set_row(10, 22)
    for c, h in enumerate(['cups', 'consultas matched', 'costo real', '% acum']):
        ws.write(12, c, h, F['th'])

    # Top 10 CUPS por SUMIFS(nt_costo_total, consulta=1)
    ws.write_dynamic_array_formula(
        13, 0, 22, 0,
        '=TAKE(SORTBY(UNIQUE(FILTER(tblCostos[cups],(tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))),'
        'SUMIFS(tblCostos[nt_costo_total],tblCostos[cups],'
        'UNIQUE(FILTER(tblCostos[cups],(tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))),'
        'tblCostos[consulta_flag],1),-1),10)',
        F['td_text'],
    )
    for i in range(10):
        r = 13 + i
        ws.write_formula(r, 1,
                         f'=IF(A{r + 1}="","",SUMPRODUCT((tblCostos[consulta_flag]=1)*(tblCostos[cups]=A{r + 1})*(tblCostos[nt_costo_unit]>0)))',
                         F['td_num'])
        ws.write_formula(r, 2,
                         f'=IF(A{r + 1}="","",SUMIFS(tblCostos[nt_costo_total],tblCostos[cups],A{r + 1},tblCostos[consulta_flag],1))',
                         F['td_curr'])
        ws.write_formula(r, 3,
                         f'=IFERROR(SUM($C$14:C{r + 1})/SUMIFS(tblCostos[nt_costo_total],tblCostos[consulta_flag],1),0)',
                         F['td_pct'])

    ws.conditional_format(13, 2, 22, 2, {'type': 'data_bar', 'bar_color': NAVY})

    # Chart Pareto
    ch = wb.add_chart({'type': 'column'})
    ch.add_series({
        'name': 'Costo real',
        'categories': ['3 · Análisis Financiero', 13, 0, 22, 0],
        'values':     ['3 · Análisis Financiero', 13, 2, 22, 2],
        'fill': {'color': NAVY},
    })
    ch.set_title({'name': 'Pareto costo real por CUPS (consultas)'})
    ch.set_y_axis({'num_format': '"$"#,##0,,"M"'})
    ch.set_legend({'none': True})
    ch.set_size({'width': 560, 'height': 320})
    ws.insert_chart('F13', ch)

    # Costo por convenio (top 10 en consultas)
    ws.merge_range('A25:E25', '  Top 10 Convenios por costo real (consultas)', F['section'])
    ws.set_row(24, 22)
    for c, h in enumerate(['convenio', 'régimen', 'consultas matched', 'costo real', 'recuperación']):
        ws.write(26, c, h, F['th'])

    ws.write_dynamic_array_formula(
        27, 0, 36, 1,
        '=IFERROR(INDEX(SORTBY(UNIQUE(FILTER(tblCostos[[nombre_convenio]:[regimen]],(tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))),'
        'SUMIFS(tblCostos[nt_costo_total],tblCostos[nombre_convenio],'
        'INDEX(UNIQUE(FILTER(tblCostos[[nombre_convenio]:[regimen]],(tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))),,1),'
        'tblCostos[regimen],INDEX(UNIQUE(FILTER(tblCostos[[nombre_convenio]:[regimen]],(tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0))),,2),'
        'tblCostos[consulta_flag],1),-1),SEQUENCE(10),{1,2}),"")',
        F['td_text'],
    )
    for i in range(10):
        r = 27 + i
        ws.write_formula(r, 2,
                         f'=IF(A{r + 1}="","",SUMPRODUCT((tblCostos[nombre_convenio]=A{r + 1})*(tblCostos[regimen]=B{r + 1})*(tblCostos[consulta_flag]=1)*(tblCostos[nt_costo_unit]>0)))',
                         F['td_num'])
        ws.write_formula(r, 3,
                         f'=IF(A{r + 1}="","",SUMIFS(tblCostos[nt_costo_total],'
                         f'tblCostos[nombre_convenio],A{r + 1},tblCostos[regimen],B{r + 1},tblCostos[consulta_flag],1))',
                         F['td_curr'])
        ws.write_formula(r, 4,
                         f'=IF(A{r + 1}="","",SUMIFS(tblCostos[valor_recuperacion],'
                         f'tblCostos[nombre_convenio],A{r + 1},tblCostos[regimen],B{r + 1},tblCostos[consulta_flag],1))',
                         F['td_curr'])

    ws.set_column('A:A', 38); ws.set_column('B:B', 14); ws.set_column('C:E', 16)


# ════════════════════════════════════════════════════════════════
#  DASHBOARD 4 — CALIDAD Y OPORTUNIDAD
# ════════════════════════════════════════════════════════════════
def write_calidad(wb, F):
    print('      Escribiendo dashboard 4 (Calidad)...')
    ws = wb.add_worksheet('4 · Calidad y Oportunidad')
    ws.set_tab_color('#1F8E8E')

    ws.merge_range('A1:N1', 'Dashboard 4 · Calidad y Oportunidad', F['title'])
    ws.merge_range('A2:N2',
                   'Scope: solo CONSULTAS. Oportunidad = fecha_cita-fecha_deseada (válidas). '
                   '% inasistencia usa estado_consulta = INCUMPLIDA.',
                   F['subtitle'])
    ws.set_row(0, 28)

    ws.merge_range('A4:N4', '  KPIs de calidad', F['section'])
    ws.set_row(3, 22)

    kpi_card(ws, 5, 0, 'OPORTUNIDAD PROM.',
             '=IFERROR(AVERAGEIFS(tblCostos[oportunidad_dias],tblCostos[consulta_flag],1),0)',
             F['kpi_value_days'],
             'AVG(oportunidad_dias válidas, consultas)', F, 3)
    # MEDIAN no admite IFS directo; usamos fórmula matricial (CSE no necesario en 365).
    kpi_card(ws, 5, 3, 'OPORTUNIDAD MEDIANA',
             '=IFERROR(MEDIAN(IF((tblCostos[consulta_flag]=1)*(ISNUMBER(tblCostos[oportunidad_dias])),tblCostos[oportunidad_dias])),0)',
             F['kpi_value_days'], 'MEDIAN de consultas válidas', F, 3)
    kpi_card(ws, 5, 6, '% CITAS CON DEMORA',
             '=IFERROR(COUNTIFS(tblCostos[consulta_flag],1,tblCostos[oportunidad_dias],">3")'
             '/COUNTIFS(tblCostos[consulta_flag],1,tblCostos[oportunidad_dias],">=0"),0)',
             F['kpi_value_pct'], 'Oportunidad > 3 días sobre consultas válidas', F, 3)
    kpi_card(ws, 5, 9, '% INASISTENCIA',
             '=IFERROR(COUNTIFS(tblCostos[consulta_flag],1,tblCostos[estado_consulta],"INCUMPLIDA")'
             '/SUMIFS(tblCostos[con_estado_flag],tblCostos[consulta_flag],1),0)',
             F['kpi_value_pct'], 'INCUMPLIDA / consultas con estado', F, 3)

    # Oportunidad por especialidad — top 15 por volumen de consultas
    ws.merge_range('A11:D11', '  Oportunidad por especialidad (top 15)', F['section'])
    ws.set_row(10, 22)
    for c, h in enumerate(['especialidad', 'consultas', 'oportunidad prom.', '% demora']):
        ws.write(12, c, h, F['th'])

    ws.write_dynamic_array_formula(
        13, 0, 27, 0,
        '=TAKE(SORTBY(UNIQUE(FILTER(tblCostos[especialidad],tblCostos[consulta_flag]=1)),'
        'COUNTIFS(tblCostos[especialidad],UNIQUE(FILTER(tblCostos[especialidad],tblCostos[consulta_flag]=1)),tblCostos[consulta_flag],1),-1),15)',
        F['td_text'],
    )
    for i in range(15):
        r = 13 + i
        ws.write_formula(r, 1,
                         f'=IF(A{r + 1}="","",COUNTIFS(tblCostos[especialidad],A{r + 1},tblCostos[consulta_flag],1))', F['td_num'])
        ws.write_formula(r, 2,
                         f'=IFERROR(AVERAGEIFS(tblCostos[oportunidad_dias],tblCostos[especialidad],A{r + 1},tblCostos[consulta_flag],1),0)',
                         F['td_days'])
        ws.write_formula(r, 3,
                         f'=IFERROR(COUNTIFS(tblCostos[especialidad],A{r + 1},tblCostos[consulta_flag],1,tblCostos[oportunidad_dias],">3")'
                         f'/COUNTIFS(tblCostos[especialidad],A{r + 1},tblCostos[consulta_flag],1,tblCostos[oportunidad_dias],">=0"),0)', F['td_pct'])

    ws.conditional_format(13, 2, 27, 2, {
        'type': '3_color_scale',
        'min_color': GREEN, 'mid_color': AMBER, 'max_color': RED,
        'min_type': 'num', 'min_value': 0,
        'mid_type': 'num', 'mid_value': 5,
        'max_type': 'num', 'max_value': 15,
    })
    ws.conditional_format(13, 3, 27, 3, {'type': 'data_bar', 'bar_color': RED})

    # Chart
    ch = wb.add_chart({'type': 'bar'})
    ch.add_series({
        'name': 'Oportunidad (días)',
        'categories': ['4 · Calidad y Oportunidad', 13, 0, 27, 0],
        'values':     ['4 · Calidad y Oportunidad', 13, 2, 27, 2],
        'fill': {'color': AMBER},
    })
    ch.set_title({'name': 'Oportunidad promedio por especialidad (consultas)'})
    ch.set_legend({'none': True})
    ch.set_size({'width': 540, 'height': 360})
    ws.insert_chart('F13', ch)

    # Estado por sede (consultas) — INCUMPLIDA en vez de INASISTIO
    ws.merge_range('A30:F30', '  Estados de consulta por sede', F['section'])
    ws.set_row(29, 22)
    estados = ['CUMPLIDA', 'INCUMPLIDA', 'CANCELADA', 'REAL']
    ws.write(31, 0, 'sede', F['th'])
    for i, e in enumerate(estados):
        ws.write(31, 1 + i, e, F['th'])

    ws.write_dynamic_array_formula(
        32, 0, 43, 0,
        '=TAKE(SORTBY(UNIQUE(FILTER(tblCostos[nombre_sede],tblCostos[consulta_flag]=1)),'
        'COUNTIFS(tblCostos[nombre_sede],UNIQUE(FILTER(tblCostos[nombre_sede],tblCostos[consulta_flag]=1)),tblCostos[consulta_flag],1),-1),12)',
        F['td_text'],
    )
    for i in range(12):
        r = 32 + i
        for j, e in enumerate(estados):
            ws.write_formula(
                r, 1 + j,
                f'=IF($A{r + 1}="","",COUNTIFS(tblCostos[nombre_sede],$A{r + 1},'
                f'tblCostos[estado_consulta],"{e}",tblCostos[consulta_flag],1))',
                F['td_num'],
            )

    ws.set_column('A:A', 32); ws.set_column('B:F', 12)


# ════════════════════════════════════════════════════════════════
#  DASHBOARD 5 — PYM / RIAS
# ════════════════════════════════════════════════════════════════
def write_pym(wb, F):
    print('      Escribiendo dashboard 5 (PyM)...')
    ws = wb.add_worksheet('5 · PyM-RIAS')
    ws.set_tab_color('#1F8E8E')

    ws.merge_range('A1:L1', 'Dashboard 5 · PyM / RIAS', F['title'])
    ws.merge_range('A2:L2',
                   'Scope: CONSULTAS con pym poblado. Denominador % cumplim = con_estado_flag.',
                   F['subtitle'])
    ws.set_row(0, 28)

    ws.merge_range('A4:L4', '  KPIs PyM', F['section'])
    ws.set_row(3, 22)

    kpi_card(ws, 5, 0, 'TOTAL CONSULTAS PyM',
             '=COUNTIFS(tblCostos[pym],"<>",tblCostos[consulta_flag],1)',
             F['kpi_value_num'], 'Consultas con campo pym poblado', F, 3)
    kpi_card(ws, 5, 3, '% CUMPLIM. PYM',
             '=IFERROR(SUMIFS(tblCostos[cumplida_flag],tblCostos[pym],"<>",tblCostos[consulta_flag],1)'
             '/SUMIFS(tblCostos[con_estado_flag],tblCostos[pym],"<>",tblCostos[consulta_flag],1),0)',
             F['kpi_value_pct'], 'cumplidas PyM / PyM con estado', F, 3)
    kpi_card(ws, 5, 6, 'PROGRAMAS ACTIVOS',
             '=ROWS(UNIQUE(FILTER(tblCostos[pym],(tblCostos[pym]<>"")*(tblCostos[consulta_flag]=1))))',
             F['kpi_value_num'], 'DISTINCT(pym) en consultas', F, 3)
    kpi_card(ws, 5, 9, 'INASISTENCIA PYM',
             '=IFERROR(COUNTIFS(tblCostos[pym],"<>",tblCostos[consulta_flag],1,tblCostos[estado_consulta],"INCUMPLIDA")'
             '/SUMIFS(tblCostos[con_estado_flag],tblCostos[pym],"<>",tblCostos[consulta_flag],1),0)',
             F['kpi_value_pct'], 'INCUMPLIDA PyM / PyM con estado', F, 3)

    # Top 15 programas PyM por volumen de consultas
    ws.merge_range('A11:E11', '  Top 15 programas PyM (consultas)', F['section'])
    ws.set_row(10, 22)
    for c, h in enumerate(['pym', 'consultas', 'cumplidas', '% cumplim.', '% inasistencia']):
        ws.write(12, c, h, F['th'])

    ws.write_dynamic_array_formula(
        13, 0, 27, 0,
        '=TAKE(SORTBY(UNIQUE(FILTER(tblCostos[pym],(tblCostos[pym]<>"")*(tblCostos[consulta_flag]=1))),'
        'COUNTIFS(tblCostos[pym],UNIQUE(FILTER(tblCostos[pym],(tblCostos[pym]<>"")*(tblCostos[consulta_flag]=1))),tblCostos[consulta_flag],1),-1),15)',
        F['td_text'],
    )
    for i in range(15):
        r = 13 + i
        ws.write_formula(r, 1,
                         f'=IF(A{r + 1}="","",COUNTIFS(tblCostos[pym],A{r + 1},tblCostos[consulta_flag],1))',
                         F['td_num'])
        ws.write_formula(r, 2,
                         f'=IF(A{r + 1}="","",SUMIFS(tblCostos[cumplida_flag],tblCostos[pym],A{r + 1},tblCostos[consulta_flag],1))',
                         F['td_num'])
        ws.write_formula(r, 3,
                         f'=IFERROR(C{r + 1}/SUMIFS(tblCostos[con_estado_flag],tblCostos[pym],A{r + 1},tblCostos[consulta_flag],1),0)',
                         F['td_pct'])
        ws.write_formula(
            r, 4,
            f'=IFERROR(COUNTIFS(tblCostos[pym],A{r + 1},tblCostos[consulta_flag],1,tblCostos[estado_consulta],"INCUMPLIDA")'
            f'/SUMIFS(tblCostos[con_estado_flag],tblCostos[pym],A{r + 1},tblCostos[consulta_flag],1),0)',
            F['td_pct'],
        )

    ws.conditional_format(13, 3, 27, 3, {
        'type': '3_color_scale',
        'min_color': RED, 'mid_color': AMBER, 'max_color': GREEN,
        'min_type': 'num', 'min_value': 0,
        'mid_type': 'num', 'mid_value': 0.5,
        'max_type': 'num', 'max_value': 1,
    })
    ws.conditional_format(13, 4, 27, 4, {'type': 'data_bar', 'bar_color': RED})

    ch = wb.add_chart({'type': 'bar'})
    ch.add_series({
        'name': 'Consultas',
        'categories': ['5 · PyM-RIAS', 13, 0, 27, 0],
        'values':     ['5 · PyM-RIAS', 13, 1, 27, 1],
        'fill': {'color': NAVY},
    })
    ch.set_title({'name': 'Volumen por programa PyM (consultas)'})
    ch.set_legend({'none': True})
    ch.set_size({'width': 540, 'height': 360})
    ws.insert_chart('G13', ch)

    ws.set_column('A:A', 36); ws.set_column('B:E', 14)


# ════════════════════════════════════════════════════════════════
#  README
# ════════════════════════════════════════════════════════════════
def write_readme(wb, F):
    ws = wb.add_worksheet('README')
    ws.set_tab_color('#888888')
    ws.merge_range('A1:G1', 'Dashboards Nordvital — workbook 100% basado en fórmulas', F['title'])
    ws.set_row(0, 30)
    ws.merge_range('A2:G2',
                   f'Generado: {datetime.now().strftime("%Y-%m-%d %H:%M")}',
                   F['subtitle'])

    msg = [
        '',
        'SCOPE: este workbook analiza únicamente CONSULTAS (funcionalidad = "CONSULTA").',
        '       Las filas de PROCEDIMIENTO siguen en data_costos pero todas las',
        '       fórmulas de los dashboards filtran por consulta_flag = 1.',
        '',
        'REGLA: las celdas de los dashboards son fórmulas (KPIs, tablas, charts).',
        '       Las columnas calculadas en tblCostos y los meses_observados de',
        '       tblNTMap se precomputan en Python para evitar 2M de fórmulas que',
        '       corrompen el .xlsx al abrir.',
        '',
        'Fuentes:',
        '  • data_costos   — tabla `tblCostos` (Hoja1 original + 8 cols calculadas)',
        '  • data_nt       — tabla `tblNT` (citas_db notas_tecnicas original)',
        '  • nt_map        — tabla `tblNTMap` DERIVADA replicando el SQL del extractor JSON',
        '',
        'Columnas calculadas en tblCostos (valores precomputados):',
        '  • mes_key          = TEXT(fecha_cita,"yyyy-mm")',
        '  • oportunidad_dias = fecha_cita - fecha_deseada  (solo cuando válido; sino vacío)',
        '  • cumplida_flag    = 1 si estado_consulta = "CUMPLIDA" sino 0',
        '  • con_estado_flag  = 1 si estado_consulta NO es NULL/"" sino 0 (denominador)',
        '  • consulta_flag    = 1 si funcionalidad = "CONSULTA" sino 0 (filtro de scope)',
        '  • nt_lookup_key    = UPPER(nombre_convenio) | cups   (sin regimen, alineado JSON)',
        '  • nt_costo_unit    = lookup(nt_lookup_key, tblNTMap[costo_medio])',
        '  • nt_costo_total   = nt_costo_unit  (no se multiplica por cumplida — alineado JSON)',
        '',
        'Columnas calculadas en tblNTMap (valores precomputados):',
        '  • meses_observados = COUNT DISTINCT(mes_key) en costos donde',
        '                       funcionalidad="CONSULTA" para ese par (convenio,cups)',
        '  • meta_periodo     = meta_mes × meses_observados',
        '',
        'Reglas de derivación de tblNTMap (idénticas al SQL del JSON):',
        '  Para cada fila de tblNT:',
        '   1. Si convenio termina en " / SUBSIDIADO" → 1 fila con nombre_convenio = convenio sin sufijo',
        '   2. Default                                → 1 fila con nombre_convenio = convenio tal cual',
        '   Adicional (solo duplex " / SUBSIDIADO"):',
        '   3. nombre_convenio = REPLACE(convenio sin " / SUBSIDIADO", " CONTRIBUTIVO", " SUBSIDIADO")',
        '  Clave de lookup: nombre_convenio | cups (todo uppercase + trim).',
        '',
        'Hojas de dashboard (todas filtradas por CONSULTAS):',
        '  1. Resumen Gerencial      — KPIs globales, evolución mensual, riesgo por convenio',
        '  2. Ejecución vs NT        — cumplimiento NT, heatmap convenio × CUPS',
        '  3. Análisis Financiero    — costo real, esperado, recuperación, Pareto CUPS',
        '  4. Calidad y Oportunidad  — oportunidad por especialidad, estados por sede (INCUMPLIDA)',
        '  5. PyM / RIAS             — programas PyM, cumplimiento, inasistencia',
        '',
        'Requisitos: Excel 365 / 2021+ (UNIQUE, SORTBY, FILTER, XLOOKUP, TAKE).',
        'Para recalcular tras cambios en datos crudos: ejecutar generar_comparacion_excel.py.',
    ]
    for i, line in enumerate(msg, start=3):
        if line.startswith('REGLA') or line.startswith('Reglas') or line.startswith('Fuentes') or \
           line.startswith('Columnas') or line.startswith('Hojas') or line.startswith('Cómo'):
            ws.merge_range(i, 0, i, 6, line, F['section'])
            ws.set_row(i, 22)
        elif line.startswith('  •') or line.startswith('   1') or line.startswith('   2') or \
             line.startswith('   3') or line.startswith('   4') or line.startswith('  ·'):
            ws.merge_range(i, 0, i, 6, line, F['formula_tag'])
        elif line.startswith('Requisitos'):
            ws.merge_range(i, 0, i, 6, line, F['note'])
        else:
            ws.merge_range(i, 0, i, 6, line, F['note'])

    ws.set_column('A:G', 16)
    ws.set_row(0, 30)


# ════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════
def main() -> None:
    os.makedirs(os.path.dirname(EXCEL_OUT), exist_ok=True)
    costos_df, nt_df = load_workbook_data()
    ntmap_df = derive_nt_map(nt_df)
    costos_df = derive_costos_calc(costos_df, ntmap_df)
    ntmap_df = derive_ntmap_meses(costos_df, ntmap_df)

    print('[2/2] Generando workbook xlsxwriter (fórmulas)...')
    wb = xlsxwriter.Workbook(EXCEL_OUT, {
        'nan_inf_to_errors': True,
        'use_zip64': True,
    })
    F = build_formats(wb)

    write_readme(wb, F)
    write_resumen(wb, F)
    write_ejec_nt(wb, F)
    write_financiero(wb, F)
    write_calidad(wb, F)
    write_pym(wb, F)
    write_data_costos(wb, F, costos_df)
    write_data_nt(wb, F, nt_df)
    write_nt_map(wb, F, ntmap_df)

    wb.close()
    size_mb = os.path.getsize(EXCEL_OUT) / (1024 * 1024)
    print(f'OK -> {EXCEL_OUT}  ({size_mb:.1f} MB)')


if __name__ == '__main__':
    main()
