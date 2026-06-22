# Dashboard NT — Web

Frontend del Tablero Gerencial Nordvital IPS. React 18 + TypeScript + Vite + Tailwind + shadcn-style primitives.

## Stack

- **Build**: Vite 5
- **UI**: TailwindCSS 3 + componentes propios estilo shadcn (Radix headless + cva)
- **Charts**: Recharts (lazy) + componentes SVG propios para sparklines/gauges/heatmaps
- **Data**: TanStack Query (cache 5 min) + Zod (futuro)
- **Tables**: TanStack Table
- **Theming**: CSS vars (light/dark) con tokens M3 portados desde Stitch
- **Iconos**: lucide-react

## Comandos

```powershell
cd web
pnpm install
pnpm dev        # http://localhost:5173, proxy /api -> http://localhost:3000
pnpm build      # tsc --noEmit + vite build
pnpm preview    # sirve dist/
pnpm lint
```

## Estructura

```
web/src/
  components/
    ui/             # primitivos shadcn-style: button, card, badge, select, banner-info
    layout/         # sidebar, topbar, footer, page-shell
    filters/        # global-filters
    charts/         # kpi-card, gauge, progress-bar, heatmap-cell, sparkline,
                    # stacked-bar, status-badge, mini-treemap
    data/           # data-table (TanStack Table)
  lib/
    utils.ts        # cn, formatNumber, formatCurrency, formatPercent
    theme.tsx       # ThemeProvider (light/dark con localStorage)
  pages/
    library-demo.tsx  # showcase de todos los artefactos
  index.css         # tokens M3 como CSS vars + Tailwind base
  main.tsx          # router + providers
```

## Tokens

Los tokens M3 (colores, spacing, tipografias, radios) se definen en `tailwind.config.ts` y `src/index.css`.
Provienen del `designTheme` de Stitch (project `8294010403954932792`).

Tema claro/oscuro: el `ThemeProvider` agrega `class="light"` o `class="dark"` al `<html>`. Las vars CSS responden automaticamente.

## Demo

Ruta `/library` muestra todos los componentes con datos representativos
extraidos de `citas_db` (Ene-May 2026). Sirve como referencia visual y de API.

## Estado actual

Solo libreria de componentes. Las paginas reales de los 5 dashboards
(Resumen, Ejec. vs NT, Financiero, Calidad, PyM/RIAS) se construyen en la
siguiente iteracion, conectadas a los endpoints NestJS via TanStack Query.
