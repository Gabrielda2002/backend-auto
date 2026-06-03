# AGENTS.md

## Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev server | `pnpm run start:dev` |
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
- `src/cat-sede/`, `src/cat_convenio/` — Feature modules (catalog CRUD).
- `test/` — E2E tests with separate Jest config (`test/jest-e2e.json`).

## Conventions & Quirks

- **TypeScript `module: "nodenext"`** — set in `tsconfig.json`. NestJS compiler handles module resolution, but be aware of this setting.
- **ESLint 9 flat config** (`eslint.config.mjs`) with `typescript-eslint` type-checked rules + Prettier. `no-explicit-any` is OFF; `no-floating-promises` is WARN.
- **Inconsistent folder naming** exists: `cat-sede` (kebab-case) vs `cat_convenio` (snake_case). Follow the existing convention of the module you are working in; new modules should use kebab-case.
- **Prettier**: single quotes, trailing commas, `endOfLine: "auto"`.
- **No `typecheck` script** — use `npx tsc --noEmit` directly.
- **`tsconfig.build.json`** excludes `test/`, `**/*spec.ts`, and `prisma.config.ts`.
- `.env` is gitignored; copy `.env.example` to `.env` for local dev.
- Port defaults to `5808` (from `.env.example`), falls back to `3000` if `PORT` is unset.
- **No barrel files** — never use `index.ts` barrel exports. Always import directly from the source file (e.g., `import { Foo } from './dto/create-foo.dto'`).
