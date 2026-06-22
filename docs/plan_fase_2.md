# Plan: Dashboard Gerencial Nordvital IPS — Fase 2 (Web)

> **Estrategia elegida: Opción A** — Alinear datos primero, frontend después.
> Cero retrabajo, contratos cerrados antes de tocar React.

---

## TL;DR

1. **Auditar Stitch** → extraer qué datos pide cada uno de los 5 dashboards.
2. **Cerrar Fase A del ETL** en el repo `automatizacion-costos-vs-nota-tecnica`:
   - Modificar `python/03_carga_diaria_DB.py` para añadir `fecha_nacimiento`, `edad`, `grupo_etario` (y reforzar `sexo`).
   - Cargar tabla `nota_tecnica` con su carga inicial + vistas `v_nt_homologada` / `v_nt_vigente`.
   - Crear vista plana `v_dashboard_gerencial`.
3. **Construir backend FastAPI** sobre las vistas nuevas.
4. **Construir frontend React + TypeScript + shadcn/ui** consumiendo el backend.
5. **Desplegar** en AWS EC2 con refresh nocturno.

---

## Fase 0 — Auditoría y contratos de datos (bloqueante)

Objetivo: que cada widget de cada dashboard Stitch tenga un endpoint con un shape de datos definido **antes** de tocar SQL o React.

### Tareas

1. Descargar los 14 HTML de Stitch (5 dashboards × claro/oscuro + variantes Financiero).
2. Por cada pantalla, inventariar:
   - KPIs (cards numéricas).
   - Charts (tipo, ejes, series, agregación).
   - Tablas (columnas, orden, paginación).
   - Filtros locales propios.
3. Producir **matriz de trazabilidad**:

   | Dashboard | Widget | Métrica | Campos `costos`/NT | SQL borrador | ¿Gap? |
   |---|---|---|---|---|---|

4. Definir **contratos por endpoint** (Pydantic en backend, Zod en front):
   - `GET /api/resumen-gerencial`
   - `GET /api/ejecucion-nota-tecnica`
   - `GET /api/analisis-financiero`
   - `GET /api/calidad-oportunidad`
   - `GET /api/pym-rias`
   - `GET /api/filtros/{sedes|convenios|cups|especialidades}` (catálogos para selects)
5. Extraer **design tokens** del `designTheme` de Stitch (colores M3, Inter, spacing 8/12/24/32/40/64, `ROUND_EIGHT`) a un archivo de referencia para el front.

### Entregables

- `docs/matriz_widgets.md` (matriz de trazabilidad).
- `docs/contratos_api.md` (shape de cada endpoint).
- `docs/design_tokens.md` (tokens portados desde Stitch).

---

## Fase A — Preparación de datos (ETL)

> Repo: `automatizacion-costos-vs-nota-tecnica`
> Duración estimada según plan original: 1 a 2 semanas.

### A.1 Ampliar `costos` con datos demográficos

**Script a modificar:** `python/03_carga_diaria_DB.py` (y `sql/01_create_tables.sql`, `sql/04_insert_costos.sql`).

Nuevas columnas en `costos`:

| Columna | Tipo | Origen | Notas |
|---|---|---|---|
| `fecha_nacimiento` | DATE | PLENUS/PANA/SAP (confirmar por fuente) | NULL si no disponible |
| `edad` | SMALLINT | Calculada: `TIMESTAMPDIFF(YEAR, fecha_nacimiento, fecha_cita)` | Se recalcula en cada carga |
| `grupo_etario` | VARCHAR(30) | Derivado de `edad` (ver bucketización abajo) | Para filtros PyM/RIAS |
| `sexo` | CHAR(1) | Ya existe — auditar nulls/normalización | F/M/NULL |

**Bucketización de `grupo_etario`** (a confirmar con negocio, propuesta inicial RIAS):

- `0-5` Primera infancia
- `6-11` Infancia
- `12-17` Adolescencia
- `18-28` Juventud
- `29-59` Adultez
- `60+` Vejez

### Cambios concretos

**`sql/01_create_tables.sql`** — añadir columnas a `costos`:

```sql
ALTER TABLE costos
  ADD COLUMN fecha_nacimiento DATE NULL AFTER nombre,
  ADD COLUMN edad SMALLINT NULL AFTER fecha_nacimiento,
  ADD COLUMN grupo_etario VARCHAR(30) NULL AFTER edad;
```

