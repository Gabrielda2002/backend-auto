# AGENTS.md

## Package manager (pnpm)

- **This repo uses pnpm** (root `pnpm-lock.yaml` + `pnpm-workspace.yaml`). Do NOT
  use npm — there are no `package-lock.json` files anymore.
- pnpm is provided via **corepack** (`corepack 0.34.6`, pnpm `11.5.3`). If `pnpm`
  is not on PATH, run `corepack enable` from an **Administrator** PowerShell
  (writing the shims to `C:\Program Files\nodejs` needs admin; a normal shell
  fails with EPERM).
- **`web/` is a separate pnpm project** (it has its own `pnpm-workspace.yaml`,
  `pnpm-lock.yaml` and `node_modules`). Run `pnpm install` inside `web/`
  separately from the root install.
- **Build scripts are already approved** and committed to each
  `pnpm-workspace.yaml` (`allowBuilds` + `onlyBuiltDependencies`), so a normal
  `pnpm run start:dev` / `pnpm dev` works out of the box:
  - Root: `prisma`, `@prisma/engines`, `@nestjs/core`, `unrs-resolver`
  - `web/`: `esbuild`
- If a future fresh install ever shows `ERR_PNPM_IGNORED_BUILDS` again (e.g. a
  new package adds build scripts), re-approve with `pnpm approve-builds` (press
  SPACE or `a` to select each package, then ENTER and confirm with `y` — do NOT
  just press ENTER without selecting, that records them as `false`).
- **`web/pnpm-workspace.yaml` sets `verifyDepsBeforeRun: false`** so `pnpm dev`
  is not blocked by the pre-run dependency check. The root project still has the
  check on; as a fallback (if builds are ever un-approved and you can't approve
  them), start node directly:
  - Frontend: `cd web; node node_modules/vite/bin/vite.js`
  - Backend:  `node node_modules/@nestjs/cli/bin/nest.js start --watch`

## Commands

Backend (run from repo root):

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev server (watch) | `pnpm run start:dev` |
| Build | `pnpm run build` |
| Lint (auto-fix) | `pnpm run lint` |
| Format | `pnpm run format` |
| Typecheck | `npx tsc --noEmit` (no script defined) |
| Unit tests | `pnpm run test` |
| Single test | `npx jest --testPathPattern=<pattern>` |
| E2E tests | `pnpm run test:e2e` |
| Generate Prisma client | `pnpm run prisma:generate` |
| Run migrations | `pnpm run prisma:migrate` |
| Seed DB | `pnpm run prisma:seed` |

Frontend (run from `web/`):

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev server | `pnpm dev` (or `node node_modules/vite/bin/vite.js`) |
| Build (typecheck + bundle) | `pnpm build` |
| Typecheck only | `npx tsc --noEmit` |
| Lint (auto-fix) | `pnpm lint` |

Run order after changes: `prisma:generate` (if schema changed) → `build` → `lint` → `test`

## Architecture

- **NestJS 11** API for Nordvital IPS healthcare appointment cost consolidation.
- **Prisma 7** with `@prisma/adapter-mariadb` (NOT the default driver). `PrismaService` extends `PrismaClient` and constructs the MariaDB adapter from env vars.
- **`PrismaModule` is `@Global()`** — do not import it in feature modules; inject `PrismaService` directly.
- Global prefix: `api` (set in `src/main.ts`).
- Entry point: `src/main.ts` → production runs `node dist/src/main` (note the `src/` in the path).
- Logging: Winston via `nest-winston` (`src/common/logger/winston.config.ts`), writes to `logs/`.
- Global exception filter: `AllExceptionsFilter` (`src/common/filters/`).
- Rate limiting: `ThrottlerGuard` registered globally via `APP_GUARD`.

## Ejecución NT — cumplimiento rules (`src/dashboards/dashboards.service.ts`)

The `getEjecucionNt` cumplimiento logic is the densest part of the backend. Key
helpers and rules (all reconcile: catalog meta == KPI meta):

- **`convNt(col)`** — normalizes the convenio for the NT match: every
  `NUEVA EPS …` collapses to a single `NUEVA EPS` (the data is split by régimen
  contributivo/subsidiado but the NT applies to the whole convenio). Only affects
  the `nt_map` join; never mutates `costos` or `nt_map`.
- **`ejecAgg(where, extra)`** — aggregates by `(convNt(convenio), cups)` returning
  `n` (citas) and `meses` (distinct months with execution). Groups by month then
  rolls up to avoid a slow `COUNT(DISTINCT DATE_FORMAT(...))`. The period meta is
  `meta_mes * meses` — **months WITH execution, not months elapsed** (a convenio
  that skips a month gets a smaller meta).
- **`soloConsulta()`** — a consulta cups (`8902/8903`) is only credited by
  execution with `funcionalidad = 'CONSULTA'`. In PANA the therapy sessions and
  procedures inherit a consulta cups (derived from `especialidad_cita`) and must
  NOT count as executed consultas; procedure cups still count normally. Applied at
  the 4 counting points (KPI, heatmap, catálogo, tendencia).
- **`ntMap`** — subquery collapsing `nt_map` to one row per `(cups, convenio)`
  (sums `meta_mes` across age groups / `programa`) with `HAVING SUM(meta_mes) > 0`
  to drop non-contracted pairs (meta 0). The KPI caps per-pair over-execution with
  `LEAST(ejecutado, meta)`.
- **Extra sections**: `contratadoSinEjecutar` (NT cups with meta > 0 and zero
  execution under the filter) and `ejecutadoFueraNt` (cups executed in `costos`
  whose code is not in `nt_map`) — used to spot gaps in `nt_map`.
