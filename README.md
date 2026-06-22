# Dashboard NT — Nordvital IPS

Consolidación y análisis de costos de citas médicas vs. Nota Técnica para
**Nordvital IPS**. Monorepo con un backend **NestJS** (API sobre MariaDB) y un
frontend **Vite + React** con 5 dashboards interactivos.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  citas_db (MariaDB)                                          │
│   · costos (maestra, ~381k filas)   · notas_tecnicas         │
│   · cat_* (catálogos)               · nt_map (puente)        │
│   · raw_* (datos crudos PLENUS/PANA/SAP)                     │
└───────────────┬─────────────────────────────────────────────┘
                │ Prisma 7 + @prisma/adapter-mariadb
                ▼
        ┌───────────────────────┐        ┌──────────────────────┐
        │  Backend NestJS (src/) │  /api  │  Frontend Vite (web/)│
        │  · /dashboards/*       │◀──────▶│  · React + Recharts  │
        │  · /filtros/*          │        │  · TanStack Query    │
        │  · caché + throttler   │        │  · motion (animación)│
        └───────────────────────┘        └──────────────────────┘
```

- **Backend**: NestJS 11, Prisma 7 con `@prisma/adapter-mariadb`. Prefijo global
  `api`. Puerto `5808` (o `3000` si `PORT` no está definido).
- **Frontend**: Vite 5 + React 18 + Tailwind 3, TanStack Query/Table, Recharts,
  Zod y `motion`. Consume la API en `/api`.
- **ETL**: consolida PLENUS, PANA y SAP en `costos` (ver `scripts/` y la
  documentación en `docs/`).

## Flujo de datos end-to-end

```
PLENUS ─┐
PANA  ──┼─► CSV maestros ─► raw_* ─► 04_insert_costos.sql ─► costos ─► API NestJS ─► 5 dashboards
SAP   ─┘    (append-only)   (MySQL)   (5 BLOQUES)            (+ nt_map)  /dashboards    React
```

El recorrido completo del dato (orígenes → ETL → `costos`/`nt_map` → API →
dashboards), las reglas de negocio (mapeo de estados, regla NORDVITAL→NUEVA EPS,
jerarquía de sedes), los cálculos de cada endpoint y los límites conocidos están
documentados en:

- **[docs/FLUJO_DATOS.md](docs/FLUJO_DATOS.md)** — narrativa completa del flujo
  y diccionario de cálculos por dashboard.
- **[docs/diagramas/flujo_completo_e2e.drawio](docs/diagramas/flujo_completo_e2e.drawio)**
  — diagrama end-to-end (abrir con [draw.io](https://app.diagrams.net)).
- El detalle del ETL (carga, BLOQUES, catálogos) vive en el repo
  `automatizaci-n-costos-vs-nota-tecnica`, `docs/DOCUMENTACION_PROYECTO.md`.

## Requisitos

- Node.js (con **corepack** habilitado para pnpm).
- MariaDB/MySQL con la base `citas_db`.
- Python 3 (solo para los scripts de `scripts/`).

## Puesta en marcha

### 1. Habilitar pnpm (una vez)

Este repo usa **pnpm** vía corepack. Si `pnpm` no está en el PATH, en una
**PowerShell como Administrador**:

```powershell
corepack enable
pnpm --version   # debe imprimir 11.x
```

### 2. Variables de entorno

```powershell
Copy-Item .env.example .env   # editar credenciales de MariaDB
```

Runtime usa `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
La CLI de Prisma (migraciones) usa `DATABASE_URL`.

### 3. Backend

```powershell
pnpm install
pnpm approve-builds        # marcar prisma, @prisma/engines, @nestjs/core, unrs-resolver (SPACE + ENTER)
pnpm run prisma:generate
pnpm run start:dev         # API en http://localhost:5808/api
```

### 4. Frontend

```powershell
cd web
pnpm install
pnpm approve-builds        # marcar esbuild (SPACE + ENTER)
pnpm dev                   # UI en http://localhost:5173
```

> **Nota**: en la raíz, `pnpm run <script>` hace un chequeo previo de
> dependencias que falla mientras haya *build scripts* sin aprobar. El frontend
> (`web/`) ya lo desactiva con `verifyDepsBeforeRun: false`. Si en la raíz no
> puedes aprobar los builds, arranca llamando node directo:
> - Frontend: `node node_modules/vite/bin/vite.js`
> - Backend: `node node_modules/@nestjs/cli/bin/nest.js start --watch`

## Comandos útiles

Backend (raíz):

| Tarea | Comando |
|------|---------|
| Dev (watch) | `pnpm run start:dev` |
| Build | `pnpm run build` |
| Lint | `pnpm run lint` |
| Typecheck | `npx tsc --noEmit` |
| Tests | `pnpm run test` / `pnpm run test:e2e` |
| Prisma generate | `pnpm run prisma:generate` |
| Prisma migrate | `pnpm run prisma:migrate` |
| Seed | `pnpm run prisma:seed` |

Frontend (`web/`):

| Tarea | Comando |
|------|---------|
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `pnpm lint` |

## Estructura

```
src/                      Backend NestJS
  dashboards/             5 endpoints agregados + toda la lógica de cumplimiento NT
  filtros/                catálogos para selects (sedes, convenios, modalidades, regímenes…)
  common/                 filtros, logger (Winston), middleware
  prisma/                 PrismaModule global + PrismaService (adapter MariaDB)
prisma/
  schema.prisma           modelos (Cat*, Raw*, Costos, NotaTecnica, NtMap, CatConvenioAgrupador)
web/                      Frontend Vite + React (proyecto pnpm independiente)
  src/pages/              una página por dashboard
  src/components/{ui,charts,motion,filters,layout}/
  src/lib/api/            cliente API tipado por dominio (client, filtros, dashboards)
  src/lib/                queries (TanStack), use-filters (URL), utils
scripts/                  utilidades Python (ver scripts/README.md)
docs/                     documentación del proyecto y dashboards estáticos (legacy)
```

## Dashboards

1. **Resumen Gerencial** — KPIs globales, evolución mensual, cumplimiento por convenio.
2. **Ejecución vs Nota Técnica** — cumplimiento vs meta NT, heatmap convenio×CUPS, catálogo NT (con buscador por CUPS/descripción) y las secciones *Contratado sin Ejecutar* y *Ejecutado fuera de NT*.
3. **Análisis Financiero** — costo real vs esperado, recuperación, Pareto de CUPS.
4. **Calidad y Oportunidad** — oportunidad por especialidad, estados por sede, inasistencia.
5. **PyM / RIAS** — programas de promoción y mantenimiento.

Los filtros (Periodo, Sede, Convenio, Modalidad, Régimen) son globales,
single-select y se sincronizan con la URL. Las secciones con muchos datos se
recorren con un carrusel paginado (no se limitan a un top-N).

> **Cálculos y límites**: el cumplimiento se mide solo sobre convenios con nota
> técnica. La meta del período es `meta_mes × meses con ejecución` por
> `(cups, convenio)`; `NUEVA EPS` se trata como un solo convenio (`convNt`); los
> pares con meta 0 se excluyen; y en cups de consulta (`8902/8903`) solo cuenta la
> ejecución con `funcionalidad = CONSULTA` (las sesiones de terapia de PANA no
> inflan el cumplimiento). El Financiero sigue contando todo (incluye
> procedimientos). El período actual abarca **6 meses (Ene-Jun 2026)**; el heatmap
> usa un *fallback* de `meses = 5` solo cuando un par no tiene ejecución. Detalle
> de la lógica en [AGENTS.md](AGENTS.md) y [docs/FLUJO_DATOS.md](docs/FLUJO_DATOS.md).

## Base de datos

- `DATABASE_URL` → solo para migraciones de Prisma.
- Runtime → `DB_HOST/PORT/USER/PASSWORD/NAME`.
- Tras cambiar `schema.prisma`: `pnpm run prisma:generate` antes de compilar.
- Columnas agrupadoras en `costos` (ETL v2.1): `convenio_grupo`, `sede_grupo`,
  `modalidad`, `regimen_grupo` (desde `cat_convenio_agrupador`).

## Convenciones

Ver [AGENTS.md](AGENTS.md) para el detalle de convenciones, quirks y notas de pnpm.
