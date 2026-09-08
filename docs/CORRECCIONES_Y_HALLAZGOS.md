# Correcciones y hallazgos — verificación de datos NT

Bitácora **viva** de la etapa de verificación y análisis de los datos cargados a
`citas_db` (dashboards de Ejecución vs Nota Técnica). Se registra cada **hallazgo**
(problema de dato detectado) y cada **corrección** aplicada, con la evidencia y el
cómo reproducir/aplicar.

> Documentos relacionados:
> [VERIFICACION_CUMPLIMIENTO_NT.md](VERIFICACION_CUMPLIMIENTO_NT.md) (auditoría del
> KPI 47,5%), [GUIA_CALCULOS_DASHBOARDS.md](GUIA_CALCULOS_DASHBOARDS.md) (reglas
> R1–R8) y [FLUJO_DATOS.md](FLUJO_DATOS.md) (recorrido del dato).

- **Alcance:** `costos`, `notas_tecnicas`, `nt_map` en `citas_db`. Diagnóstico por
  consultas `SELECT` reproducibles.
- **Estado inicio:** 2026-09-01.

---

## Hallazgos

### H1 — Meta 1 evento/mes en NUEVA EPS 890211 (real, no es bug)
**Dónde:** `notas_tecnicas`, CUPS `890211` (consulta primera vez fisioterapia),
convenio `NUEVA EPS PGP CONTRIBUTIVO`.

La nota técnica trae `n_eventos_mes = 1` para ese par. Con filtro de un mes la meta
del catálogo queda en `1`, mientras se ejecutan **330 consultas reales** de NUEVA
EPS (282 contributivo + 48 subsidiado) en marzo/Cúcuta → cumplimiento absurdo
(33.000%). El dashboard refleja fielmente la NT; **el `1` es un valor de relleno /
error en la fuente de la NT**, no un bug de cálculo.

**Decisión (2026-09-01): NO es un bug — el `1` es el valor real contratado.**
Confirmado con negocio: la NT de NUEVA EPS para `890211` es efectivamente 1
evento/mes. El cumplimiento alto es **sobre-ejecución real** frente a una meta
contratada mínima, no un error de dato. No se corrige. **Cerrado.**

---

### H2 — Fisioterapia PANA cae en CUPS de consulta (890211) en vez de terapia (931001)
**Dónde:** ETL PANA (`sql/04_insert_costos.sql`, bloque 2) + `cat_cups_pana`.

`cat_cups_pana` deriva el CUPS solo por `(especialidad_cita, es_control)`:

| especialidad_cita | es_control | → CUPS |
|---|---|---|
| FISIOTERAPIA | N | 890211 (consulta 1ª vez) |
| FISIOTERAPIA | S | 890311 (consulta control) |

No mira `procedimiento_especifico`, así que **tanto las consultas como las sesiones
de terapia** caen en `890211`. En `raw_pana`, `especialidad_cita='FISIOTERAPIA'`:

| Qué es | Señal en RAW | Filas |
|---|---|---:|
| Terapia | `especialidad` vacía + `proc = 'TERAPIA FÍSICA INTEGRAL'` | ~18.436 |
| Consulta | `especialidad` llena | ~1.760 |

Efecto doble (mismo bug, dos síntomas):
- `890211` se infla con procedimientos (marzo/Cúcuta: **3.634** de PANA;
  `soloConsulta`/R8 los excluye del KPI, correcto).
- `931001` (terapia física integral, contratado en la NT — NUEVA EPS meta 4.208)
  aparece con ejecución ≈ 0 → falso "contratado sin ejecutar".

**Origen confirmado:** los 3.634 son `fuente=PANA` (pipeline **citas**), no odonto ni
labs (cruzan con `raw_pana` por `codigo_cita`).

**Acción:** **corregido en C1.**

---

### H3 — Catálogo NT: meta 304 en vez de 4.208 (limitación por CUPS, no por par)
**Dónde:** `getEjecucionNt` → `catalogoNt` y `contratadoSinEjecutar`
([dashboards.service.ts](../src/dashboards/dashboards.service.ts)).

