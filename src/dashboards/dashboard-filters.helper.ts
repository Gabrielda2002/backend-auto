import { Prisma } from '@prisma/client';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

const ALL = 'all';

function isActive(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value !== ALL;
}

/**
 * Construye fragmentos SQL reutilizables para WHERE filtrados sobre la tabla
 * pre-agregada `costos_agg`. Devuelve `Prisma.Sql` (template tag) compatible
 * con $queryRaw.
 *
 * Diseno:
 *  - `whereSql` SIEMPRE incluye la palabra WHERE (con `1=1` si no hay filtros).
 *    Esto permite concatenar condiciones extra con AND siempre, sin
 *    condicionales en cada query.
 *  - `conditions` son las condiciones puras (sin WHERE) para componer dentro de
 *    subqueries o CTEs.
 *  - `hasFilters` indica si algun filtro distinto de los defaults fue enviado
 *    (util para metadata de respuesta).
 *
 * CONTRATO DE ALIAS: todas las condiciones se emiten con el prefijo `a.`, asi
 * que la consulta que las reciba DEBE leer de `costos_agg` con alias `a`. El
 * fragmento se inyecta a ciegas, sin validacion: si el FROM usa otro alias,
 * MySQL responde 1054 "Unknown column" en runtime y TypeScript no lo detecta.
 *
 * Hubo un segundo builder homonimo, `buildCostosWhere`, que emitia alias `c`
 * para la tabla cruda `costos`. Tras migrar los dashboards a `costos_agg` quedo
 * sin llamadores, pero sobrevivio lo suficiente para que un bloque lo usara por
 * error e inyectara condiciones `c.` en consultas sobre `costos_agg`: rompia el
 * KPI de ejecucion-nt al filtrar por sede fisica. Se elimino por eso. Si algun
 * dia hace falta filtrar `costos` en crudo, parametriza el alias en ESTA
 * funcion en vez de duplicarla.
 */
export function buildAggWhere(filters: DashboardFiltersDto): {
  whereSql: Prisma.Sql;
  conditions: Prisma.Sql;
  hasFilters: boolean;
} {
  const parts: Prisma.Sql[] = [];

  if (filters.desde) {
    parts.push(Prisma.sql`a.fecha_cita >= ${filters.desde}`);
  }
  if (filters.hasta) {
    parts.push(Prisma.sql`a.fecha_cita <= ${filters.hasta}`);
  }
  if (isActive(filters.sede)) {
    parts.push(Prisma.sql`a.nombre_sede = ${filters.sede}`);
  }
  if (isActive(filters.convenio)) {
    parts.push(Prisma.sql`a.convenio_grupo = ${filters.convenio}`);
  }
  if (isActive(filters.convenioDetalle)) {
    // Ya normalizado al construir el agregado: convenio_nt == convNt(nombre_convenio).
    parts.push(Prisma.sql`a.convenio_nt = ${filters.convenioDetalle}`);
  }
  if (isActive(filters.sedeGrupo)) {
    parts.push(Prisma.sql`a.sede_grupo = ${filters.sedeGrupo}`);
  }
  if (isActive(filters.modalidad)) {
    parts.push(Prisma.sql`a.modalidad = ${filters.modalidad}`);
  }
  if (isActive(filters.regimen)) {
    parts.push(Prisma.sql`a.regimen_grupo = ${filters.regimen}`);
  }
  if (isActive(filters.especialidad)) {
    parts.push(Prisma.sql`a.especialidad = ${filters.especialidad}`);
  }
  if (isActive(filters.grupoEspecialidad)) {
    parts.push(Prisma.sql`a.grupo_especialidad = ${filters.grupoEspecialidad}`);
  }

  const conditions = parts.length
    ? Prisma.sql`${Prisma.join(parts, ' AND ')}`
    : Prisma.sql`1=1`;

  return {
    whereSql: Prisma.sql`WHERE ${conditions}`,
    conditions,
    hasFilters: parts.length > 0,
  };
}
