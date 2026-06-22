"""Verifica el workbook leyendo XML directo (rápido, no carga 54MB)."""
import zipfile
import re

XLSX = r'docs\dashboards\comparacion_dashboards.xlsx'

print('=' * 70)
print(f'Inspección rápida: {XLSX}')
print('=' * 70)

# Solo las hojas de dashboard (no las _data_* gigantes)
dash_sheet_files = {
    'sheet2.xml': '1 · Resumen Gerencial',
    'sheet3.xml': '2 · Ejecución vs NT',
    'sheet4.xml': '3 · Análisis Financiero',
    'sheet5.xml': '4 · Calidad y Oportunidad',
    'sheet6.xml': '5 · PyM-RIAS',
}

re_cell = re.compile(r'<c\b[^>]*r="([A-Z]+\d+)"[^>]*?(?:t="([^"]+)")?[^>]*>(?:<f[^>]*?>([^<]*)</f>)?(?:<v>([^<]*)</v>)?', re.DOTALL)
re_formula_cell = re.compile(r'<c\b[^>]*?r="([A-Z]+\d+)"[^>]*?>\s*<f', re.DOTALL)

with zipfile.ZipFile(XLSX) as z:
    names = z.namelist()
    print(f'\n  Estructura interna:')
    print(f'    Worksheets:        {len([n for n in names if n.startswith("xl/worksheets/sheet")])}')
    print(f'    Charts nativos:    {len([n for n in names if n.startswith("xl/charts/chart")])}')
    print(f'    Tablas Excel:      {len([n for n in names if n.startswith("xl/tables/")])}')

    print(f'\n  Hojas de dashboard:')
    for fname, sheet_name in dash_sheet_files.items():
        path = f'xl/worksheets/{fname}'
        if path not in names:
            continue
        xml = z.read(path).decode('utf-8', errors='ignore')

        # Cuenta celdas con <f> (fórmulas) y celdas con valor numérico/texto sin <f>
        n_formulas = len(re.findall(r'<f\b', xml))
        # Celdas totales que tienen un <v> (valor)
        n_with_v = len(re.findall(r'<v>', xml))
        # Celdas sin <f> pero con <v> = valores literales (números o referencias a sst)
        # Aproximación: total celdas con valor menos celdas con fórmula
        n_literals = max(0, n_with_v - n_formulas)
        # Cells totales (cualquier <c)
        n_cells = len(re.findall(r'<c\s', xml))

        print(f'    - {sheet_name:35s}  celdas={n_cells:>5}  fórmulas={n_formulas:>4}  literales(v sin f)={n_literals:>4}')

    # Inspección charts
    chart_files = sorted(n for n in names if n.startswith('xl/charts/chart') and n.endswith('.xml'))
    print(f'\n  Gráficos detectados:')
    for cf in chart_files:
        xml = z.read(cf).decode('utf-8', errors='ignore')
        # tipo de gráfico
        m = re.search(r'<c:(barChart|lineChart|pieChart|columnChart|doughnutChart|scatterChart|areaChart)', xml)
        ctype = m.group(1) if m else '?'
        # título
        mt = re.search(r'<a:t>([^<]+)</a:t>', xml)
        title = mt.group(1)[:50] if mt else '(sin título)'
        # series
        n_series = len(re.findall(r'<c:ser>', xml))
        print(f'    - {cf:30s}  {ctype:12s}  series={n_series}  título="{title}"')

# 2) Inspección de fórmulas KPI en sheet2 (Resumen)
print('\n--- Fórmulas en hoja "1 · Resumen Gerencial" (primeras 30 fórmulas) ---')
with zipfile.ZipFile(XLSX) as z:
    xml = z.read('xl/worksheets/sheet2.xml').decode('utf-8', errors='ignore')
    # patrón: <c r="X1" ...><f>...</f><v>...</v></c>
    matches = re.findall(r'<c[^>]+r="([A-Z]+\d+)"[^>]*>\s*<f[^>]*>([^<]+)</f>', xml)
    for addr, f in matches[:30]:
        f_short = f[:100] + '...' if len(f) > 100 else f
        print(f'  {addr:6s}: ={f_short}')

print('\nOK')
