# Flujo de datos end-to-end — Nordvital IPS

Documento de referencia para la entrega final. Describe el recorrido completo
del dato: desde los tres sistemas origen, pasando por el ETL y la base de
datos, hasta los cálculos de cada dashboard.

> **Diagrama**: [docs/diagramas/flujo_completo_e2e.drawio](diagramas/flujo_completo_e2e.drawio)
> (abrir con [draw.io / diagrams.net](https://app.diagrams.net)).

---

## 1. Visión general

```
PLENUS ─┐
PANA  ──┼─► CSV maestros ─► tablas raw_* ─► 04_insert_costos.sql ─► costos ─► API NestJS ─► 5 dashboards
SAP   ─┘    (append-only)    (MySQL)         (5 BLOQUES)            (+ nt_map)   /dashboards    React
```

| Capa | Repositorio | Tecnología | Salida |
|------|-------------|-----------|--------|
| 1. Orígenes | `automatizaci-n-costos-vs-nota-tecnica` | Bots (Playwright / PyAutoGUI) | CSV / XLSX de descarga |
| 2. Staging | `automatizaci-n-costos-vs-nota-tecnica` | Python (pandas) | `Raw_PLENUS.csv`, `Raw_PANA.csv`, `Raw_SAP.xlsx` |
| 3. RAW | `automatizaci-n-costos-vs-nota-tecnica` | MySQL | `raw_plenus`, `raw_pana`, `raw_sap` |
| 4. Transformación | `automatizaci-n-costos-vs-nota-tecnica` | SQL (`04_insert_costos.sql`) | `costos` (maestra) |
| 5. Modelo | ambos | MariaDB | `costos`, `notas_tecnicas`, `nt_map`, `cat_*` |
| 6. API | `Dashboard_NT` | NestJS 11 + Prisma 7 | `/api/dashboards/*`, `/api/filtros/*` |
| 7. Frontend | `Dashboard_NT/web` | Vite + React + TanStack Query | 5 dashboards interactivos |

---

## 2. Orígenes (capa 1)

Tres sistemas heterogéneos, cada uno con su propio formato y clave natural:

| Sistema | Rol | Formato | Volumen aprox. | Clave natural |
|---------|-----|---------|---------------:|---------------|
| **PLENUS** | Sistema clínico principal | CSV separado por TAB | ~190k | `agendacita_id` |
| **PANA** | Agenda secundaria | CSV separado por `;` | ~119k | `codigo_cita` |
| **SAP** | Sistema administrativo | Excel (`Hoja1`) | ~71.5k | `episodio` |

Los bots (`Citas_PLENUS.py`, `Citas_PANA.py`, `Citas_SAP.py`) descargan a
`data/descarga_diaria/`. PLENUS y PANA usan Playwright (navegador); SAP usa
PyAutoGUI (control de ventana).

---

## 3. ETL: de orígenes a `costos` (capas 2–4)

### 3.1 Staging incremental

`01_carga_diaria_csv.py` hace **append** de las descargas a los maestros
`Raw_*`. No deduplica: descargar un rango de fechas solapado **duplica** citas.
La disciplina operativa (rangos sin solapar) es la salvaguarda.

### 3.2 Carga a MySQL y reconstrucción

`03_carga_diaria_DB.py`:
1. Lee los maestros `Raw_*` (respetando separador/Excel de cada uno).
2. `TRUNCATE` + carga por chunks (2000) a `raw_plenus` / `raw_pana` / `raw_sap`.
3. Ejecuta `sql/04_insert_costos.sql`.

Modos: `--solo-raw` (solo carga RAW), `--solo-costos` (solo reconstruye `costos`).

> **Reconstrucción completa, no incremental**: cada corrida hace TRUNCATE +
> reinserción de las ~381k filas de `costos`. Escala linealmente; es un límite
> conocido y aceptado para el volumen actual.

### 3.3 `04_insert_costos.sql` — los 5 BLOQUES

| Bloque | Acción | Reglas clave |
|--------|--------|--------------|
| **1** | `raw_plenus` → `costos` | JOIN a catálogos; CUPS homologado (`cat_cups`, fallback `pym`); `tipo_cita` por defecto CONTROL |
| **2** | `raw_pana` → `costos` | **Regla NORDVITAL IPS SAS → NUEVA EPS** según `plan_cnt`; CUPS por clave compuesta `(especialidad_cita, control)` |
| **3** | `raw_sap` → `costos` | Clave compuesta `(sede_uo, cod_aseguradora, interlocutor_comercial)`; `prestacion` pos 9-16 = CUPS, pos 9-12 = tipo de cita |
| **4** | `UPDATE grupo_especialidad` | CASE por `LIKE` en 7 grupos + OTROS (el orden importa: odontología/diagnóstico/procedimiento antes que las médicas) |
| **5** | `UPDATE nombre_sede` | Unifica subsedes de Cúcuta: Calle 8→Sede 07, CL 14→Sede 06, Calle 15→Sede 04, Sede 3/3E→Sede 03 |

### 3.4 Normalización por catálogos

La normalización **no vive en las queries**, vive en tablas `cat_*` (auditable):

- `cat_estado_cita`: mapea estado crudo → `estado_consulta` canónico.
  - **CUMPLIDA**: REAL, PLAN, AUTORIZADO, ACTIVO
  - **INCUMPLIDA**: INCUMPLIDO, `#`, CITA NO CONFIRMADA, Cita Reservada Médico
  - **CANCELADA**: CITA CANCELADA
- `cat_sede`: normaliza nombres de sede.
- `cat_regimen`, `cat_tipo_agenda`, `cat_tipo_cita`: normalizan dimensiones.
- `cat_convenio` / `cat_convenio_sap`: metadatos de convenio (clave compuesta para SAP).
- `cat_cups` / `cat_cups_pana`: homologación de CUPS.
- `cat_especialidad`: especialidad → grupo.
- `cat_convenio_agrupador`: cada `nombre_convenio` → 4 dimensiones de reporte
  (`convenio_grupo`, `sede_grupo`, `modalidad`, `regimen_grupo`), propagadas a `costos`.

---

## 4. Modelo consolidado (capa 5)

- **`costos`** — tabla maestra (~381k filas, 40 columnas). Una fila por cita,
  con la fuente, fechas, estado, CUPS, convenio, sede, especialidad y las
  columnas agrupadoras de reporte.
- **`notas_tecnicas`** — metas contratadas por CUPS y convenio
  (`n_eventos_mes`, `costo_medio_evento`).
- **`nt_map`** — tabla puente con clave `(cups, nombre_convenio)`. Resuelve la
  diferencia de granularidad: la NT trae convenios con sufijo `/ SUBSIDIADO`,
  mientras `costos` separa CONTRIBUTIVO/SUBSIDIADO. `nt_map` **duplica** esas
  filas para permitir un JOIN simple e indexable. Se reconstruye con
  `DashboardsService.rebuildNtMap()` o el script Python de extracción.

---

## 5. API NestJS (capa 6)

Toda la lógica de negocio vive en `src/dashboards/dashboards.service.ts` como
SQL crudo parametrizado. El helper `buildCostosWhere` (en
`dashboard-filters.helper.ts`) arma el `WHERE` a partir de los filtros.

### 5.1 Filtros (`buildCostosWhere`)

| Filtro | Columna en `costos` |
|--------|---------------------|
| `desde` / `hasta` | `fecha_cita` |
| `sedeGrupo` | `sede_grupo` (ciudad) |
| `sede` | `nombre_sede` (sede física) |
| `convenio` | `convenio_grupo` |
| `modalidad` | `modalidad` |
| `regimen` | `regimen_grupo` |
| `grupoEspecialidad` | `grupo_especialidad` |

### 5.2 Cálculos por endpoint

| Endpoint | Métrica principal | Fórmula / fuente |
|----------|-------------------|------------------|
| `/dashboards/resumen` | Cumplimiento global | `CUMPLIDA / con_estado` (solo convenios con NT) |
| | Convenios en riesgo | convenios con cumplimiento < 70% y > 100 citas |
| | Oportunidad promedio | `AVG(DATEDIFF(fecha_cita, fecha_deseada))` |
| `/dashboards/ejecucion-nt` | Ejecución vs meta | `citas / (meta_mes × meses)` vía JOIN `nt_map` |
| | Heatmap convenio×CUPS | top 8 CUPS por ejecución bajo el filtro |
| `/dashboards/financiero` | Costo real | `Σ nt_map.costo_medio` (solo citas con CUPS+convenio en NT) |
| | Costo esperado | `Σ meta_mes × costo_medio × 5` |
| | Eficiencia | recuperación / costo real |
| `/dashboards/calidad` | Inasistencia por convenio | `INCUMPLIDA / total` (solo convenios con NT) |
| | Oportunidad por especialidad | días promedio deseada→cita |
| `/dashboards/pym` | Cumplimiento por programa | `CUMPLIDA / con_estado` agrupado por `pym` |

### 5.3 Reglas transversales

- **Filtro solo-NT a nivel de cita**: las páginas con `soloConveniosNt`
  restringen las métricas de cumplimiento a convenios con nota técnica
  (`nombre_convenio IN (SELECT ... FROM nt_map)`). Separa el **cumplimiento de
  la IPS** (convenios con meta) del **volumen total**. Un mismo grupo comercial
  cuenta solo en las sedes donde su contrato tiene NT (p. ej. COMPENSAR CUCUTA
  EVENTO no entra, COMPENSAR CAJICA PGP sí).
- **Cumplimiento NT (Ejecución NT)**: la meta cruza con `nt_map` colapsado por
  `(cups, convenio)` con `meta_mes > 0`; `NUEVA EPS` se unifica como un solo
  convenio (`convNt`); y en cups de consulta (`8902/8903`) solo cuenta la
  ejecución con `funcionalidad = CONSULTA` (las sesiones de terapia de PANA no
  inflan el cumplimiento). El dashboard suma dos secciones: *Contratado sin
  ejecutar* y *Ejecutado fuera de NT*. Detalle completo en [AGENTS.md](../AGENTS.md).
- **Meta del período por ejecución**: el cumplimiento calcula la meta como
  `meta_mes × meses con ejecución` por `(cups, convenio)` (helper `ejecAgg`), no
  por meses transcurridos. El período actual abarca **6 meses (Ene-Jun 2026)**.
  Quedan dos divisores fijos heredados: el *fallback* `COALESCE(e.meses, 5)` del
  heatmap (solo cuando un par no tiene ejecución) y `costo_medio × 5` en el costo
  esperado del Financiero — ambos a revisar al ampliar el periodo.
- **Costo parcial por diseño**: el "costo real" solo cubre citas con CUPS y
  convenio presentes en la nota técnica. Las citas sin NT no se costean.

---

## 6. Frontend (capa 7)

Cadena de render: **página → hook TanStack Query → cliente API tipado → fetch
`/api/...` → validación Zod → componentes de charts**.

- Filtros globales single-select sincronizados a la URL
  (`useGlobalFiltersFromUrl`): periodo, sede (jerarquía Ciudad→Sede), convenio,
  modalidad, régimen, grupo de especialidad.
- `<DashboardFiltersBar soloConveniosNt />` en Resumen, Ejecución NT, Calidad y
  PyM. **Financiero** usa `<DashboardFiltersBar />` (todos los convenios, a
  propósito).
- Los filtros son **facetados**: cada selector consulta `/filtros/*` excluyendo
  su propia dimensión, de modo que solo se ofrecen combinaciones con datos.

| Ruta | Dashboard | Endpoint | solo-NT |
|------|-----------|----------|:-------:|
| `/resumen` | Resumen de Citas | `/dashboards/resumen` | ✓ |
| `/ejecucion-nt` | Ejecución vs Nota Técnica | `/dashboards/ejecucion-nt` | ✓ |
| `/financiero` | Análisis Financiero | `/dashboards/financiero` | ✗ |
| `/calidad` | Calidad y Oportunidad | `/dashboards/calidad` | ✓ |
| `/pym` | PyM / RIAS | `/dashboards/pym` | ✓ |

---

## 7. Límites conocidos (para la entrega)

1. **`costos` se reconstruye completa** en cada corrida (no incremental).
2. **Append sin deduplicación** en los maestros `Raw_*`: depende de no solapar
   rangos de descarga.
3. **Divisores de meses heredados**: `COALESCE(e.meses, 5)` (fallback del heatmap)
   y `costo_medio × 5` (costo esperado del Financiero) siguen fijos; revisar al
   ampliar el periodo.
4. **Costo real parcial**: solo se costean citas con CUPS+convenio en NT.
5. **PyM incompleto**: grupo etario y población denominador pendientes (Fase A
   del ETL); el endpoint devuelve un `_warning` explícito.
