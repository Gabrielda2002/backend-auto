import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from '../dashboards/dto/dashboard-filters.dto';
import { buildAggWhere } from '../dashboards/dashboard-filters.helper';

/**
 * Fragmento SQL: limita a citas cuyo contrato (nombre_convenio) tiene nota
 * tecnica vigente. Se aplica a nivel de cita (no de marca) para que un mismo
 * grupo comercial cuente solo donde su contrato tiene NT (p.ej. COMPENSAR
 * CAJICA PGP entra, COMPENSAR CUCUTA EVENTO no). `soloNt` lo activa.
 */
function ntFiltro(soloNt: boolean): Prisma.Sql {
  return soloNt
    ? Prisma.sql`AND a.nombre_convenio IN (SELECT DISTINCT nombre_convenio FROM nt_map)`
    : Prisma.empty;
}

@Injectable()
export class FiltrosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sedes presentes en costos (no del catalogo: lo realmente cargado) */
  async getSedes(): Promise<
    Array<{ value: string; label: string; citas: number }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{ nombre_sede: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT nombre_sede, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg
        WHERE nombre_sede IS NOT NULL
        GROUP BY nombre_sede ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.nombre_sede,
      label: r.nombre_sede,
      citas: Number(r.n),
    }));
  }

  /** Convenios presentes en costos */
  async getConvenios(): Promise<
    Array<{ value: string; label: string; citas: number; tieneNT: boolean }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{ nombre_convenio: string; n: bigint; tiene_nt: number }>
    >(
      Prisma.sql`
        -- El LEFT JOIN va contra nt_map COLAPSADO por convenio, no contra la
        -- tabla cruda. nt_map tiene una fila por (convenio, cups): unir sin
        -- colapsar multiplica cada fila de citas por las ~1.000 lineas que el
        -- convenio tiene en la nota tecnica. Eso hacia dos cosas malas a la vez:
        -- el conteo salia inflado por ese factor, y la consulta no terminaba
        -- (media >180 s, era la que ahogaba el pool en produccion).
        SELECT
          a.nombre_convenio,
          CAST(COALESCE(SUM(a.citas),0) AS SIGNED) AS n,
          MAX(CASE WHEN m.conv IS NOT NULL THEN 1 ELSE 0 END) AS tiene_nt
        FROM costos_agg a
        LEFT JOIN (SELECT DISTINCT nombre_convenio AS conv FROM nt_map) m
          ON m.conv = a.nombre_convenio
        WHERE a.nombre_convenio IS NOT NULL
        GROUP BY a.nombre_convenio ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.nombre_convenio,
      label: r.nombre_convenio,
      citas: Number(r.n),
      tieneNT: Number(r.tiene_nt) === 1,
    }));
  }

  /** Grupos de especialidad homologados (costos.grupo_especialidad).
   *  Facetado: solo los presentes bajo los demas filtros. Excluye
   *  `grupoEspecialidad`. `soloNt` limita a citas con nota tecnica. */
  async getGruposEspecialidad(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<Array<{ value: string; label: string; citas: number }>> {
    const { grupoEspecialidad: _omit, especialidad: _e, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ grupo_especialidad: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT grupo_especialidad, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg a ${whereSql}
          AND grupo_especialidad IS NOT NULL AND grupo_especialidad <> ''
          ${ntFiltro(soloNt)}
        GROUP BY grupo_especialidad ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.grupo_especialidad,
      label: r.grupo_especialidad,
      citas: Number(r.n),
    }));
  }

  /** Rango fechas cubierto en costos (para defaults del front) */
  async getRangoFechas(): Promise<{
    desde: string | null;
    hasta: string | null;
    totalCitas: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ desde: Date | null; hasta: Date | null; total: bigint }>
    >(
      Prisma.sql`SELECT MIN(fecha_cita) AS desde, MAX(fecha_cita) AS hasta, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS total FROM costos_agg`,
    );
    const r = rows[0];
    return {
      desde: r?.desde ? r.desde.toISOString().slice(0, 10) : null,
      hasta: r?.hasta ? r.hasta.toISOString().slice(0, 10) : null,
      totalCitas: Number(r?.total ?? 0),
    };
  }

  /** Agrupadores comerciales (costos.convenio_grupo, ej. COMPENSAR, NUEVA EPS).
   *  Facetado: devuelve solo los convenios presentes bajo los demas filtros
   *  activos (sede, periodo, modalidad, regimen). Excluye `convenio` del
   *  WHERE para no auto-filtrar la propia lista.
   *  Si `soloNt` es true, limita a convenios con nota tecnica vigente
   *  (los de evento/particular sin NT no se comparan, irian al 100%). */
  async getConveniosGrupo(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<Array<{ value: string; label: string; citas: number }>> {
    const { convenio: _omit, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ convenio_grupo: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT convenio_grupo, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg a ${whereSql}
          AND convenio_grupo IS NOT NULL AND convenio_grupo <> ''
          ${ntFiltro(soloNt)}
        GROUP BY convenio_grupo ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.convenio_grupo,
      label: r.convenio_grupo,
      citas: Number(r.n),
    }));
  }

  /** Sede agrupada (costos.sede_grupo, ej. CAJICA, CHIA, GENERAL).
   *  Facetado: devuelve solo las sedes presentes bajo los demas filtros
   *  activos. Excluye `sedeGrupo` y `sede` del WHERE. `soloNt` limita a sedes
   *  donde el convenio activo tiene nota tecnica. */
  async getSedesGrupo(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<Array<{ value: string; label: string; citas: number }>> {
    const { sedeGrupo: _g, sede: _s, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ sede_grupo: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT sede_grupo, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg a ${whereSql}
          AND sede_grupo IS NOT NULL AND sede_grupo <> ''
          ${ntFiltro(soloNt)}
        GROUP BY sede_grupo ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.sede_grupo,
      label: r.sede_grupo,
      citas: Number(r.n),
    }));
  }

  /**
   * Jerarquia Ciudad -> Sede fisica. Cada ciudad (sede_grupo) lista sus
   * sedes fisicas (nombre_sede). Para descartar el ruido de digitacion
   * (citas de un convenio de una ciudad atendidas fisicamente en otra, p.ej.
   * "SEDE CHIA" con 6 citas dentro de CUCUTA) se exige un minimo de citas por
   * sede (`MIN_CITAS_SEDE`). Facetado y `soloNt` igual que los demas filtros.
   */
  async getSedesJerarquia(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<
    Array<{
      value: string;
      label: string;
      citas: number;
      sedes: Array<{ value: string; label: string; citas: number }>;
    }>
  > {
    const MIN_CITAS_SEDE = 50;
    const { sedeGrupo: _g, sede: _s, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ sede_grupo: string; nombre_sede: string | null; n: bigint }>
    >(
      Prisma.sql`
        SELECT sede_grupo, nombre_sede, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg a ${whereSql}
          AND sede_grupo IS NOT NULL AND sede_grupo <> ''
          ${ntFiltro(soloNt)}
        GROUP BY sede_grupo, nombre_sede
        ORDER BY sede_grupo, n DESC
      `,
    );

    const map = new Map<
      string,
      {
        citas: number;
        sedes: Array<{ value: string; label: string; citas: number }>;
      }
    >();
    for (const r of rows) {
      const ciudad = map.get(r.sede_grupo) ?? { citas: 0, sedes: [] };
      const n = Number(r.n);
      ciudad.citas += n;
      // Solo sedes con volumen relevante (descarta ruido cruzado).
      if (r.nombre_sede && n >= MIN_CITAS_SEDE) {
        ciudad.sedes.push({
          value: r.nombre_sede,
          label: r.nombre_sede,
          citas: n,
        });
      }
      map.set(r.sede_grupo, ciudad);
    }

    // Conjunto de ciudades (sede_grupo) para detectar ruido cruzado: una sede
    // fisica cuyo nombre corresponde a OTRA ciudad (p.ej. "SEDE CAJICA" dentro
    // de CHIA) es un registro mal digitado, no una jerarquia real. La unica
    // ciudad multi-sede real es Cucuta (Sede 01-07); las demas tienen una sola
    // sede homonima.
    const ciudades = new Set(map.keys());
    const sedeCity = (nombreSede: string) =>
      nombreSede
        .replace(/^NORDVITAL IPS\s*-?\s*SEDE\s*/i, '')
        .trim()
        .toUpperCase();

    return Array.from(map.entries())
      .map(([ciudad, v]) => ({
        value: ciudad,
        label: ciudad,
        citas: v.citas,
        sedes: v.sedes.filter((s) => {
          const city = sedeCity(s.label);
          // Descarta la sede si pertenece a otra ciudad existente.
          return !(ciudades.has(city) && city !== ciudad.toUpperCase());
        }),
      }))
      .sort((a, b) => b.citas - a.citas);
  }

  /**
   * Jerarquia Grupo comercial -> Convenio. Cada convenio_grupo lista sus
   * convenios (nombre_convenio normalizado: NUEVA EPS unificado, igual que el
   * mapa de calor). Espejo de getSedesJerarquia. Facetado y `soloNt` igual que
   * los demas filtros; excluye `convenio` y `convenioDetalle` del WHERE.
   */
  async getConveniosJerarquia(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<
    Array<{
      value: string;
      label: string;
      citas: number;
      convenios: Array<{ value: string; label: string; citas: number }>;
    }>
  > {
    const MIN_CITAS_CONV = 50;
    const { convenio: _g, convenioDetalle: _d, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ convenio_grupo: string; convenio: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT convenio_grupo,
               (CASE WHEN a.nombre_convenio LIKE 'NUEVA EPS%' THEN 'NUEVA EPS' ELSE a.nombre_convenio END) AS convenio,
               CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n
        FROM costos_agg a ${whereSql}
          AND convenio_grupo IS NOT NULL AND convenio_grupo <> ''
          AND a.nombre_convenio IS NOT NULL AND a.nombre_convenio <> ''
          ${ntFiltro(soloNt)}
        GROUP BY convenio_grupo, convenio
        ORDER BY convenio_grupo, n DESC
      `,
    );

    const map = new Map<
      string,
      {
        citas: number;
        convenios: Array<{ value: string; label: string; citas: number }>;
      }
    >();
    for (const r of rows) {
      const grupo = map.get(r.convenio_grupo) ?? { citas: 0, convenios: [] };
      const n = Number(r.n);
      grupo.citas += n;
      // Solo convenios con volumen relevante (descarta residuales).
      if (r.convenio && n >= MIN_CITAS_CONV) {
        grupo.convenios.push({
          value: r.convenio,
          label: r.convenio,
          citas: n,
        });
      }
      map.set(r.convenio_grupo, grupo);
    }

    return Array.from(map.entries())
      .map(([grupo, v]) => ({
        value: grupo,
        label: grupo,
        citas: v.citas,
        convenios: v.convenios,
      }))
      .sort((a, b) => b.citas - a.citas);
  }

  /** Modalidades contractuales (costos.modalidad, ej. PGP, CAPITA, EVENTO).
   *  Facetado: solo las presentes bajo los demas filtros. Excluye `modalidad`. */
  async getModalidades(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<Array<{ value: string; label: string; citas: number }>> {
    const { modalidad: _omit, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ modalidad: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT modalidad, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg a ${whereSql}
          AND modalidad IS NOT NULL AND modalidad <> ''
          ${ntFiltro(soloNt)}
        GROUP BY modalidad ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.modalidad,
      label: r.modalidad,
      citas: Number(r.n),
    }));
  }

  /** Regimenes agrupados (costos.regimen_grupo: CONTRIBUTIVO / SUBSIDIADO).
   *  Facetado: solo los presentes bajo los demas filtros. Excluye `regimen`. */
  async getRegimenes(
    filters: DashboardFiltersDto = {},
    soloNt = false,
  ): Promise<Array<{ value: string; label: string; citas: number }>> {
    const { regimen: _omit, ...rest } = filters;
    const { whereSql } = buildAggWhere(rest);
    const rows = await this.prisma.$queryRaw<
      Array<{ regimen_grupo: string; n: bigint }>
    >(
      Prisma.sql`
        SELECT regimen_grupo, CAST(COALESCE(SUM(citas),0) AS SIGNED) AS n FROM costos_agg a ${whereSql}
          AND regimen_grupo IS NOT NULL AND regimen_grupo <> ''
          ${ntFiltro(soloNt)}
        GROUP BY regimen_grupo ORDER BY n DESC
      `,
    );
    return rows.map((r) => ({
      value: r.regimen_grupo,
      label: r.regimen_grupo,
      citas: Number(r.n),
    }));
  }
}
