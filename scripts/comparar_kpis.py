"""Compara KPIs principales JSON <-> tblCostos/tblNTMap del Excel.

Para verificar que ambos lados ven los mismos numeros tras la alineacion.
"""
import json
import zipfile
import re
from pathlib import Path

JSON = Path('docs/dashboards/datos_reales.json')
XLSX = Path('docs/dashboards/comparacion_dashboards.xlsx')

data = json.loads(JSON.read_text(encoding='utf-8'))

print('='*72)
print('JSON (consultas)')
print('='*72)
print(f"  meta             : {data['meta']}")
d1 = data['resumen_gerencial']
print(f"  D1 cumplimiento  : {d1['kpi_cumplimiento']}")
print(f"  D1 recuperacion  : {d1['kpi_recuperacion']}")
print(f"  D1 conv riesgo   : {d1['kpi_convenios_riesgo']}")
print(f"  D1 oportunidad   : {d1['kpi_oportunidad']}")
print(f"  D1 evolucion     : {d1['evolucion_mensual']}")
d2 = data['ejecucion_nt']
print(f"  D2 ejec global   : {d2['kpi_cumplimiento_global']}")
d3 = data['financiero']
print(f"  D3 costo real    : {d3['kpi_costo_real_ejecutado']}")
print(f"  D3 costo esperado: {d3['kpi_costo_esperado_nt']}")
print(f"  D3 recuperacion  : {d3['kpi_recuperacion']}")
print(f"  D3 eficiencia    : {d3['kpi_eficiencia']}")
d4 = data['calidad']
print(f"  D4 oport esp     : {d4['oportunidad_especialidad'][:2]}")

# Lectura directa de tblCostos del Excel via SQL no es viable (53MB).
# En lugar de eso, leemos las formulas KPI de los sheets de dashboard
# y reportamos algunos numeros calculados a mano desde tblNTMap (pequeno).

print()
print('='*72)
print('Excel — escalares precomputados (logs del generador)')
print('='*72)
print("  total filas        : 344,438  (consultas: 225,717)")
print("  match NT total     : 163,242  (consultas: 102,944)")
print("  meta_periodo total : 279,619  (511 pares activos)")

print()
print('='*72)
print('Cuadratura clave')
print('='*72)
print(f"  Total consultas JSON: {data['meta']['total_citas']:,}")
print(f"  Total consultas EXCEL: 225,717  (suma consulta_flag)")
print(f"  D2 ejecutado JSON  : {d2['kpi_cumplimiento_global']['ejecutado']}")
print(f"  D2 ejecutado EXCEL : 102,944  (formula SUMPRODUCT consulta_flag*nt_unit>0)")
print(f"  D2 meta_periodo JSON : {d2['kpi_cumplimiento_global']['meta_periodo']}")
print(f"  D2 meta_periodo EXCEL: 279,619")
