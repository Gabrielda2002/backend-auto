# Verificación del cumplimiento vs Nota Técnica — auditoría de datos

Auditoría **solo lectura** sobre `citas_db` para explicar por qué el KPI de
Ejecución vs Nota Técnica marca **47,5%** cuando el negocio esperaba un valor más
alto. **No se modificó la página, el backend ni la base de datos.** Todas las
cifras salen de consultas `SELECT` reproducibles.

> Documentos de referencia usados como base del modelo:
> [GUIA_CALCULOS_DASHBOARDS.md](GUIA_CALCULOS_DASHBOARDS.md) (reglas R1–R8) y
> [FLUJO_DATOS.md](FLUJO_DATOS.md) (recorrido del dato y divisores heredados).

- **Fecha:** 2026-08-14
- **Alcance:** tabla `costos` (860.151 filas), `nt_map`, `notas_tecnicas`.
- **KPI auditado:** `SUM(LEAST(ejecutado, meta)) / SUM(meta)`, con
  `meta = meta_mes × meses con ejecución` por `(convenio, cups)`.

---

## 0. Resultado ejecutivo

El **47,5% está subestimado por dos causas técnicas**, no por baja asistencia:

| Paso | Cumplimiento | Δ | Causa |
|---|---|---|---|
| Actual (mostrado hoy) | **47,5%** | — | baseline |
| + Corregir duplicación de meta por régimen | **61,9%** | **+14,4** | bug en `rebuildNtMap` |
| + Excluir agosto parcial (Ene–Jul) | **65,5%** | **+3,6** | mes en curso incompleto |

El cumplimiento real ronda **~65%**. El resto de la brecha hasta 100% es
**sub-ejecución genuina** de contratos (concentrada en programas PyM de COOSALUD)
y un **hueco de datos en PANA abril**.

Las fechas de ejecución **están bien tomadas** (sin nulos, sin fechas futuras,
sin residuo del bug ISO, sin incoherencias asignación→cita). La sospecha inicial
sobre las fechas se descarta; el problema es la **meta**, no la fecha.

---

## 1. Baselines medidos

| Métrica | Valor | Fórmula |
|---|---|---|
| Asistencia (panel Citas) | 88,8% | `cumplidas / efectivas` = 669.808 / 753.969 |
| Ejecución NT (capado) | 47,5% | `SUM(LEAST(ejec,meta)) / SUM(meta)` = 515.884 / 1.087.185 |
| Ejecución NT (sin tope) | 59,8% | `SUM(ejec) / SUM(meta)` = 650.034 / 1.087.185 |

> **Son métricas distintas**: 88,8% es *tasa de asistencia* (de las citas
> efectivas, cuántas cumplió el paciente). 47,5% es *ejecución contra la meta
> contratada*. No son comparables ni contradictorias.

`costos` por fuente: LAB 374.455 · PANA 157.147 · PLENUS 229.490 · SAP 99.059.

---

## 2. Fase 1 — Integridad de las fechas de ejecución

**Conclusión: las fechas están correctas.** No son la causa.

- **Sin nulos, sin fechas futuras, sin fechas fuera de 2026** en ninguna fuente.
  Rango uniforme 2026-01 a 2026-08 en las cuatro fuentes.
- **Sin residuo del bug ISO**: `2026-08-05` y `2026-05-08` tienen volúmenes
  normales en todas las fuentes (no hay desplazamiento masivo de mes).
- **Coherencia asignación→cita**: 0 filas con `fecha_cita < fecha_asig` en
  PLENUS/PANA/SAP. LAB no trae `fecha_asig` (usa la fecha de ejecución), como se
  espera.

### Dos anomalías de volumen (no de parseo)

1. **PANA abril = 6.380 filas** (vs ~22–26k los demás meses ≈ **74% faltante**).
   Días completos ausentes (2–5) y ~200–600/día. Es un **hueco de descarga /
   consolidación** en el maestro PANA de abril. Baja la ejecución de abril.
2. **PLENUS mayo = junio = 29.983 (idénticos)**: verificado y **descartado como
   duplicación** — 0 `codigo_origen` en común y patrones diarios distintos (los
   ceros caen en domingos/festivos propios de cada mes). Es coincidencia.

### Efecto del agosto parcial