El catálogo suma la meta **solo de los convenios que ejecutaron** el CUPS
(`FROM ejec e JOIN nt_map m`, regla R1). En mayo/Cúcuta, para `931001` el único
convenio con "ejecución" es COOSALUD (184 + 120 = **304**); NUEVA EPS (meta 4.208)
ejecutó 0 bajo `931001` → no entra al catálogo. Y **tampoco** sale en "Contratado
sin Ejecutar" porque esa sección filtra por **CUPS** (`m.cups NOT IN ejec`) y
`931001` sí tiene ejecución (la de COOSALUD). Resultado: la meta 4.208 de NUEVA EPS
**desaparece** bajo ese filtro.

Es una **limitación de diseño**: catálogo y "contratado sin ejecutar" trabajan a
nivel de CUPS, no de par `(CUPS, convenio)`. Se agrava con H2 (la ejecución real de
NUEVA EPS está bajo otro CUPS).

**Decisión (2026-09-01): es un punto a corregir (no solo limitación).** Aunque C1
alivió el caso NUEVA EPS, el requisito de negocio es que **la meta del catálogo
sume TODOS los convenios contratados bajo el filtro, tengan o no ejecución** (hoy
solo suma los que ejecutaron, por el `FROM ejec e JOIN nt_map m`). Implica incluir
los pares `(CUPS, convenio)` con `meta_mes > 0` aunque `ejec = 0`, contando
`meses = meses del periodo` para esos. Afecta la reconciliación catálogo↔KPI (R3)
y la base de meta (R1) → hay que ajustar KPI y catálogo a la vez. **Corregido en C3.**

---

### H4 — `931001` alimentado por `fuente=ODONTO` con `funcionalidad`/`estado` en NULL
**Dónde:** subproyecto `odonto/` del ETL (`fuente='ODONTO'`, 148.517 filas).

**Qué CUPS trae (202 distintos).** No es solo odontología — el pipeline arrastra
también otros servicios de PyM/promoción. Por grupo de especialidad:

| grupo_especialidad | filas | ¿odonto? |
|---|---:|:---:|
| ODONTOLOGIA | 115.843 | sí |
| AP. TERAPEUTICO (incl. `931001` fisioterapia 12.549) | 16.308 | no |
| MED. GENERAL | 5.800 | no |
| ENFERMERIA Y PYP | 5.077 | no |
| AP. DIAGNOSTICO (ecografías/RX: 881xxx/870xxx) | 3.205 | no |
| MED. ESPECIALIZADA | 1.367 | no |
| (sin grupo) | 917 | — |

CUPS top: `232102` (24.716), `997002` (21.847), `990203` (19.619), `997301`
(16.472), **`931001` (12.549)**, `997106`, `997107`, `997001`, `895101` (ECG),
`990204`…

**Terapia en odonto** (grupo AP. TERAPEUTICO): `931001` FISIOTERAPIA (12.511),
`937001` FONOAUDIOLOGIA (1.797), `938303` TERAPIA OCUPACIONAL (1.170), `939403`
TERAPIA RESPIRATORIA, `990205` NUTRICIÓN, `990206`/`943102` PSICOLOGÍA. La
fisioterapia usa el mismo CUPS correcto `931001` (consistente con el fix C1 de PANA).

**Problemas de dato:**
1. ~~**`funcionalidad`/`estado_consulta` en NULL**~~ → **RESUELTO en C2**: el ETL de
   odonto ahora fija `estado_consulta='CUMPLIDA'` y `funcionalidad='PROCEDIMIENTO'`
   en las 148.517 filas (son ejecuciones).
2. **Ninguno de los 202 CUPS está en `cat_cups`** → sin descripción ni
   homologación en el catálogo principal.
