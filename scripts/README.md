# Scripts — Dashboards Nordvital

Conjunto de utilidades Python para extraer, generar y verificar los dashboards
de Nordvital IPS. Todos se ejecutan con `py -3` (Python launcher de Windows) y
asumen como CWD la raíz del repo.

## Scope común

Solo se analizan **CONSULTAS** (`funcionalidad = 'CONSULTA'`,
225,717 filas de 344,438). Los registros de PROCEDIMIENTO siguen en
`tblCostos` pero todas las fórmulas y queries los excluyen.

## Mapa de scripts

```
                ┌──────────────────────────────────────────┐
                │  citas_db (MariaDB)                      │
                │   · costos                               │
                │   · notas_tecnicas                       │
                └────────┬───────────────────┬─────────────┘
                         │                   │
                         ▼                   ▼
   ┌─────────────────────────────┐   ┌───────────────────────────────┐
   │ extraer_datos_dashboards.py │   │ generar_comparacion_excel.py  │
   │  · queries SQL              │   │  · pandas + xlsxwriter        │
   │  · crea nt_map en MariaDB   │   │  · 5 dashboards por fórmulas  │
   │  · escribe JSON             │   │  · escribe .xlsx              │
   └────────────┬────────────────┘   └────────────┬──────────────────┘
                │                                  │
                ▼                                  ▼
   docs/dashboards/datos_reales.json   docs/dashboards/comparacion_dashboards.xlsx
                │                                  │
                ▼                                  ▼
   HTMLs (01..05_*.html)                Excel para usuarios finales
                │                                  │
                └──────────────┬───────────────────┘
                               ▼
                   ┌───────────────────────────┐
                   │ comparar_kpis.py          │
                   │  · valida cuadratura      │
                   │    JSON ↔ Excel           │
                   └───────────────────────────┘

   Utilidades de diagnóstico (uso puntual):
     · inspeccion_alineacion.py — patrones de convenio NT y matching
     · verificar_estados.py     — valores reales de estado_consulta
     · verificar_excel.py       — estructura interna del .xlsx
```

## Pipeline completo

Cuando se actualizan los datos crudos en MariaDB, el orden es:

```powershell
py -3 scripts\extraer_datos_dashboards.py   # 1) regenera datos_reales.json
py -3 scripts\generar_comparacion_excel.py  # 2) regenera comparacion_dashboards.xlsx
py -3 scripts\comparar_kpis.py              # 3) valida cuadratura JSON ↔ Excel
py -3 scripts\verificar_excel.py            # 4) (opcional) sanity check estructural
```

Los pasos 1 y 2 son independientes — pueden correrse en cualquier orden — pero
los dos deben terminar **OK** antes de correr el paso 3.

---

## Scripts principales

### `extraer_datos_dashboards.py`

**Para qué sirve.** Conecta a MariaDB (`citas_db`), calcula los KPIs y tablas
de los 5 dashboards y serializa todo a
[`docs/dashboards/datos_reales.json`](../docs/dashboards/datos_reales.json),
que es la fuente de datos de las páginas HTML.

**Cómo funciona.**

1. Crea una tabla puente `nt_map` en MariaDB derivada de `notas_tecnicas`
   con la regla:
   - convenio termina en `' / SUBSIDIADO'` → 2 filas (CONTRIBUTIVO + SUBSIDIADO).
   - en otro caso → 1 fila con el `convenio` tal cual.
2. Para cada dashboard (`d1`..`d5`) ejecuta queries y guarda el resultado en
   un dict (`out["resumen_gerencial"]`, `out["ejecucion_nt"]`, etc.).
3. Todas las queries sobre `costos` aplican `WHERE funcionalidad='CONSULTA'`
   (excepto `distribucion_servicios`, informativa).

**Salida.** `docs/dashboards/datos_reales.json`

**Configuración.** Credenciales hardcodeadas en `main()` (`host=localhost`,
`user=root`, `password=S.O.A.D`, `database=citas_db`).

---

### `generar_comparacion_excel.py`

**Para qué sirve.** Genera
[`docs/dashboards/comparacion_dashboards.xlsx`](../docs/dashboards/comparacion_dashboards.xlsx),
un workbook con los 5 dashboards calculados **por fórmulas Excel** sobre 3
tablas (`tblCostos`, `tblNT`, `tblNTMap`).

**Cómo funciona.**