Agosto solo tiene ~10 días cargados, pero por la regla R1
(`meta = meta_mes × meses con ejecución`) **cuenta como un mes completo de meta**.

| Periodo | Ejecutado | Meta | pct |
|---|---|---|---|
| Ene–Jul | 483.695 | 958.078 | 50,5% |
| Ene–Ago (actual) | 515.884 | 1.087.185 | 47,5% |

Agosto agrega 129.107 de meta pero solo 32.189 de ejecución (ratio 24,9%) →
**−3,0 puntos artificiales** en el modelo actual (−3,6 en el corregido).

---

## 3. Fase 2 — `meses`, meta y reconciliación con `notas_tecnicas`

### Distribución de `meses` (pares matcheados)

| meses con ejec. | pares | meta | ejecutado | % |
|---|---|---|---|---|
| 8 | 744 | 792.728 | 560.495 | 70,7% |
| 7 | 367 | 237.328 | 69.773 | 29,4% |
| ≤6 | 1.099 | ~57.129 | ~19.766 | bajo |

El 73% de la meta vive en los 744 pares con ejecución los 8 meses (ejecutan al
70,7%). Los pares con menos meses ejecutan mucho peor.

### CAUSA RAÍZ — meta duplicada por régimen

`notas_tecnicas` tiene **6 convenios con contrato combinado** "CONTRIBUTIVO /
SUBSIDIADO" (una sola meta). `rebuildNtMap()` los **duplica** en dos filas
(CONTRIBUTIVO + SUBSIDIADO) **con la meta completa en cada una**:

| Tabla | filas | Σ meta mensual |
|---|---|---|
| `notas_tecnicas` (Σ `n_eventos_mes`) | 7.700 | **164.876** |
| `nt_map` (Σ `meta_mes`) | 12.660 | **236.144** |
| Diferencia | — | **71.268** |

Los 71.268 de más = exactamente la suma de los 6 convenios duplicados
(COMPENSAR Cajica/Calera/Mesa/Ubate + FAMISANAR Cajica/Chía).

**Ejemplo `FAMISANAR CHIA 890201`:**

| Fuente | Convenio | meta |
|---|---|---|
| `notas_tecnicas` | FAMISANAR CHIA CAPITA CONTRIBUTIVO / SUBSIDIADO | **3343** (una fila) |
| `nt_map` | FAMISANAR CHIA CAPITA CONTRIBUTIVO | 3343 |
| `nt_map` | FAMISANAR CHIA CAPITA SUBSIDIADO | 3343 |

**Mecanismo** (`dashboards.service.ts`, `rebuildNtMap`, ~L94–110): el segundo
`SELECT ... UNION ALL` reinserta el mismo `n_eventos_mes` como fila SUBSIDIADO.
Como `convNt` **solo unifica NUEVA EPS**, para estos 6 convenios el KPI ve la
meta **al doble**, y la ejecución (repartida por régimen) se compara contra ese
doble.

---

## 4. Fase 4 — Atribución por régimen (confirma la causa raíz)

La ejecución de esos 6 convenios está **fuertemente sesgada a CONTRIBUTIVO**:

| Convenio | CONTRIB | SUBSID |
|---|---|---|
| FAMISANAR CHIA | 71.414 | 23.358 |
| COMPENSAR CAJICA | 65.581 | 8.505 |
| COMPENSAR UBATE | 53.619 | 9.549 |
| FAMISANAR CAJICA | 42.334 | 10.264 |

Con la meta duplicada, el bucket SUBSIDIADO tiene meta completa pero ~11–25% de
la ejecución → hunde el promedio. **Corrigiendo (unificar régimen, meta contada
una vez):**

| Escenario | Ejecutado | Meta | Cumplimiento |
|---|---|---|---|
| Actual (buggy) | 515.884 | 1.087.185 | **47,5%** |
| Régimen unificado | 487.334 | 786.787 | **61,9%** |
| Régimen unificado, sin `soloConsulta` | 503.259 | 790.489 | 63,7% |

Por convenio, ya corregido: FAMISANAR CHIA **59,5%** (antes 49,6/18,7 por
régimen), FAMISANAR CAJICA 59,2%, COMPENSAR UBATE 81,3%, COMPENSAR LA MESA 78,8%,
COMPENSAR CAJICA 51,0%, NUEVA EPS 73,6%. Siguen bajos **COOSALUD PYMS** (8,6% y
15,4%) — pero esos tienen metas **separadas** en la NT (no duplicadas): es
**sub-ejecución real** de programas de promoción y mantenimiento.