3. **Doble conteo con PLENUS: DESCARTADO (falsa alarma).** El solape de 69.226 por
   `codigo_origen` es **colisión de IDs**: en una muestra 12/12 tienen distinto
   paciente y distinta fecha (ODONTO marzo/abril vs PLENUS enero). El `codigo_origen`
   de odonto está en otra numeración; no son las mismas citas. El fan-out (varias
   filas por `codigo_origen`) es **legítimo**: una cita trae varios tratamientos
   (ej. una cita odonto = educación + profilaxis + control de placa + flúor +
   sellantes). No hay duplicación PLENUS↔ODONTO ni PANA↔ODONTO.
4. **`codigo_origen` NULL en 29.478 filas** ODONTO → sin clave natural para trazar.

**`931001` tras C1:** PANA 18.436 + ODONTO 12.549 + SAP 11.096 (PANA↔ODONTO sin
solape; ODONTO↔PLENUS = colisión, no duplicación).

**Acción:** poblar `funcionalidad` y `estado_consulta='CUMPLIDA'` en el ETL de
odonto (son ejecuciones), cargar sus CUPS a `cat_cups`, y revisar los 29.478 con
`codigo_origen` NULL. Doble conteo con PLENUS **descartado**. **Pendiente (ETL odonto).**

---

## Correcciones aplicadas

### C1 — ETL PANA: enrutar sesiones de terapia física a CUPS 931001
**Archivo:** `automatizaci-n-costos-vs-nota-tecnica/sql/04_insert_costos.sql`,
bloque 2 (PANA), columna `cups`.

**Cambio:** reemplazar la asignación directa `cpp.codigo` por un `CASE` que detecta
la sesión de terapia (fisioterapia con `especialidad` vacía) y le asigna `931001`;
las consultas (especialidad llena) siguen en `890211`/`890311`.

```sql
CASE
    WHEN p.especialidad_cita = 'FISIOTERAPIA'
         AND (p.especialidad IS NULL OR p.especialidad = '')
    THEN '931001'
    ELSE cpp.codigo
END,
```

Se usa `especialidad` vacía (misma señal con la que el ETL ya marca
`funcionalidad = PROCEDIMIENTO`) en vez de `procedimiento_especifico`, porque ese
texto llega con mojibake ("TERAPIA FÃÂÃÂSICA"/"FÃSICA") y no es confiable.

**Cómo aplicar (recarga de datos — pendiente de ejecutar):**

> ⚠️ `30_cargar_costos.py` hace **TRUNCATE de toda la tabla `costos`** y solo
> reinserta PLENUS/PANA/SAP (bloques 1–5). LAB y ODONTO se cargan aparte
> (`DELETE FROM costos WHERE fuente=...` + INSERT), así que **hay que recargarlos
> después** o se pierden. Orden correcto (repo `automatizaci-n-costos-vs-nota-tecnica`):

```powershell
# 1. reconstruye costos citas con el nuevo CUPS (asume RAW ya cargada en MySQL)
py scripts\30_cargar_costos.py --solo-costos
# 2. re-inserta LAB y ODONTO (ambos default dry-run: requieren --commit)
py labs\scripts\30_cargar_labs.py --commit
py odonto\scripts\30_cargar_odontologia.py --commit
```

**`nt_map` NO necesita reconstruirse** para este fix: se deriva de `notas_tecnicas`
(que no cambió) y ya contiene las filas de `931001`. Solo se reconstruye
(`POST /api/dashboards/admin/rebuild-nt-map`) cuando se toca la NT (ver H1).

**Verificación realizada (2026-09-01, recarga completa):**
- Total `costos` **1.092.847 idéntico** antes/después; por fuente sin cambios
  (LAB 406.303 · PLENUS 263.214 · PANA 173.858 · ODONTO 148.517 · SAP 100.955).
- `890211` PANA PROCEDIMIENTO **18.436 → 0** (marzo/Cúcuta 3.634 → 0); las
  consultas PANA (1.758) se quedan en `890211`.
- `931001` gana **PANA PROCEDIMIENTO 18.436**; NUEVA EPS 931001 **1.869 → 20.305**.
- Escenario dashboard (Cúcuta): NUEVA EPS 931001 pasó de ≈0 a ejecución real
  (marzo 3.634, mayo 2.370); `890211` marzo/Cúcuta queda en 330 consultas.

