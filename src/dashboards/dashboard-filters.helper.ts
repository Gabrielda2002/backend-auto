import { Prisma } from '@prisma/client';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

const ALL = 'all';

function isActive(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value !== ALL;
}

/**
 * Construye fragmentos SQL reutilizables para WHERE filtrados.
 * Devuelve `Prisma.Sql` (template tag) compatible con $queryRaw.
 *
 * Diseno:
 *  - `whereSql`  SIEMPRE incluye la palabra WHERE (con `c.1=1` si no hay
 *    filtros). Esto permite concatenar condiciones extra con AND siempre,
 *    sin condicionales en cada query.
 *  - `conditions` son las condiciones puras (sin WHERE) para componer
 *    dentro de subqueries o CTEs.
 *  - `hasFilters` indica si algun filtro distinto de los defaults fue
 *    enviado (util para metadata de respuesta).
 *
 * Convencion del caller: usar alias `c` para `costos`.
 */
export function buildCostosWhere(filters: DashboardFiltersDto): {
  whereSql: Prisma.Sql;
  conditions: Prisma.Sql;
  hasFilters: boolean;
} {
  const parts: Prisma.Sql[] = [];

  if (filters.desde) {
    parts.push(Prisma.sql`c.fecha_cita >= ${filters.desde}`);
  }
  if (filters.hasta) {
    parts.push(Prisma.sql`c.fecha_cita <= ${filters.hasta}`);
  }
  if (isActive(filters.sede)) {
    parts.push(Prisma.sql`c.nombre_sede = ${filters.sede}`);
  }
  if (isActive(filters.convenio)) {
    parts.push(Prisma.sql`c.convenio_grupo = ${filters.convenio}`);
  }
  if (isActive(filters.convenioDetalle)) {
    // Detalle del convenio con NUEVA EPS unificado (mismo criterio que convNt).
    parts.push(
      Prisma.sql`(CASE WHEN c.nombre_convenio LIKE 'NUEVA EPS%' THEN 'NUEVA EPS' ELSE c.nombre_convenio END) = ${filters.convenioDetalle}`,
    );
  }
  if (isActive(filters.sedeGrupo)) {
    parts.push(Prisma.sql`c.sede_grupo = ${filters.sedeGrupo}`);
  }
  if (isActive(filters.modalidad)) {
    parts.push(Prisma.sql`c.modalidad = ${filters.modalidad}`);
  }
  if (isActive(filters.regimen)) {
    parts.push(Prisma.sql`c.regimen_grupo = ${filters.regimen}`);
  }
  if (isActive(filters.especialidad)) {
    parts.push(Prisma.sql`c.especialidad = ${filters.especialidad}`);
  }
  if (isActive(filters.grupoEspecialidad)) {
    parts.push(Prisma.sql`c.grupo_especialidad = ${filters.grupoEspecialidad}`);
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

/**
 * Igual que `buildCostosWhere` pero para la tabla pre-agregada `costos_agg`,
 * con alias `a`. Se mantiene como funcion aparte y no como parametro de alias
 * porque hay una diferencia real, no solo cosmetica: `convenioDetalle` en
 * `costos` necesita el CASE de NUEVA EPS sobre `nombre_convenio`, mientras que
 * en el agregado esa normalizacion ya vino resuelta en la columna
 * `convenio_nt`. El resto de dimensiones son homonimas.
 *
 * Convencion del caller: usar alias `a` para `costos_agg`.
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