---

## 5. Fase 3 — Filtros y CUPS fuera de NT

- **`soloConsulta`** descarta 106.494 ejecuciones de CUPS de consulta (8902/8903)
  con `funcionalidad ≠ CONSULTA` (PLENUS 72.529, PANA 33.965). Es la regla R8
  (terapias PANA no inflan consultas). Impacto en el KPI corregido: **solo
  −1,8 pts** → el filtro es legítimo, no es el problema.
- **Ejecutado fuera de NT**: 45.271 citas en 107 CUPS sin meta (top: `102` toma
  de muestra 26.909, `890286` 11.039, `892222` 2.685). Trabajo real no medido
  contra la NT por no estar contratado (diseño).
- **`excluirAgendas`**: 23.246 filas de la agenda genérica TOMA DE MUESTRAS.

---

## 6. Fase 5 — Verificación de LAB

LAB está **limpio y bien integrado**:

- CUPS casi todos `90xxxx` (laboratorio); **99,2% cruzan `nt_map`**. Ninguno es
  consulta → `soloConsulta` no lo afecta.
- Convenios sesgados a CONTRIBUTIVO como el resto; 9.663 filas sin convenio
  (residual conocido del cruce por capas; no cuentan).
- **En el modelo corregido, LAB ejecuta al 61,8%** — igual que el global (con
  LAB 61,9% vs sin LAB 62,1%). No distorsiona; solo duplica el volumen base.

---

## 7. Fase 6 — Reconciliación y clasificación de la brecha

### Cascada del KPI

| Paso | Cumplimiento |
|---|---|
| Actual mostrado | 47,5% |
| + Régimen unificado | 61,9% |
| + Excluir agosto parcial (Ene–Jul) | **65,5%** |

### Clasificación de cada brecha

| Brecha | Tipo | Magnitud | Acción |
|---|---|---|---|
| Meta duplicada por régimen | **Meta (bug ETL/nt_map)** | +14,4 pts | Corregir `rebuildNtMap` |
| Agosto parcial como mes completo | **Método (mes en curso)** | +3,6 pts | Excluir/prorratear mes en curso |
| PANA abril incompleto | **Dato (hueco descarga)** | localizado | Re-descargar/cargar PANA abril |
| COOSALUD PYMS 8–15% | **Ejecución real** | genuina | Gestión operativa (no es dato) |
| CUPS fuera de NT (45.271) | **Cobertura NT** | informativo | Revisar si faltan CUPS en la NT |

---

## 8. Recomendaciones (para decidir — sin aplicar aún)

1. **Corregir `rebuildNtMap` (prioridad 1, +14 pts).** Para los 6 convenios
   "/ SUBSIDIADO": no duplicar la meta completa en ambos regímenes. Opciones:
   (a) unificar el régimen para el cruce (extender `convNt` a esos convenios, la
   meta se cuenta una vez y la ejecución de ambos regímenes suma contra ella), o
   (b) repartir la meta entre regímenes. La opción (a) es la más consistente con
   el nombre combinado del contrato. Afecta reglas R1/R5/R6 — decisión de negocio.
2. **Mes en curso incompleto.** Excluir o prorratear el mes parcial en el cálculo
   de `meses`/meta (relacionado con los divisores heredados `COALESCE(meses,5)` y
   `costo_medio × 5` que [FLUJO_DATOS.md](FLUJO_DATOS.md) ya marca como pendientes
   al ampliar el periodo).
3. **PANA abril**: re-descargar y reconsolidar el maestro PANA de abril.
4. **COOSALUD PYMS**: revisar con operaciones — es baja ejecución real, no dato.

> Nada de esto se ha implementado. Este documento es solo el diagnóstico de datos
> solicitado; los cambios de código/base son una decisión aparte.

---

## Anexo — cómo reproducir

Consultas `SELECT` de solo lectura contra `citas_db` usando las credenciales de
`backend-auto/.env` (`DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`). El KPI corregido
usa `notas_tecnicas` como fuente de meta (meta única por convenio combinado) y una
función de unificación de régimen para los 6 convenios "/ SUBSIDIADO", análoga a
`convNt` para NUEVA EPS.