**Estado:** ✅ **aplicado y verificado en `citas_db`.** `nt_map` no requirió
reconstrucción (no se tocó la NT).

---

### C2 — ETL odonto: fijar `estado_consulta=CUMPLIDA` y `funcionalidad=PROCEDIMIENTO`
**Archivo:** `automatizaci-n-costos-vs-nota-tecnica/odonto/scripts/30_cargar_odontologia.py`
(`construir_filas`).

Las filas de odonto son **ejecuciones ya realizadas** pero llegaban con
`estado_consulta` y `funcionalidad` en NULL (el transform las dejaba vacías). Se
fijan en el choke point único de carga, junto a `fuente`:

```python
out["fuente"] = FUENTE
out["estado_consulta"] = "CUMPLIDA"
out["funcionalidad"] = "PROCEDIMIENTO"
```

**Aplicado y verificado (2026-09-01):** recarga `30_cargar_odontologia.py --commit`
(aislada: `DELETE fuente='ODONTO'` + INSERT). Las **148.517** filas ODONTO quedaron
con `estado_consulta=CUMPLIDA` y `funcionalidad=PROCEDIMIENTO`; total por fuente sin
cambios (LAB 406.303 · PLENUS 263.214 · PANA 173.858 · ODONTO 148.517 · SAP 100.955).

> Impacto: esas 148.517 ahora cuentan como CUMPLIDAS en Resumen/Calidad (antes el
> 81% no contaba por NULL) y como PROCEDIMIENTO. Es el efecto buscado.

---

### C3 — Backend: meta del catálogo y KPI = contratado total (todos los convenios)
**Archivo:** `backend-auto/src/dashboards/dashboards.service.ts` (`getEjecucionNt`).

Antes, la meta del KPI y del catálogo sumaba solo los convenios **con** ejecución
(`FROM ejec e JOIN nt_map m`, `meta = meta_mes × meses con ejecución`). Ahora suma
**todos los convenios contratados** en el filtro (con o sin ejecución) y usa
`meses = meses del periodo`. Dos helpers nuevos:

- `periodoMeses(where)` — meses distintos con datos en el filtro.
- `contratadoScope(where, ntMap)` — todos los pares `(convenio, cups)` de `nt_map`
  (meta_mes>0) para los convenios con actividad en el filtro, `LEFT JOIN` a la
  ejecución (`n = 0` si no ejecutaron). meta = `meta_mes × periodoMeses`.

El KPI (ramas con y sin sede) y `catalogoNt` parten ahora de `contratadoScope`.
Shape de respuesta **sin cambios** → frontend intacto.

**Verificado (2026-09-01)** — `931001`, filtro CUCUTA/mayo:

| | antes | ahora |
|---|---:|---:|
| meta catálogo 931001 | 304 | **4.512** (NUEVA EPS 4.208 + COOSALUD 184+120) |
| KPI global meta_periodo | solo ejecutados | 93.608 (contratado total) |

`tsc` OK. La meta ya incluye los convenios contratados aunque no ejecuten.

> Nota: con esto el catálogo también lista CUPS con ejecución 0, por lo que la
> sección "Contratado sin Ejecutar" queda **redundante** (subconjunto del catálogo).
> Quitarla implicaría tocar el frontend (shape) — decisión aparte.

**Estado:** ✅ implementado y verificado (lógica + `tsc`). Falta **refrescar el
dashboard** para verlo (backend en watch; caché ~5 min).

---

## Pendientes / decisiones

| # | Tema | Tipo | Estado |
|---|---|---|---|
| H1 | Meta `1` en NUEVA EPS 890211 | Dato (NT) | ❌ cerrado — no es bug, valor real |
| H3 | Meta del catálogo debe sumar todos los convenios contratados (con o sin ejecución) | Backend | ✅ corregido C3 |
| H4 | ODONTO: funcionalidad/estado NULL (resuelto C2); quedan CUPS fuera de `cat_cups` y codigo_origen NULL (29.478) | Dato (ETL odonto) | parcial |
