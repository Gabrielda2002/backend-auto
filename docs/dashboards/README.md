# Dashboards base — NORDVITAL IPS

HTMLs originales de Stitch separados desde `docs/codigo_base_ds`, listos para extraer artefactos al frontend React.

## Archivos

| # | Archivo | Dashboard | Item activo en sidebar |
|---|---|---|---|
| 1 | `01_resumen_gerencial.html` | Resumen Gerencial | `dashboard` |
| 2 | `02_ejecucion_vs_nota_tecnica.html` | Ejecución vs Nota Técnica | `monitoring` |
| 3 | `03_analisis_financiero.html` | Análisis Financiero | `payments` |
| 4 | `04_calidad_oportunidad.html` | Calidad y Oportunidad | `high_quality` |
| 5 | `05_pym_rias.html` | PyM / RIAS | `health_and_safety` |

## Convención de zonas (comentarios `<!-- [ZONA] -->`)

Cada archivo está anotado con marcadores para facilitar extracción a componentes React/shadcn:

| Marcador | Componente futuro | Notas |
|---|---|---|
| `[HEAD]` | `index.html` + `tailwind.config.ts` + tokens M3 | Idéntico en los 5; consolidar |
| `[SIDEBAR]` | `components/layout/Sidebar.tsx` | Idéntico salvo item activo |
| `[TOPBAR]` | `components/layout/Topbar.tsx` | Cambia título + badge |
| `[FILTERS]` | `components/filters/GlobalFilters.tsx` + filtros locales | Sede + Periodo globales |
| `[KPIS]` | `components/dashboards/<page>/KpiStrip.tsx` | Específico por página |
| `[CHARTS]` | `components/dashboards/<page>/*Chart.tsx` | Bento grid de visualizaciones |
| `[TABLE]` | `components/dashboards/<page>/*Table.tsx` | Solo donde aplica |
| `[FOOTER]` | `components/layout/Footer.tsx` | Idéntico en los 5 |

## Datos estáticos vs dinámicos

Todos los valores numéricos hardcoded (KPIs, %, $, nombres de convenios, sedes y CUPS) son **datos estáticos de demo** del HTML Stitch. Deben reemplazarse por payloads de los endpoints FastAPI (`/api/...`). Ver `docs/plan_fase_2.md` Fase 0 — matriz de trazabilidad.

## Configuración estática (compartida)

- **Tokens Tailwind/M3** (colores, spacing, fontFamily, fontSize, borderRadius): idénticos en los 5 HTML. Centralizar en `web/tailwind.config.ts`.
- **Fuentes externas**: Google Fonts `Inter` + `Material Symbols Outlined`.
- **Tailwind CDN**: `cdn.tailwindcss.com?plugins=forms,container-queries` — solo para preview; en React se usa build de Tailwind.