1. Carga `citas_db_costos.xlsx` (Hoja1 = `tblCostos`, Hoja "citas_db
   notas_tecnicas" = `tblNT`).
2. Deriva `tblNTMap` aplicando exactamente las mismas reglas que el SQL del
   extractor (clave de lookup = `UPPER(nombre_convenio) | cups`).
3. Precomputa en pandas 8 columnas calculadas para `tblCostos`:

   | Columna | Significado |
   |---|---|
   | `mes_key` | `TEXT(fecha_cita,"yyyy-mm")` |
   | `oportunidad_dias` | `fecha_cita - fecha_deseada` (vacío si no válido) |
   | `cumplida_flag` | 1 si `estado_consulta='CUMPLIDA'` |
   | `con_estado_flag` | 1 si `estado_consulta` no es nulo (denominador) |
   | `consulta_flag` | 1 si `funcionalidad='CONSULTA'` (filtro de scope) |
   | `nt_lookup_key` | `UPPER(nombre_convenio) \| cups` |
   | `nt_costo_unit` | lookup vs `tblNTMap.costo_medio` |
   | `nt_costo_total` | igual a `nt_costo_unit` (alineado al SQL) |

4. Precomputa para `tblNTMap`:
   - `meses_observados` — `COUNT DISTINCT(mes_key)` de consultas matched.
   - `meta_periodo` — `meta_mes × meses_observados`.
5. Escribe los 5 dashboards: KPIs, tablas y charts, todo con **fórmulas
   Excel** (`SUMIFS`, `COUNTIFS`, `AVERAGEIFS`, `SUMPRODUCT`, `XLOOKUP`,
   `UNIQUE`, `SORTBY`, `FILTER`, `TAKE`). Todas filtran por `consulta_flag=1`.

**Por qué se precomputan las columnas en pandas y no como fórmulas Excel.**
Definirlas como fórmula generaría ~2M fórmulas (344K filas × 6 cols) que
corrompen `sheet7.xml` y `table1.xml` al abrir el archivo
("Registros quitados: Fórmula… / Tabla…"). Al ser valores fijos, las
fórmulas de los dashboards las consumen igual por nombre de columna y el
archivo abre limpio.

**Entrada.** `citas_db_costos.xlsx` (en la raíz del repo, no versionado).

**Salida.** `docs/dashboards/comparacion_dashboards.xlsx` (~51 MB).

**Requisitos del cliente.** Excel 365 / 2021+ por el uso de `UNIQUE`,
`SORTBY`, `FILTER`, `XLOOKUP`, `TAKE`.

---

## Scripts de verificación

### `comparar_kpis.py`

Lee `datos_reales.json` y reporta los escalares precomputados por
`generar_comparacion_excel.py` (los imprime el generador al correr). Sirve
para confirmar a ojo que el ejecutado/meta/totales del Excel coinciden con
el JSON tras un cambio.

> No abre el `.xlsx` (53 MB) — los números del lado Excel los imprime el
> generador. Si necesitas revalidar tras un cambio en el generador, vuelve a
> ejecutarlo y este script muestra los del JSON para contrastar.

### `verificar_excel.py`

Inspecciona el `.xlsx` leyendo directamente el XML interno (sin cargar el
archivo en memoria como workbook). Reporta:

- Número de hojas, charts y tablas.
- Conteo de celdas con fórmula vs literales por dashboard.
- Listado de las primeras 30 fórmulas de la hoja "1 · Resumen Gerencial".
- Tipo y título de cada gráfico nativo.

Útil para detectar al instante si las fórmulas se corrompieron o si una hoja
quedó con valores pegados por error.

---

## Scripts de diagnóstico (uso puntual)

### `inspeccion_alineacion.py`

Inspecciona la BD para validar:

- Valores distintos de `funcionalidad`.
- Patrones de sufijo en `notas_tecnicas.convenio` (`/ SUBSIDIADO`,
  `SUBSIDIADO`, `CONTRIBUTIVO`, sin sufijo).
- Cuántos `nombre_convenio` distintos del costos tienen sufijo.
- Cuántos convenios del NT (tras la normalización) realmente existen en
  costos.

Se usó una vez para diseñar la nueva `derive_nt_map`. Se deja en el repo
como referencia rápida si los datos cambian.

### `verificar_estados.py`

Reporta los valores reales presentes en `estado_consulta` y los conteos por
estado. Se usó para descubrir que `INASISTIO` no existe en BD (el valor
correcto es `INCUMPLIDA`) y que hay un cuarto estado `REAL` que ningún
dashboard explica explícitamente.

---

## Cuadratura validada (post-alineación)

| KPI                    | JSON     | Excel    |
|------------------------|---------:|---------:|
| Total consultas        | 225,717  | 225,717  |
| D1 Cumplimiento        | 41.5%    | 41.5%    |
| D1 Oportunidad prom.   | 3.4 d    | 3.4 d    |
| D2 Ejecutado           | 102,944  | 102,944  |
| D2 Meta periodo        | 279,619  | 279,619  |
| D2 % Cumplimiento NT   | 36.8%    | 36.8%    |
| D3 Costo real ($M)     | 2,547.3  | 2,547.3  |
| D3 Eficiencia          | 3.3%     | 3.3%     |