- **`funcionalidad` is assigned by the ETL, not the raw data**: PLENUS brings it
  natively; PANA derives it (`especialidad` not empty → CONSULTA, empty →
  PROCEDIMIENTO); SAP by cups range. Detail lives in the ETL repo,
  `sql/04_insert_costos.sql`.
- `getFinanciero` is intentionally NOT affected by `soloConsulta` (it must keep
  counting procedures for cost analysis).

## Database

- **MariaDB/MySQL** database `citas_db`.
- **Two separate connection configs**: `DATABASE_URL` is used by Prisma CLI for migrations only. Runtime uses `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` env vars.
- Schema: `prisma/schema.prisma` — catalog tables (`Cat*`), raw data tables (`Raw*`), master table (`Costos`).
- Seed reads CSV files from `prisma/data/` and hardcodes catalog entries.
- `sql/` directory is gitignored — contains raw SQL scripts, not managed by Prisma.
- After any schema change, run `pnpm run prisma:generate` before building.

## Project Structure

- `src/prisma/` — Global PrismaModule + PrismaService.
- `src/common/` — Cross-cutting: filters, logger config, middleware.
- `src/dashboards/` — the 5 dashboard endpoints **and** all NT-cumplimiento logic (see "Ejecución NT — cumplimiento rules" above). Includes `dashboard-filters.helper.ts` (`buildCostosWhere`).
- `src/filtros/` — catalog endpoints that feed the UI selects (sedes, convenios, modalidades, regímenes…).
- The 14 per-table CRUD modules (`cat-*`, `raw-*`) were removed as dead code; only the modules above are registered in `app.module.ts`.
- `test/` — E2E tests with separate Jest config (`test/jest-e2e.json`).
- `scripts/` — Python utilities (ETL extract, Excel generation, verification). See `scripts/README.md`.
- `web/` — **Vite + React frontend** (dashboards UI). Structure:
  - `web/src/pages/` — one file per dashboard (`resumen`, `ejecucion-nt`, `financiero`, `calidad`, `pym`) + `library-demo`.
  - `web/src/components/ui/` — primitives (button, card, select, badge…).
  - `web/src/components/charts/` — visualizations (gauge, heatmap-cell, sparkline, stacked-bar, kpi-card, carousel…).
  - `web/src/components/motion/` — animation primitives (`blur-fade`, `number-ticker`), powered by `motion` (ex Framer Motion).
  - `web/src/components/filters/` — `global-filters` (presentational) + `dashboard-filters-bar` (smart wrapper).
  - `web/src/components/layout/` — page-shell, sidebar, topbar, footer.
  - `web/src/lib/api/` — typed API client split by domain: `client.ts` (fetch + Zod primitives + `DashboardFilters`), `filtros.ts`, `dashboards.ts`, `index.ts` (barrel; consumers import from `@/lib/api`).
  - `web/src/lib/` — `queries.ts` (TanStack Query hooks), `use-filters.ts` (URL-synced filters), `periodos.ts`, `theme.tsx`, `utils.ts`.

## Frontend (web/)

- **Vite 5 + React 18 + TypeScript**, Tailwind 3, TanStack Query + TanStack Table, Recharts, Zod, `motion`.
- Data source: calls the NestJS API at `/api` (configurable via `VITE_API_BASE`).
- **Filters are single-select**, synced to the URL query string via `useGlobalFiltersFromUrl`. Active dimensions: `desde`/`hasta` (periodo), `sedeGrupo` (shown as "Sede"), `convenio`, `modalidad`, `regimen`.
- Dashboards aggregate by the **agrupador columns** (`convenio_grupo`, `sede_grupo`) by default; the backend returns full lists (no top-N), and the UI paginates them with the `Carousel` component.
- **Ejecución NT page** (`web/src/pages/ejecucion-nt.tsx`) renders the catálogo plus the *Contratado sin Ejecutar* and *Ejecutado fuera de NT* sections (all `Carousel`s). The catálogo and contratado sections have a local search with a CUPS/descripción toggle (`CupsSearch`) that filters the already-loaded rows on top of the global filters.

## Conventions & Quirks

- **TypeScript `module: "nodenext"`** — set in `tsconfig.json`. NestJS compiler handles module resolution, but be aware of this setting.
- **ESLint 9 flat config** (`eslint.config.mjs`) with `typescript-eslint` type-checked rules + Prettier. `no-explicit-any` is OFF; `no-floating-promises` is WARN.
- **New modules use kebab-case.** The old per-table `cat-*`/`raw-*` CRUD modules (which had mixed kebab/snake naming) were removed; the only backend modules now are `dashboards`, `filtros`, `common`, `prisma`.
- **Prettier**: single quotes, trailing commas, `endOfLine: "auto"`.
- **No `typecheck` script** — use `npx tsc --noEmit` directly.
- **`tsconfig.build.json`** excludes `test/`, `**/*spec.ts`, and `prisma.config.ts`.
- `.env` is gitignored; copy `.env.example` to `.env` for local dev.
- Port defaults to `5808` (from `.env.example`), falls back to `3000` if `PORT` is unset.
- **No barrel files in the backend (`src/`)** — never use `index.ts` barrel exports there. Always import directly from the source file (e.g., `import { Foo } from './dto/create-foo.dto'`). The frontend `web/src/lib/api/index.ts` is an intentional exception: a facade barrel so consumers keep importing from `@/lib/api`.
- **`costos` agrupador columns** (added by ETL v2.1): `convenio_grupo`, `sede_grupo`, `modalidad`, `regimen_grupo`, mapped from `cat_convenio_agrupador`. Dashboards and filters use these.
