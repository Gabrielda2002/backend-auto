# Guía de modificación de los cálculos de los dashboards — Nordvital IPS

Manual de referencia para **modificar los cálculos** de los 5 paneles BI. Explica
qué archivos tocar y cuáles no, cómo está construida cada métrica, qué reglas de
negocio no se pueden romper, y recetas paso a paso para los 4 tipos de cambio
más comunes.

> **Relacionado**: [FLUJO_DATOS.md](FLUJO_DATOS.md) (recorrido del dato de punta a
> punta) y [dashboards/README.md](dashboards/README.md) (mockups HTML base).

---

## 0. Principio fundamental

> **Todos los cálculos viven en el backend (`backend-auto`). El frontend
> (`radicar-app-frond`) NO calcula: solo consume el JSON, valida con Zod y
> pinta gráficas.**

```
costos ─┐
nt_map ─┼─► dashboards.service.ts (SQL crudo) ─► JSON ─► dashApi (Zod) ─► React (Recharts / SVG)
notas ──┘        backend-auto                         radicar-app-frond
```

Consecuencia práctica: para cambiar **un número** solo se toca el backend. El
frontend solo se toca si cambia la **forma** de la respuesta (campos nuevos,
renombrados o eliminados). Ver [§8](#8-sincronización-backend↔frontend).

---

## 1. Propósito y alcance

**Cubre:**
- Los 5 endpoints de dashboards y sus fórmulas.
- Los helpers y reglas de negocio compartidas.
- Cómo aplican los filtros globales a cada cálculo.
- Cómo verificar que un cambio no rompe la reconciliación.

**No cubre:**
- El ETL que llena `costos` / `notas_tecnicas` (ver repo de automatización y
  [FLUJO_DATOS.md](FLUJO_DATOS.md)).
- El diseño visual de los componentes React.

---

## 2. Mapa de archivos: qué tocar y qué NO

### ✅ Archivos de CÁLCULO (aquí se modifica la lógica)

| Archivo | Rol | Cuándo tocarlo |
|---|---|---|
| [`../src/dashboards/dashboards.service.ts`](../src/dashboards/dashboards.service.ts) | **Núcleo.** Las 5 funciones `getX` + 3 helpers | Casi siempre: fórmulas, KPIs, métricas |
| [`../src/dashboards/dashboard-filters.helper.ts`](../src/dashboards/dashboard-filters.helper.ts) | `buildCostosWhere()` — construye el `WHERE` de filtros | Al cambiar cómo aplica un filtro |
| [`../src/filtros/filtros.service.ts`](../src/filtros/filtros.service.ts) | Los 10 endpoints de los `<select>` de la barra de filtros | Solo si cambian las opciones de filtro |
| [`../prisma/schema.prisma`](../prisma/schema.prisma) | Tablas `Costos`, `NtMap`, `NotaTecnica` | Solo si agregas/renombras columnas |

### ⛔ Archivos de INFRAESTRUCTURA (no tocar para cambiar un cálculo)

| Archivo | Por qué no |
|---|---|
| [`../src/dashboards/dashboards.controller.ts`](../src/dashboards/dashboards.controller.ts) | Solo enruta; delega en el service |
| [`../src/dashboards/dashboards.module.ts`](../src/dashboards/dashboards.module.ts) | Cableado NestJS |
| [`../src/dashboards/dto/dashboard-filters.dto.ts`](../src/dashboards/dto/dashboard-filters.dto.ts) | Define los filtros; cambiarlo afecta a **los 5** endpoints |
| [`../src/filtros/filtros.controller.ts`](../src/filtros/filtros.controller.ts) · [`filtros.module.ts`](../src/filtros/filtros.module.ts) | Enrutado / cableado |

### Frontend (solo si cambia el shape de la respuesta)

| Archivo | Rol |
|---|---|
| `radicar-app-frond/src/featuures/Dashboards/app/lib/api/dashboards.ts` | Schemas Zod + tipos de respuesta |
| `radicar-app-frond/src/featuures/Dashboards/app/pages/{resumen,ejecucion-nt,financiero,calidad,pym}.tsx` | Render de cada panel |

---

## 3. Anatomía de un endpoint de cálculo

Los 5 métodos siguen el mismo patrón. Ejemplo simplificado:

```ts
async getResumen(filters: DashboardFiltersDto) {
  const { whereSql } = buildCostosWhere(filters);   // 1. WHERE de filtros

  const [a, b, c] = await Promise.all([             // 2. queries en paralelo
    this.prisma.$queryRaw`... FROM costos c ${whereSql} ...`,
    this.prisma.$queryRaw`... FROM costos c ${whereSql} ${ntConvenios} ...`,
    // ...
  ]);

  return {                                          // 3. shape de respuesta
    meta: serializeRow(a[0]),
    kpis: { ... },
  };
}
```

Puntos clave del patrón:
- **`buildCostosWhere(filters)`** devuelve `whereSql`, que **siempre** incluye la
  palabra `WHERE` (con `1=1` si no hay filtros). Por eso puedes concatenar más
  condiciones con `AND` sin condicionales.
- **Alias obligatorio `c`** para la tabla `costos` (los helpers lo asumen).
- Las queries corren en **`Promise.all`** (paralelas, independientes).
- **`serializeRow()`** convierte `BigInt`/`Decimal` → `number` antes de
  responder (NestJS no serializa `BigInt` nativo). Toda fila devuelta pasa por
  `serializeRow` o `.map(serializeRow)`.
- SQL **crudo** vía `Prisma.sql` (parametrizado, seguro contra inyección). No se
  usa el query builder de Prisma para estos cálculos.

---

## 4. Los helpers transversales

Definidos al inicio de [`dashboards.service.ts`](../src/dashboards/dashboards.service.ts).
**Modificarlos impacta varios paneles a la vez** — cambia con cuidado.

### `convNt(col)` — [L19](../src/dashboards/dashboards.service.ts#L19)
Unifica los convenios `NUEVA EPS …` en uno solo (`NUEVA EPS`) **solo para el
cruce con `nt_map`**. Los datos vienen partidos por régimen contributivo/
subsidiado, pero la NT aplica al convenio completo.

```sql
(CASE WHEN col LIKE 'NUEVA EPS%' THEN 'NUEVA EPS' ELSE col END)
```

No altera `costos` ni `nt_map`: es una normalización en tiempo de `JOIN`.

### `soloConsulta()` — [L30](../src/dashboards/dashboards.service.ts#L30)
Un CUPS de consulta (`8902`/`8903`) solo cuenta como ejecutado si
`funcionalidad = 'CONSULTA'`. En PANA las terapias/procedimientos heredan un
CUPS de consulta y NO deben inflar la ejecución de consultas.

```sql
AND NOT (LEFT(c.cups,4) IN ('8902','8903') AND (c.funcionalidad <> 'CONSULTA' OR c.funcionalidad IS NULL))
```

Se aplica en los **4 puntos de conteo** de Ejecución NT (KPI, heatmap, catálogo,
tendencia). Requiere alias `c`.

### `ejecAgg(where, extra?)` — [L41](../src/dashboards/dashboards.service.ts#L41)
Agrega la ejecución por `(convenio, cups)` bajo un `where`, devolviendo:
- `n` = total de citas ejecutadas.
- `meses` = número de **meses distintos con ejecución**.

Agrupa primero por `(convenio, cups, mes)` y luego acumula (evita el lento
`COUNT(DISTINCT DATE_FORMAT(...))`, resultado idéntico). `extra` permite añadir
condiciones (p.ej. filtro de top CUPS). Aplica `convNt` y `soloConsulta`
internamente.

> ⚠️ Cambiar `ejecAgg` afecta al KPI, al catálogo, al heatmap y al
> "contratado sin ejecutar" de Ejecución NT **simultáneamente**.

### `diasHabiles(dAsig, dCita)` — oportunidad en días hábiles
Calcula los días entre dos columnas de fecha **excluyendo domingos y festivos**
(los sábados sí cuentan; mismo día = 0). Se usa en la **oportunidad** de Resumen
y de Calidad.

```
días = DATEDIFF(dCita, dAsig)
      - FLOOR((DATEDIFF(dCita, dAsig) + DAYOFWEEK(dAsig) - 1) / 7)   -- domingos en (dAsig, dCita]
      - (festivos.dia en (dAsig, dCita] con DAYOFWEEK <> 1)          -- festivos no-domingo
```

- Los festivos salen de la tabla **`festivos`** (`dia DATE PK`), sembrada con los
  festivos nacionales de Colombia (ver `prisma/seed.ts`). Para añadir años,
  amplía esa lista y re-siembra.
- Pasar las columnas **calificadas** (`c.fecha_asig`, `c.fecha_cita`) porque el
  helper contiene un subquery correlacionado a `festivos`.

> ⚠️ Si cambia la definición de "día hábil" (p.ej. excluir sábados), se ajusta
> aquí y aplica a las dos oportunidades a la vez.

---

## 5. Reglas de negocio invariantes

No las rompas sin una decisión de negocio explícita. Cada una está codificada
por una razón.

| # | Regla | Dónde | Por qué existe |
|---|---|---|---|
| R1 | **meta = `meta_mes × meses CON ejecución`** (no meses transcurridos) | `ejecAgg` + JOIN a `ntMap` | Un convenio que no atendió un mes recibe menor meta; no se le penaliza por meses sin actividad |
| R2 | **Tope `LEAST(ejecutado, meta)`** por `(convenio, cups)` | KPI ejec-NT [L295](../src/dashboards/dashboards.service.ts#L295) | La sobre-ejecución de un CUPS no compensa el déficit de otro |
| R3 | **El catálogo NT reconcilia EXACTAMENTE con el KPI** | `catalogoNt` usa el mismo `ejecAgg` + `INNER JOIN nt_map` | La suma del catálogo debe dar el mismo % que el KPI en cualquier filtro |
| R4 | **Solo convenios con NT entran a cumplimiento** (evento excluido) | `ntConvenios` en Resumen/Calidad; `ntMap` en ejec-NT | La no-ejecución de evento es inasistencia del usuario, no incumplimiento de la IPS |
| R5 | **NUEVA EPS unificado** en el cruce con NT | `convNt` | La NT aplica al convenio completo, no al split por régimen |
| R6 | **`nt_map` colapsado con `HAVING SUM(meta_mes) > 0`** | Subquery `ntMap` [L249](../src/dashboards/dashboards.service.ts#L249) | Descarta pares (cups, convenio) no contratados (meta 0/nula) |
| R7 | **`costoEsperado` = `SUM(meta_mes × costo_medio × 5)`** — fijo a 5 meses, NO reacciona a filtros | Financiero [L~540](../src/dashboards/dashboards.service.ts#L540) | Es un costo esperado global de referencia, intencionalmente independiente del filtro |
| R8 | **Consulta solo con `funcionalidad = CONSULTA`** | `soloConsulta` | Evita que terapias/procedimientos PANA inflen las consultas |

---

## 6. Referencia por panel

Formato: **métrica → fórmula → tabla(s) → campo en el JSON de respuesta**.
El campo del JSON es también el nombre del campo en el schema Zod del frontend.

### 6.1 Resumen gerencial — `getResumen` · [L97](../src/dashboards/dashboards.service.ts#L97)
Endpoint `GET /api/dashboards/resumen` · schema `ResumenSchema`.

| Métrica | Fórmula (SQL) | Filtro NT | Campo JSON |
|---|---|---|---|
| Total citas + rango fechas | `COUNT(*)`, `MIN/MAX(fecha_cita)` | no | `meta.{total,desde,hasta}` |
| % cumplimiento | `100·SUM(estado='CUMPLIDA')/NULLIF(SUM(estado IS NOT NULL AND estado<>'CANCELADA'),0)` (las canceladas NO cuentan en el denominador) | **sí** (`ntConvenios`) | `kpis.cumplimiento.{pct,cumplidas,con_estado}` |
| Recuperación ($M) | `SUM(valor_recuperacion)/1e6` | no | `kpis.recuperacionMillones` |
| Convenios en riesgo | `COUNT` de `convenio_grupo` con `citas>100 AND pct<90` (alerta: por debajo de la banda de cumplimiento 90–95%) | **sí** | `kpis.conveniosRiesgo` |
| Oportunidad (días) | `AVG(dias_habiles(fecha_asig, fecha_cita))` — días entre asignación y cita **excluyendo domingos y festivos** (sábados sí; mismo día = 0). Ver helper `diasHabiles` | no | `kpis.oportunidadDias` |
| Evolución mensual | por `%Y-%m`: `COUNT(*)`, `SUM(cumplida)` | no | `evolucionMensual[]` |
| Distribución servicios | `COUNT(*)` por `funcionalidad` | no | `distribucionServicios[]` |
| Top convenios | por `convenio_grupo`: `citas` (base evaluable = cumplidas+incumplidas, sin canceladas) + `pct`; ordenado por `pct DESC, citas DESC` | **sí** | `cumplimientoTopConvenios[]` |
| Volumen por sede | `COUNT(*)` por `sede_grupo` | no | `volumenPorSede[]` |

### 6.2 Ejecución vs Nota Técnica — `getEjecucionNt` · [L226](../src/dashboards/dashboards.service.ts#L226)
Endpoint `GET /api/dashboards/ejecucion-nt` · schema `EjecucionNtSchema`. **El más
complejo.** Todo cuelga del subquery `ntMap` (regla R6) y del helper `ejecAgg`.

| Métrica | Cálculo | Campo JSON |
|---|---|---|
| KPI cumplimiento global | **Sin sede**: `SUM(LEAST(n, meta))/SUM(meta)`. **Con sede**: reparte el numerador capado de la ciudad en proporción a la ejecución de la sede (`ejecutado_sede/ejecutado_ciudad`) → reconcilia con la ciudad | `kpiCumplimientoGlobal.{ejecutado,meta_periodo,pct}` |
| Heatmap convenio × CUPS | matriz de top-8 CUPS: `meta_mes`, `ejecutado`, `pct` | `heatmapConvenioCups[]` *(no llega al front)* |
| Desviaciones | `meta_mes>100` y `pct<80 ó >120`, top 8 por `ABS(pct-100)` | `desviaciones[]` |
| Tendencia cumplimiento | por convenio y mes: `ejecutado`, `meta_mes_total`, `pct` | `tendenciaCumplimiento[]` |
| Catálogo NT | por CUPS ejecutado (INNER JOIN nt_map): `meta`, `ejecutado`, `pct` (regla R3) | `catalogoNt[]` |
| Contratado sin ejecutar | CUPS con `meta>0` y **cero** ejecución; `meta = SUM(meta_mes)·meses_periodo` | `contratadoSinEjecutar[]` |
| Ejecutado fuera de NT | CUPS ejecutados cuyo código NO está en `nt_map` (`meta_mes>0`) | `ejecutadoFueraNt[]` |

> El campo `descripcion` de varias tablas se resuelve con un subquery a
> `notas_tecnicas` (o `cat_cups` en "ejecutado fuera de NT").

### 6.3 Financiero — `getFinanciero` · [L508](../src/dashboards/dashboards.service.ts#L508)
Endpoint `GET /api/dashboards/financiero` · schema `FinancieroSchema`. Usa el
subquery `ntMapCosto` (colapsa `costo_medio` con **`AVG`** para no multiplicar
por grupo etario).

| Métrica | Fórmula | Campo JSON |
|---|---|---|
| Costo real ($M) | `SUM(m.costo_medio)/1e6` (JOIN costos↔ntMapCosto) | `kpis.costoRealMillones` |
| Citas costeadas | `COUNT(*)` del JOIN anterior | `kpis.citasCosteadas` |
| Costo esperado ($M) | `SUM(meta_mes·costo_medio·5)/1e6` — **fijo, sin filtro** (R7) | `kpis.costoEsperadoMillones` |
| Recuperación ($M) | `SUM(valor_recuperacion)/1e6` | `kpis.recuperacionMillones` |
| Eficiencia (%) | `recuperacion/costoReal·100` | `kpis.eficienciaPct` |
| Pareto CUPS | por CUPS: `COUNT(*)`, `SUM(costo_medio)/1e6` | `paretoCups[]` |
| % top-20 CUPS | `SUM(top20)/SUM(total)·100` | `paretoTop20Pct` |
| Costo por convenio | por `convenio_grupo`: citas + `$M` | `costoPorConvenio[]` |
| Recuperación por convenio | `SUM(valor_recuperacion)/1e6` donde `>0` | `recuperacionPorConvenio[]` |

> **`getFinanciero` NO usa `soloConsulta`** (intencional): debe contar
> procedimientos para el análisis de costo.

### 6.4 Calidad y oportunidad — `getCalidad` · [L642](../src/dashboards/dashboards.service.ts#L642)
Endpoint `GET /api/dashboards/calidad` · schema `CalidadSchema`.

| Métrica | Fórmula | Filtro NT | Campo JSON |
|---|---|---|---|
| Oportunidad por especialidad | `AVG(dias_habiles(fecha_asig, fecha_cita))` — días hábiles (excluye domingos y festivos) | no | `oportunidadEspecialidad[]` |
| Estado por sede | por `sede_grupo`: `pct_cump`, `pct_incump`, `pct_canc` | no | `estadoPorSede[]` |
| Inasistencia mensual | `100·SUM(estado='INCUMPLIDA')/COUNT(*)` por convenio y mes | **sí** | `inasistenciaMensual[]` |
| Mix de agenda por sede | `COUNT(*)` por `sede_grupo` + `tipo_agenda` | no | `mixAgendaPorSede[]` |

### 6.5 PyM / RIAS — `getPym` · [L728](../src/dashboards/dashboards.service.ts#L728)
Endpoint `GET /api/dashboards/pym` · schema `PymSchema`.

| Métrica | Fórmula | Campo JSON |
|---|---|---|
| Top programas | por `pym`: `COUNT(*)` + `pct_cump` | `topProgramas[]` |
| Alertas cohortes | `poblacion>200 AND pct_cump<80`, top 8 por `pct_cump ASC` | `alertasCohortes[]` |
| Aviso | texto fijo | `_warning` |

> El panel trae `_warning`: grupo etario y población denominador quedan
> pendientes de la Fase A del ETL.

---

## 7. Recetas por tipo de cambio

### 7.1 Corregir un valor incorrecto
1. Identifica el panel y la métrica en [§6](#6-referencia-por-panel) → ve al
   método `getX` correspondiente.
2. Localiza la query de esa métrica (busca el campo del JSON en el `return`).
3. Ajusta la expresión SQL. Verifica que sigues usando `whereSql` y el alias `c`.
4. Si tocaste un helper (`convNt`/`soloConsulta`/`ejecAgg`), revisa **todos** los
   paneles que lo usan ([§4](#4-los-3-helpers-transversales)).
5. Verifica ([§9](#9-cómo-verificar)). El shape no cambió → **frontend intacto**.

### 7.2 Cambiar la fórmula de una métrica
1. Igual que 7.1 para ubicar la query.
2. Reescribe la fórmula. Si la métrica participa en una reconciliación
   (catálogo ↔ KPI, regla R3), aplica el **mismo cambio en ambos lados**.
3. Documenta el "por qué" con un comentario en el código (patrón existente).
4. Verifica con `scripts/comparar_kpis.py` que la reconciliación se mantiene.
5. El shape no cambió → **frontend intacto**.

### 7.3 Agregar una métrica / KPI nuevo
**Backend:**
1. En el `getX`, añade una query nueva al `Promise.all` (respeta `whereSql` +
   alias `c`).
2. Agrega el campo al objeto `return` (pásalo por `serializeRow` / `.map`).

**Frontend (obligatorio — cambia el shape):**
3. En `.../app/lib/api/dashboards.ts`, añade el campo al schema Zod del panel
   (`IntegerOrNull` / `NumericOrNull` / `StringOrNull` / `z.array(...)`).
4. En `.../app/pages/{panel}.tsx`, renderiza el nuevo campo.
5. Verifica back y front ([§9](#9-cómo-verificar)).

> Si NO actualizas el schema Zod, el frontend **rechazará** la respuesta (Zod
> valida antes de pintar).

### 7.4 Cambiar cómo aplican los filtros
- **Un filtro existente** (p.ej. `regimen` mapea a otra columna): edita
  [`dashboard-filters.helper.ts`](../src/dashboards/dashboard-filters.helper.ts) →
  la rama `isActive(filters.X)`. Afecta a **los 5** paneles y a `filtros.service.ts`.
- **Un filtro nuevo**: añade la prop al DTO
  [`dashboard-filters.dto.ts`](../src/dashboards/dto/dashboard-filters.dto.ts),
  la rama en `buildCostosWhere`, la key en el front
  (`.../app/lib/use-filters.ts`) y, si aplica, un endpoint de opciones en
  `filtros.service.ts`.
- **Un cálculo que debe ignorar un filtro** (como la meta a nivel ciudad de
  ejec-NT): llama a `buildCostosWhere({ ...filters, X: undefined })` para ese
  bloque, como hace `whereMetaSql` con `sede`.

---

## 8. Sincronización backend↔frontend

| Cambio en backend | ¿Tocar frontend? |
|---|---|
| Cambia el **valor** de un campo existente | ❌ No |
| **Agregas** un campo | ✅ Schema Zod + página |
| **Renombras** un campo | ✅ Schema Zod + página (y buscar usos) |
| **Eliminas** un campo | ✅ Schema Zod + página (quitar usos) |
| Cambia el **tipo** (número↔string, nullable) | ✅ Ajustar primitivo Zod |

Archivos front: schemas en
`radicar-app-frond/src/featuures/Dashboards/app/lib/api/dashboards.ts`,
render en `.../app/pages/{panel}.tsx`. Primitivos Zod disponibles en
`.../app/lib/api/client.ts`: `NumericOrNull`, `IntegerOrNull`, `StringOrNull`.

---

## 9. Cómo verificar

### Backend
```bash
# desde la raíz de backend-auto
pnpm run prisma:generate   # solo si cambiaste schema.prisma
pnpm run build             # tsc: los errores de tipo bloquean
pnpm run lint
pnpm run test
```

Scripts Python de verificación de negocio (en [`../scripts/`](../scripts/)):

| Script | Para qué |
|---|---|
| [`comparar_kpis.py`](../scripts/comparar_kpis.py) | Confirma que catálogo ↔ KPI reconcilian |
| [`smoke_test_filtros.py`](../scripts/smoke_test_filtros.py) | Prueba los filtros sobre los endpoints |
| [`verificar_estados.py`](../scripts/verificar_estados.py) | Revisa los estados de cita |

### Reconstruir `nt_map`
Tras cargar/actualizar `notas_tecnicas`, llama:
```
POST /api/dashboards/admin/rebuild-nt-map
```
(reconstruye la tabla puente desde `notas_tecnicas`).

### Frontend
```bash
# desde radicar-app-frond
pnpm build   # tsc -b + vite build; errores de tipo bloquean
pnpm lint
```
Prueba visual: `/paneles/{resumen|ejecucion-nt|financiero|calidad|pym}`.

---

## 10. Checklist antes de cerrar un cambio

- [ ] La query usa `whereSql` y el alias `c` para `costos`.
- [ ] Las filas devueltas pasan por `serializeRow` (BigInt/Decimal → number).
- [ ] Si toqué un helper, revisé **todos** los paneles que lo usan.
- [ ] Si la métrica reconcilia (R3), apliqué el cambio en ambos lados.
- [ ] No rompí ninguna regla invariante de [§5](#5-reglas-de-negocio-invariantes) sin acuerdo de negocio.
- [ ] Si cambió el shape → actualicé el schema Zod y la página del panel.
- [ ] `build` + `lint` + `test` en backend; `build` + `lint` en frontend.
- [ ] Verifiqué la reconciliación con `comparar_kpis.py` (si aplica).
- [ ] Comenté el "por qué" del cálculo no obvio en el código.
```