**`sql/04_insert_costos.sql`** — en los tres bloques (PLENUS/PANA/SAP) propagar `fecha_nacimiento` desde RAW y calcular `edad`/`grupo_etario` con un `CASE`. Si una fuente no trae fecha, queda NULL.

**`python/03_carga_diaria_DB.py`** — verificar que el SQL nuevo se ejecute en el reset de `costos`. No requiere lógica Python adicional si todo va en el SQL.

### A.2 Cargar Nota Técnica

Nueva tabla:

```sql
CREATE TABLE nota_tecnica (
  id INT AUTO_INCREMENT PRIMARY KEY,
  programa VARCHAR(50),         -- CRONICOS / PYM / AGUDOS
  cups VARCHAR(20),
  nombre_convenio VARCHAR(300),
  anio SMALLINT,
  mes TINYINT,
  meta_eventos INT,
  meta_valor DECIMAL(18,2),
  vigente TINYINT(1) DEFAULT 1,
  fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- Crear `python/04_cargar_nota_tecnica.py` (lee Excel/CSV vigente y hace TRUNCATE+INSERT).
- Vistas:
  - `v_nt_homologada` — NT con CUPS homologados contra `cat_cups`.
  - `v_nt_vigente` — solo filas con `vigente=1`.

### A.3 Vista plana `v_dashboard_gerencial`

```sql
CREATE OR REPLACE VIEW v_dashboard_gerencial AS
SELECT
  c.*,
  nt.meta_eventos,
  nt.meta_valor,
  nt.programa AS programa_nt
FROM costos c
LEFT JOIN v_nt_vigente nt
  ON nt.cups = c.cups
 AND nt.nombre_convenio = c.nombre_convenio
 AND nt.anio = YEAR(c.fecha_cita)
 AND nt.mes  = MONTH(c.fecha_cita);
```

### A.4 Índices de performance

```sql
CREATE INDEX ix_costos_fecha_sede   ON costos (fecha_cita, nombre_sede);
CREATE INDEX ix_costos_conv_tiposer ON costos (nombre_convenio, tipo_servicio);
CREATE INDEX ix_costos_cups_fecha   ON costos (cups, fecha_cita);
CREATE INDEX ix_costos_grupo_etario ON costos (grupo_etario, sexo);
```

### A.5 Validaciones

- `SELECT fuente, COUNT(*), SUM(fecha_nacimiento IS NULL) FROM costos GROUP BY fuente;`
- `SELECT grupo_etario, COUNT(*) FROM costos GROUP BY grupo_etario;`
- Cobertura NT: `SELECT COUNT(*) FROM v_dashboard_gerencial WHERE meta_eventos IS NOT NULL;`

### Entregables Fase A

- `costos` con +3 columnas pobladas.
- Tabla `nota_tecnica` cargada.
- Vistas `v_nt_homologada`, `v_nt_vigente`, `v_dashboard_gerencial`.
- Doc ETL actualizada (sección 6 diccionario, sección 7 reglas).

---

## Fase 1 — Backend FastAPI

> Repo: `Dashboard_NT/api/`

1. Scaffold: `fastapi`, `uvicorn`, `sqlalchemy`, `pymysql`, `pydantic`, `python-dotenv`, `python-jose` (JWT), `fastapi-cache2`.
2. Reusar el `.env` del ETL (mismas credenciales MySQL).
3. Estructura:

   ```
   api/
     app/
       main.py
       core/         (config, security, cache)
       db/           (session, models)
       schemas/      (Pydantic — mismos shapes que Zod del front)
       routers/      (resumen.py, ejecucion_nt.py, financiero.py, calidad.py, pym.py, filtros.py)
       repositories/ (queries SQL por dashboard)
     tests/
   ```

4. Cache 5 min con `@cache(expire=300)` por endpoint.
5. Autenticación JWT (login básico + protección).
6. CORS abierto a dominio del frontend.
7. OpenAPI/Swagger en `/docs`.

### Entregables

- API corriendo localmente con 6 endpoints contestando datos reales contra `v_dashboard_gerencial`.
- Tests pytest por endpoint (comparan agregados con SQL directo).

---

## Fase 2 — Frontend React + TypeScript + shadcn

> Repo: `Dashboard_NT/web/`

### Stack

| Capa | Librería |
|---|---|
| Build | Vite |
| Lenguaje | TypeScript |
| UI | shadcn/ui + TailwindCSS (vía MCP `shadcn`) |
| Charts | Recharts (wrapper `Chart` de shadcn) |
| Data | TanStack Query (staleTime 5 min, alineado con cache backend) |
| Tablas | TanStack Table |
| Validación | Zod (1:1 con Pydantic backend) |
| Routing | React Router v6 |
| Theming | CSS vars + `next-themes` (claro/oscuro 1:1 con Stitch) |

### Estructura

```
web/
  src/
    app/                (routing, providers)
    components/
      ui/               (shadcn primitives)
      charts/
      filters/          (GlobalFilters, filtros por página)
      layout/           (Sidebar, Topbar, PageShell)
    pages/
      ResumenGerencial.tsx
      EjecucionNT.tsx
      AnalisisFinanciero.tsx
      CalidadOportunidad.tsx
      PymRias.tsx
    lib/
      api.ts            (cliente fetch + Zod parse)
      schemas/          (Zod por endpoint)
      theme.ts          (tokens Stitch → Tailwind)
    hooks/
```

### Tareas

1. Init Vite + React + TS + Tailwind + shadcn.
2. Portar tokens Stitch a `tailwind.config.ts` + `globals.css` (light/dark).
3. Layout base: sidebar con 5 dashboards, topbar con toggle tema, contenedor `PageShell`.
4. `GlobalFilters`: rango de fechas (default últimos 12 meses) + sede multi, sincronizado con URL.
5. Construir las 5 páginas siguiendo 1:1 los HTML Stitch (referencia visual, código React nuevo).
6. Cada página: filtros locales + queries TanStack + widgets shadcn + charts Recharts.
7. Estados de loading/error/empty consistentes.

---

## Fase 3 — Hardening y despliegue

1. Auth real: pantalla de login, persistencia de token, protección de rutas.
2. Logging estructurado backend + Sentry/error boundaries frontend.
3. Tests:
   - Backend: pytest endpoints + queries.
   - Frontend: Vitest componentes + Playwright e2e (login → cada dashboard).
4. Build:
   - Frontend: `vite build` → estáticos servidos por Nginx.
   - Backend: Uvicorn workers detrás de Nginx con HTTPS.
5. AWS EC2: mismo servidor del MySQL o separado (a decidir).
6. Tarea programada nocturna (Task Scheduler en máquina de cargas): bots → `01_carga_diaria_csv.py` → `03_carga_diaria_DB.py`. La API solo lee.

---

## Verificación global

- Snapshot lado-a-lado React vs HTML Stitch por dashboard (≥95% fidelidad visual).
- Cada endpoint: comparar agregados con SQL directo contra `citas_db`.
- Lighthouse: perf ≥85, a11y ≥90.
- e2e: login → filtros globales → cada dashboard responde <2s con caché caliente.

---

## Scope

**Incluido**

- 5 dashboards web con filtros globales y locales.
- Auth JWT.
- Refresh diario.
- Claro/oscuro.

**Excluido por ahora**

- Edición de Nota Técnica desde la UI.
- Exportación PDF/Excel.
- Alertas/notificaciones.
- Mobile-first (responsive sí, mobile-first no).

---

## Decisiones pendientes (a confirmar antes de Fase A)

1. **Fuente real de `fecha_nacimiento`**: ¿de qué columna de PLENUS/PANA/SAP sale? (probable: PLENUS la tiene, PANA/SAP confirmar).
2. **Bucketización `grupo_etario`**: ¿se valida la propuesta RIAS (0-5, 6-11, 12-17, 18-28, 29-59, 60+) o negocio prefiere otra?
3. **Origen de Nota Técnica**: ¿Excel mantenido por negocio? ¿quién lo entrega? ¿qué granularidad real (mensual / anual / por convenio)?
4. **Hosting**: ¿mismo EC2 del MySQL para FastAPI+Nginx, o instancia separada?
5. **Toggle de tema**: ¿manual por usuario, o automático según sistema operativo?

---

## Archivos clave

- `docs/DOCUMENTACION_PROYECTO ETL.md` — modelo `costos` actual (37 columnas).
- `docs/plan_visualizacion.md` — KPIs, filtros, fases originales.
- `.env` — credenciales MySQL (compartido ETL ↔ FastAPI).
- Repo ETL: `python/03_carga_diaria_DB.py`, `sql/01_create_tables.sql`, `sql/04_insert_costos.sql`.
- Stitch project `8294010403954932792` — 14 pantallas (referencia visual).
