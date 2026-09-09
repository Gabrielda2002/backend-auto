import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { buildCostosWhere } from './dashboard-filters.helper';

@Injectable()
export class DashboardsService {
  private readonly logger = new Logger(DashboardsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normaliza el convenio para el CRUCE con la nota tecnica: todos los
   * "NUEVA EPS ..." son un solo convenio (los datos los parten por regimen
   * contributivo/subsidiado, pero la NT aplica al convenio completo). Se usa
   * solo en el match con nt_map; no altera costos ni nt_map.
   */
  private convNt(col: string): Prisma.Sql {
    return Prisma.sql`(CASE WHEN ${Prisma.raw(col)} LIKE 'NUEVA EPS%' THEN 'NUEVA EPS' ELSE ${Prisma.raw(col)} END)`;
  }

  /**
   * Filtro para el cumplimiento NT: un cups de consulta (8902/8903) solo se
   * acredita con ejecucion de funcionalidad CONSULTA. En PANA las sesiones de
   * terapia/procedimientos quedan con un cups de consulta (derivado de
   * especialidad_cita) y NO deben contar como consulta ejecutada; los cups de
   * procedimiento (que la NT tambien contrata) cuentan normal. Requiere alias `c`.
   */
  private soloConsulta(): Prisma.Sql {
    return Prisma.sql`AND NOT (LEFT(c.cups,4) IN ('8902','8903') AND (c.funcionalidad <> 'CONSULTA' OR c.funcionalidad IS NULL))`;
  }

  private excluirAgendasNoAsistenciales(): Prisma.Sql {
    return Prisma.sql`AND UPPER(TRIM(COALESCE(c.nombre_medico, ''))) <> 'TOMA DE MUESTRAS NUEVA EPS CUCUTA'`;
  }

  // Excluye citas canceladas de los conteos mostrados (null-safe: NULL cuenta).
  private excluirCanceladas(): Prisma.Sql {
    return Prisma.sql`AND NOT (c.estado_consulta <=> 'CANCELADA')`;
  }

  /**
   * Agregado por (convenio, cups) bajo `where`: n (citas) y meses (meses
   * distintos con ejecucion). Evita COUNT(DISTINCT ...) por grupo (lento):
   * agrupa por (convenio, cups, mes) y luego acumula. Resultado IDENTICO,
   * mucho mas rapido. `extra` permite condiciones extra (p.ej. top_cups).
   * meses = COUNT(ym) ignora fecha NULL (igual que COUNT(DISTINCT fecha)).
   */
  private ejecAgg(
    where: Prisma.Sql,
    extra: Prisma.Sql = Prisma.empty,
  ): Prisma.Sql {
    return Prisma.sql`(
      SELECT t.nombre_convenio, t.cups, SUM(t.cnt) AS n, COUNT(t.ym) AS meses
      FROM (
        SELECT ${this.convNt('c.nombre_convenio')} AS nombre_convenio, c.cups,
               EXTRACT(YEAR_MONTH FROM c.fecha_cita) AS ym, COUNT(*) AS cnt
        FROM costos c ${where}
          AND c.cups IS NOT NULL AND c.nombre_convenio IS NOT NULL
          ${this.excluirAgendasNoAsistenciales()} ${this.soloConsulta()} ${extra}
        GROUP BY ${this.convNt('c.nombre_convenio')}, c.cups, EXTRACT(YEAR_MONTH FROM c.fecha_cita)
      ) t
      GROUP BY t.nombre_convenio, t.cups
    )`;
  }

  /**
   * Meses del periodo bajo `where`: numero de meses distintos con datos en
   * costos (fecha_cita). Base de meta para TODOS los convenios contratados
   * (con o sin ejecucion), no solo los meses con ejecucion.
   */
  private periodoMeses(where: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`(
      SELECT GREATEST(COUNT(DISTINCT EXTRACT(YEAR_MONTH FROM c.fecha_cita)), 1)
      FROM costos c ${where} AND c.fecha_cita IS NOT NULL
        ${this.excluirAgendasNoAsistenciales()}
    )`;
  }

  /**
   * Universo CONTRATADO bajo `where`: todos los pares (convenio, cups) de la
   * nota tecnica (meta_mes>0) para los convenios con actividad en el filtro,
   * tengan o no ejecucion. meta = meta_mes * meses del periodo; n = ejecucion
   * (0 si el par no ejecuto). La meta suma TODOS los convenios contratados,
   * no solo los que ejecutaron (KPI y catalogo de Ejecucion NT).
   */
  private contratadoScope(where: Prisma.Sql, ntMap: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`(
      SELECT m.nombre_convenio, m.cups,
             m.meta_mes * ${this.periodoMeses(where)} AS meta,
             COALESCE(e.n, 0) AS n
      FROM ${ntMap} m
      JOIN (
        SELECT DISTINCT ${this.convNt('c.nombre_convenio')} AS nombre_convenio
        FROM costos c ${where} AND c.nombre_convenio IS NOT NULL
          ${this.excluirAgendasNoAsistenciales()}
      ) cs ON cs.nombre_convenio = m.nombre_convenio
      LEFT JOIN ${this.ejecAgg(where)} e
        ON e.cups = m.cups AND e.nombre_convenio = m.nombre_convenio
    )`;
  }

  /**
   * Costo CONTRATADO por mes bajo `where`, en pesos. Se lee de
   * `notas_tecnicas` (la fuente) y NO de `nt_map`: nt_map desdobla cada
   * contrato 'X CONTRIBUTIVO / SUBSIDIADO' en dos filas para que el JOIN
   * contra costos matchee por regimen, asi que sumarlo directo cuenta el
   * contrato dos veces (inflaba ~39% el costo esperado del Financiero).
   *
   * Se acota a los convenios con actividad bajo el filtro, invirtiendo el
   * desdoble de rebuildNtMap(): cada fila de la NT puede aparecer en costos
   * bajo una de dos variantes de nombre, y basta que cualquiera este activa.
   *
   * OJO: la nota tecnica NO tiene dimension de sede. Al filtrar por sede el
   * resultado es "el contrato completo de los convenios que operan en esa
   * sede", no una meta prorrateada por sede — misma semantica que
   * contratadoScope en ejecucion-nt.
   */
  private contratoMensual(where: Prisma.Sql): Prisma.Sql {
    const activos = Prisma.sql`(
      SELECT DISTINCT ${this.convNt('c.nombre_convenio')}
      FROM costos c ${where} AND c.nombre_convenio IS NOT NULL
        ${this.excluirAgendasNoAsistenciales()}
    )`;
    // Las dos variantes de nombre que rebuildNtMap() genera por fila de la NT.
    const sinSufijo = `CASE WHEN nt.convenio LIKE '% / SUBSIDIADO'
                            THEN REPLACE(nt.convenio,' / SUBSIDIADO','')
                            ELSE nt.convenio END`;
    const comoSubsidiado = `REPLACE(REPLACE(nt.convenio,' / SUBSIDIADO',''),' CONTRIBUTIVO',' SUBSIDIADO')`;
    return Prisma.sql`(
      SELECT COALESCE(SUM(nt.n_eventos_mes * nt.costo_medio_evento), 0)
      FROM notas_tecnicas nt
      WHERE nt.cups IS NOT NULL
        AND (
          ${this.convNt(sinSufijo)} IN ${activos}
          OR (nt.convenio LIKE '% / SUBSIDIADO'
              AND ${this.convNt(comoSubsidiado)} IN ${activos})
        )
    )`;
  }

  /**
   * Oportunidad en DIAS HABILES entre las columnas dAsig y dCita, excluyendo
   * domingos y festivos (tabla `festivos`). Los sabados SI cuentan. Mismo dia = 0.
   * = DATEDIFF - domingos - festivos_no_domingo, en el intervalo (dAsig, dCita].
   *  - domingos en (A,B]: FLOOR((DATEDIFF(B,A) + DAYOFWEEK(A) - 1) / 7)
   *    (verificado para los 7 dias de inicio).
   *  - festivos no-domingo: COUNT de festivos.dia en (A,B] con DAYOFWEEK <> 1
   *    (los festivos que caen en domingo ya se restaron arriba; no se cuentan dos veces).
   * Pasar las columnas calificadas, p.ej. 'c.fecha_asig'.
   */
  private diasHabiles(dAsig: string, dCita: string): Prisma.Sql {
    const a = Prisma.raw(dAsig);
    const b = Prisma.raw(dCita);
    return Prisma.sql`(
      DATEDIFF(${b}, ${a})
      - FLOOR((DATEDIFF(${b}, ${a}) + DAYOFWEEK(${a}) - 1) / 7)
      - (SELECT COUNT(*) FROM festivos f WHERE f.dia > ${a} AND f.dia <= ${b} AND DAYOFWEEK(f.dia) <> 1)
    )`;
  }
  // ═══════════════════════════════════════════════════════════════
  //  ADMIN: reconstruir tabla puente nt_map
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reconstruye nt_map desde notas_tecnicas duplicando filas
   * "X / SUBSIDIADO" en X CONTRIBUTIVO + X SUBSIDIADO.
   * Llamar despues de cargar o actualizar notas_tecnicas.
   */
  async rebuildNtMap(): Promise<{ rows: number }> {
    await this.prisma.$executeRawUnsafe('DELETE FROM nt_map');
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO nt_map (nombre_convenio, cups, meta_mes, costo_medio, programa)
      SELECT
        CASE WHEN convenio LIKE '% / SUBSIDIADO'
             THEN REPLACE(convenio,' / SUBSIDIADO','')
             ELSE convenio END,
        cups, n_eventos_mes, costo_medio_evento, programa
      FROM notas_tecnicas
      WHERE cups IS NOT NULL
      UNION ALL
      SELECT
        REPLACE(REPLACE(convenio,' / SUBSIDIADO',''),' CONTRIBUTIVO',' SUBSIDIADO'),
        cups, n_eventos_mes, costo_medio_evento, programa
      FROM notas_tecnicas
      WHERE convenio LIKE '% / SUBSIDIADO' AND cups IS NOT NULL
    `);
    const result = await this.prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM nt_map`,
    );
    const rows = Number(result[0]?.n ?? 0);
    this.logger.log(`nt_map reconstruida: ${rows} filas`);
    return { rows };
  }

  // ═══════════════════════════════════════════════════════════════
  //  D1 — RESUMEN GERENCIAL
  // ═══════════════════════════════════════════════════════════════

  async getResumen(filters: DashboardFiltersDto) {
    const { whereSql } = buildCostosWhere(filters);

    // Solo los convenios con nota tecnica entran al ANALISIS de cumplimiento.
    // Los de evento (sin NT) se ven en los datos de volumen, pero su tasa de
    // cita cumplida/incumplida no aplica (el evento ejecutado es 100%; las no
    // ejecutadas son inasistencias del usuario, no incumplimiento de la IPS).
    // Se filtra a nivel de cita (nombre_convenio en nt_map): asi un mismo grupo
    // comercial cuenta solo en las sedes donde su contrato tiene NT (p.ej.
    // COMPENSAR CUCUTA EVENTO no entra, pero COMPENSAR CAJICA PGP si).
    const ntConvenios = Prisma.sql`
      AND ${this.convNt('c.nombre_convenio')} IN (SELECT DISTINCT ${this.convNt('nombre_convenio')} FROM nt_map)`;

    const [
      meta,
      cumplimiento,
      recuperacion,
      conveniosRiesgo,
      oportunidad,
      evolucion,
      distribucion,
      topConvenios,
      topSedes,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ total: bigint; desde: Date | null; hasta: Date | null }>
      >(
        Prisma.sql`
            SELECT COUNT(*) AS total, MIN(fecha_cita) AS desde, MAX(fecha_cita) AS hasta
            FROM costos c ${whereSql}
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ pct: number | null; cumplidas: bigint; con_estado: bigint }>
      >(
        Prisma.sql`
            SELECT
              ROUND(100 * SUM(estado_consulta='CUMPLIDA') / NULLIF(SUM(estado_consulta IS NOT NULL AND estado_consulta <> 'CANCELADA'),0), 1) AS pct,
              SUM(estado_consulta='CUMPLIDA') AS cumplidas,
              SUM(estado_consulta IS NOT NULL AND estado_consulta <> 'CANCELADA') AS con_estado
            FROM costos c ${whereSql} ${ntConvenios}
              ${this.excluirAgendasNoAsistenciales()}
          `,
      ),
      this.prisma.$queryRaw<Array<{ millones: number | null }>>(
        Prisma.sql`SELECT ROUND(SUM(valor_recuperacion)/1e6,1) AS millones FROM costos c ${whereSql}`,
      ),
      this.prisma.$queryRaw<Array<{ n: bigint }>>(
        Prisma.sql`
            SELECT COUNT(*) AS n FROM (
              SELECT convenio_grupo,
                     100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL AND estado_consulta <> 'CANCELADA'),0) AS pct,
                     COUNT(*) AS citas
              FROM costos c ${whereSql}
                AND convenio_grupo IS NOT NULL ${ntConvenios}
                ${this.excluirAgendasNoAsistenciales()}
              GROUP BY convenio_grupo
              HAVING citas > 100 AND pct < 90
            ) t
          `,
      ),
      this.prisma.$queryRaw<Array<{ dias: number | null }>>(
        Prisma.sql`
            SELECT ROUND(AVG(${this.diasHabiles('c.fecha_asig', 'c.fecha_cita')}),1) AS dias
            FROM costos c ${whereSql}
              AND c.fecha_asig IS NOT NULL AND c.fecha_cita >= c.fecha_asig
              ${this.excluirCanceladas()}
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ mes: string; citas: bigint; cumplidas: bigint }>
      >(
        Prisma.sql`
            SELECT DATE_FORMAT(fecha_cita,'%Y-%m') AS mes,
                   COUNT(*) AS citas,
                   SUM(estado_consulta='CUMPLIDA') AS cumplidas
            FROM costos c ${whereSql}
              AND fecha_cita IS NOT NULL
              ${this.excluirAgendasNoAsistenciales()}
              ${this.excluirCanceladas()}
            GROUP BY mes ORDER BY mes
          `,
      ),
      this.prisma.$queryRaw<Array<{ tipo: string; n: bigint }>>(
        Prisma.sql`
            SELECT COALESCE(funcionalidad,'NO DEFINIDO') AS tipo, COUNT(*) AS n
            FROM costos c ${whereSql}
              ${this.excluirCanceladas()}
            GROUP BY tipo ORDER BY n DESC
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ convenio_grupo: string; citas: bigint; pct: number | null }>
      >(
        Prisma.sql`
            SELECT convenio_grupo,
                   SUM(estado_consulta IS NOT NULL AND estado_consulta <> 'CANCELADA') AS citas,
                   ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL AND estado_consulta <> 'CANCELADA'),0),1) AS pct
            FROM costos c ${whereSql}
              AND convenio_grupo IS NOT NULL ${ntConvenios}
              ${this.excluirAgendasNoAsistenciales()}
            GROUP BY convenio_grupo
            ORDER BY pct DESC, citas DESC
          `,
      ),
      this.prisma.$queryRaw<Array<{ sede_grupo: string; citas: bigint }>>(
        Prisma.sql`
            SELECT sede_grupo, COUNT(*) AS citas
            FROM costos c ${whereSql}
              AND sede_grupo IS NOT NULL
              ${this.excluirCanceladas()}
            GROUP BY sede_grupo ORDER BY citas DESC
          `,
      ),
    ]);

    return {
      meta: serializeRow(meta[0]),
      kpis: {
        cumplimiento: serializeRow(cumplimiento[0]),
        recuperacionMillones: cumplimiento[0]
          ? Number(recuperacion[0]?.millones ?? 0)
          : null,
        conveniosRiesgo: Number(conveniosRiesgo[0]?.n ?? 0),
        oportunidadDias: oportunidad[0]?.dias ?? null,
      },
      evolucionMensual: evolucion.map(serializeRow),
      distribucionServicios: distribucion.map(serializeRow),
      cumplimientoTopConvenios: topConvenios.map(serializeRow),
      volumenPorSede: topSedes.map(serializeRow),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  D2 — EJECUCION VS NOTA TECNICA
  // ═══════════════════════════════════════════════════════════════

  async getEjecucionNt(filters: DashboardFiltersDto) {
    const { whereSql } = buildCostosWhere(filters);
    // Meta a nivel ciudad: misma base pero ignorando la sede fisica. Asi, al
    // seleccionar una sede, el KPI muestra su aporte respecto a la ciudad
    // (ejecutado_sede / meta_ciudad). Sin sede seleccionada whereMetaSql == whereSql.
    const { whereSql: whereMetaSql } = buildCostosWhere({
      ...filters,
      sede: undefined,
    });
    const sedeActiva =
      typeof filters.sede === 'string' &&
      filters.sede.length > 0 &&
      filters.sede !== 'all';

    // nt_map colapsado a UNA fila por (cups, convenio): suma la meta de los
    // grupos etarios (programa). Evita que el JOIN multiplique los conteos, sin
    // modificar la tabla nt_map (que conserva su granularidad por programa).
    // HAVING SUM(meta_mes) > 0: excluye los pares (cups, convenio) que la NT
    // lista con meta 0 (o nula) -> no estan contratados, asi que su ejecucion
    // NO debe contar contra el cumplimiento (los JOINs a ntMap los descartan).
    const ntMap = Prisma.sql`(
      SELECT ${this.convNt('nombre_convenio')} AS nombre_convenio, cups, SUM(meta_mes) AS meta_mes
      FROM nt_map GROUP BY ${this.convNt('nombre_convenio')}, cups
      HAVING SUM(meta_mes) > 0
    )`;

    // KPI Cumplimiento Global:
    //  - CON sede seleccionada: aporte de la sede al cumplimiento (CAPADO) de su
    //    ciudad. Reparte el numerador capado de la ciudad en proporcion a lo que
    //    ejecuto la sede en cada par (convenio, cups); la suma de las sedes
    //    reconcilia con el cumplimiento capado de la ciudad.
    //  - SIN sede (ciudad / global): cumplimiento REAL con tope al 100% por
    //    (convenio, cups): la sobre-ejecucion de un CUPS no compensa el deficit
    //    de otro -> SUM(LEAST(ejecutado, meta)) / SUM(meta), acotado a 100%.
    //  - META = contratado total: meta_mes * meses del periodo de TODOS los
    //    convenios contratados en el filtro (con o sin ejecucion), via
    //    contratadoScope; un convenio sin ejecucion suma meta y 0 ejecutado.
    const kpiSql = sedeActiva
      ? Prisma.sql`
          SELECT
            num.ejecutado AS ejecutado,
            den.meta_periodo AS meta_periodo,
            ROUND(100 * num.ejecutado / NULLIF(den.meta_periodo, 0), 1) AS pct
          FROM
            (
              SELECT COALESCE(SUM(
                LEAST(city.ejec_city, city.meta) * s.ejec_sede / city.ejec_city
              ), 0) AS ejecutado
              FROM (
                SELECT e.nombre_convenio, e.cups, e.n AS ejec_city,
                       m.meta_mes * ${this.periodoMeses(whereMetaSql)} AS meta
                FROM ${this.ejecAgg(whereMetaSql)} e
                JOIN ${ntMap} m ON m.cups = e.cups AND m.nombre_convenio = e.nombre_convenio
              ) city
              JOIN (
                SELECT ${this.convNt('c.nombre_convenio')} AS nombre_convenio, c.cups, COUNT(*) AS ejec_sede
                FROM costos c ${whereSql}
                  AND c.cups IS NOT NULL AND c.nombre_convenio IS NOT NULL
                  ${this.excluirAgendasNoAsistenciales()} ${this.soloConsulta()}
                GROUP BY ${this.convNt('c.nombre_convenio')}, c.cups
              ) s ON s.cups = city.cups AND s.nombre_convenio = city.nombre_convenio
            ) num
            CROSS JOIN
            (
              SELECT COALESCE(SUM(t.meta), 0) AS meta_periodo
              FROM ${this.contratadoScope(whereMetaSql, ntMap)} t
            ) den
        `
      : Prisma.sql`
          SELECT
            ROUND(COALESCE(SUM(LEAST(t.n, t.meta)), 0)) AS ejecutado,
            ROUND(COALESCE(SUM(t.meta), 0)) AS meta_periodo,
            ROUND(100 * COALESCE(SUM(LEAST(t.n, t.meta)), 0) / NULLIF(SUM(t.meta), 0), 1) AS pct
          FROM ${this.contratadoScope(whereSql, ntMap)} t
        `;

    const [
      cumplimientoGlobal,
      heatmap,
      desviaciones,
      tendencia,
      catalogoNt,
      contratadoSinEjecutar,
      ejecutadoFueraNt,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ ejecutado: bigint; meta_periodo: number; pct: number | null }>
      >(kpiSql),
      this.prisma.$queryRaw<
        Array<{
          convenio: string;
          cups: string;
          meta_mes: number;
          ejecutado: bigint;
          meses: bigint;
          pct: number | null;
        }>
      >(
        Prisma.sql`
          WITH top_cups AS (
            SELECT c.cups
            FROM costos c
            JOIN ${ntMap} m ON m.cups = c.cups AND m.nombre_convenio = ${this.convNt('c.nombre_convenio')}
            ${whereSql} ${this.excluirAgendasNoAsistenciales()} ${this.soloConsulta()}
            GROUP BY c.cups
            ORDER BY COUNT(*) DESC
            LIMIT 8
          ),
          ejec AS ${this.ejecAgg(whereSql, Prisma.sql`AND c.cups IN (SELECT cups FROM top_cups)`)},
          conv AS (
            SELECT DISTINCT nombre_convenio FROM ejec
          )
          SELECT
            m.nombre_convenio AS convenio,
            m.cups,
            m.meta_mes,
            COALESCE(e.n,0) AS ejecutado,
            COALESCE(e.meses,5) AS meses,
            ROUND(100*COALESCE(e.n,0)/NULLIF(m.meta_mes * COALESCE(e.meses,5),0),1) AS pct
          FROM ${ntMap} m
          LEFT JOIN ejec e ON e.cups = m.cups AND e.nombre_convenio = m.nombre_convenio
          WHERE m.cups IN (SELECT cups FROM top_cups)
            AND m.nombre_convenio IN (SELECT nombre_convenio FROM conv)
          ORDER BY m.nombre_convenio, m.cups
        `,
      ),
      this.prisma.$queryRaw<
        Array<{
          convenio: string;
          cups: string;
          descripcion: string | null;
          meta: number;
          ejecutado: bigint;
          pct: number | null;
        }>
      >(
        Prisma.sql`
          WITH ejec AS ${this.ejecAgg(whereSql)},
          conv AS (
            SELECT DISTINCT nombre_convenio FROM ejec
          )
          SELECT
            m.nombre_convenio AS convenio,
            m.cups,
            (SELECT LEFT(descripcion,60) FROM notas_tecnicas nt WHERE nt.cups=m.cups LIMIT 1) AS descripcion,
            m.meta_mes * COALESCE(e.meses,5) AS meta,
            COALESCE(e.n,0) AS ejecutado,
            ROUND(100*COALESCE(e.n,0)/NULLIF(m.meta_mes * COALESCE(e.meses,5),0),1) AS pct
          FROM ${ntMap} m
          LEFT JOIN ejec e ON e.cups = m.cups AND e.nombre_convenio = m.nombre_convenio
          WHERE m.meta_mes > 100
            AND m.nombre_convenio IN (SELECT nombre_convenio FROM conv)
          HAVING pct IS NOT NULL AND (pct < 80 OR pct > 120)
          ORDER BY ABS(pct - 100) DESC LIMIT 8
        `,
      ),
      this.prisma.$queryRaw<
        Array<{
          convenio: string;
          mes: string;
          ejecutado: bigint;
          meta_mes: number;
          pct: number | null;
        }>
      >(
        Prisma.sql`
          WITH meta AS (
            SELECT ${this.convNt('nombre_convenio')} AS nombre_convenio, SUM(meta_mes) AS meta_mes_total
            FROM nt_map GROUP BY ${this.convNt('nombre_convenio')}
          ),
          ejec AS (
            SELECT ${this.convNt('c.nombre_convenio')} AS nombre_convenio, DATE_FORMAT(c.fecha_cita,'%Y-%m') AS mes, COUNT(*) AS n
            FROM costos c ${whereSql}
              AND c.fecha_cita IS NOT NULL AND c.nombre_convenio IS NOT NULL
              ${this.excluirAgendasNoAsistenciales()} ${this.soloConsulta()}
            GROUP BY ${this.convNt('c.nombre_convenio')}, mes
          )
          SELECT
            e.nombre_convenio AS convenio,
            e.mes,
            e.n AS ejecutado,
            m.meta_mes_total AS meta_mes,
            ROUND(100*e.n/NULLIF(m.meta_mes_total,0),1) AS pct
          FROM ejec e
          JOIN meta m ON m.nombre_convenio = e.nombre_convenio
          ORDER BY e.nombre_convenio, e.mes
        `,
      ),
      // Catalogo NT por CUPS: TODOS los CUPS contratados (meta_mes>0) para los
      // convenios con actividad bajo el filtro, tengan o no ejecucion. Usa la
      // misma base que kpiCumplimientoGlobal (contratadoScope: meta_mes * meses
      // del periodo de TODOS los convenios contratados) para que la suma del
      // catalogo reconcilie con el KPI. La meta de cada CUPS suma todos los
      // convenios contratados, no solo los que ejecutaron (p. ej. CUCUTA 931001
      // incluye NUEVA EPS aunque no haya ejecutado ese CUPS).
      this.prisma.$queryRaw<
        Array<{
          cups: string;
          descripcion: string | null;
          meta: number;
          ejecutado: bigint;
          pct: number | null;
        }>
      >(
        Prisma.sql`
          SELECT
            t.cups,
            (SELECT LEFT(descripcion,90) FROM notas_tecnicas nt WHERE nt.cups=t.cups LIMIT 1) AS descripcion,
            SUM(t.meta) AS meta,
            SUM(t.n) AS ejecutado,
            ROUND(100*SUM(t.n)/NULLIF(SUM(t.meta),0),1) AS pct
          FROM ${this.contratadoScope(whereSql, ntMap)} t
          GROUP BY t.cups
          ORDER BY pct IS NULL, pct DESC
        `,
      ),
      // Contratado sin ejecutar: CUPS de la nota tecnica (meta > 0) para los
      // convenios presentes bajo el filtro, que NO tuvieron ninguna ejecucion
      // (consulta) en el periodo. meta = meta_mes * meses del periodo (lo que
      // se esperaba ejecutar y no se ejecuto).
      this.prisma.$queryRaw<
        Array<{ cups: string; descripcion: string | null; meta: number }>
      >(
        Prisma.sql`
          WITH ejec AS ${this.ejecAgg(whereSql)},
          periodo AS (
            SELECT GREATEST(COUNT(DISTINCT EXTRACT(YEAR_MONTH FROM c.fecha_cita)), 1) AS meses
            FROM costos c ${whereSql} AND c.fecha_cita IS NOT NULL
              ${this.excluirAgendasNoAsistenciales()}
          ),
          conv_scope AS (
            SELECT DISTINCT ${this.convNt('c.nombre_convenio')} AS nombre_convenio
            FROM costos c ${whereSql} AND c.nombre_convenio IS NOT NULL
              ${this.excluirAgendasNoAsistenciales()}
          )
          SELECT
            m.cups,
            (SELECT LEFT(descripcion,90) FROM notas_tecnicas nt WHERE nt.cups = m.cups LIMIT 1) AS descripcion,
            ROUND(SUM(m.meta_mes) * (SELECT meses FROM periodo)) AS meta
          FROM ${ntMap} m
          JOIN conv_scope cs ON cs.nombre_convenio = m.nombre_convenio
          WHERE m.cups NOT IN (SELECT cups FROM ejec)
          GROUP BY m.cups
          ORDER BY meta DESC
        `,
      ),
      // Ejecutado fuera de NT: CUPS ejecutados en costos (bajo el filtro) cuyo
      // codigo NO existe en la nota tecnica (meta > 0). Sirve para detectar CUPS
      // que se prestan pero faltan en nt_map o que no estan contratados.
      this.prisma.$queryRaw<
        Array<{ cups: string; descripcion: string | null; ejecutado: bigint }>
      >(
        Prisma.sql`
          SELECT
            c.cups,
            (SELECT LEFT(descripcion,90) FROM cat_cups cc WHERE cc.codigo = c.cups LIMIT 1) AS descripcion,
            COUNT(*) AS ejecutado
          FROM costos c ${whereSql}
            AND c.cups IS NOT NULL
            AND c.cups NOT IN (SELECT cups FROM nt_map WHERE meta_mes > 0)
            ${this.excluirAgendasNoAsistenciales()}
          GROUP BY c.cups
          ORDER BY ejecutado DESC
        `,
      ),
    ]);

    return {
      kpiCumplimientoGlobal: serializeRow(cumplimientoGlobal[0]),
      heatmapConvenioCups: heatmap.map(serializeRow),
      desviaciones: desviaciones.map(serializeRow),
      tendenciaCumplimiento: tendencia.map(serializeRow),
      catalogoNt: catalogoNt.map(serializeRow),
      contratadoSinEjecutar: contratadoSinEjecutar.map(serializeRow),
      ejecutadoFueraNt: ejecutadoFueraNt.map(serializeRow),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  D3 — ANALISIS FINANCIERO
  // ═══════════════════════════════════════════════════════════════

  async getFinanciero(filters: DashboardFiltersDto) {
    const { whereSql } = buildCostosWhere(filters);
    // nt_map colapsado por (cups, convenio): un costo_medio por par (promedio de
    // los grupos etarios). Evita que el JOIN multiplique el costo y el conteo de
    // citas costeadas (mismo motivo que en ejecucion-nt), sin tocar nt_map.
    const ntMapCosto = Prisma.sql`(
      SELECT ${this.convNt('nombre_convenio')} AS nombre_convenio, cups, AVG(costo_medio) AS costo_medio
      FROM nt_map GROUP BY ${this.convNt('nombre_convenio')}, cups
    )`;

    const [
      costoReal,
      costoEsperado,
      recuperacion,
      paretoCups,
      paretoTotal,
      costoConvenio,
      recupConvenio,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ millones: number | null; citas_costeadas: bigint }>
      >(
        Prisma.sql`
            SELECT
              ROUND(SUM(m.costo_medio)/1e6, 1) AS millones,
              COUNT(*) AS citas_costeadas
            FROM costos c
            JOIN ${ntMapCosto} m ON m.cups = c.cups AND m.nombre_convenio = ${this.convNt('c.nombre_convenio')}
            ${whereSql}
              ${this.excluirCanceladas()}
          `,
      ),
      // Costo esperado NT = contrato mensual x meses del periodo, ambos bajo el
      // filtro activo. Antes era `SUM(meta_mes*costo_medio*5) FROM nt_map`, que
      // tenia tres defectos: no aplicaba el WHERE (el KPI nunca se movia),
      // multiplicaba por un 5 fijo (el periodo ya es de 9 meses) y sumaba sobre
      // nt_map, que duplica por regimen (+39%).
      this.prisma.$queryRaw<Array<{ millones: number | null }>>(
        Prisma.sql`
            SELECT ROUND(
              ${this.contratoMensual(whereSql)} * ${this.periodoMeses(whereSql)} / 1e6
            , 1) AS millones
          `,
      ),
      this.prisma.$queryRaw<Array<{ millones: number | null }>>(
        Prisma.sql`SELECT ROUND(SUM(valor_recuperacion)/1e6,1) AS millones FROM costos c ${whereSql}`,
      ),
      this.prisma.$queryRaw<
        Array<{
          cups: string;
          descripcion: string | null;
          n: bigint;
          millones: number | null;
        }>
      >(
        Prisma.sql`
            SELECT c.cups,
                   (SELECT LEFT(descripcion,50) FROM notas_tecnicas nt WHERE nt.cups=c.cups LIMIT 1) AS descripcion,
                   COUNT(*) AS n,
                   ROUND(SUM(m.costo_medio)/1e6, 1) AS millones
            FROM costos c
            JOIN ${ntMapCosto} m ON m.cups=c.cups AND m.nombre_convenio=${this.convNt('c.nombre_convenio')}
            ${whereSql}
              ${this.excluirCanceladas()}
            GROUP BY c.cups
            ORDER BY millones DESC
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ top20: number | null; total: number | null }>
      >(
        Prisma.sql`
            WITH costo_cups AS (
              SELECT c.cups, SUM(m.costo_medio) AS costo
              FROM costos c JOIN ${ntMapCosto} m ON m.cups=c.cups AND m.nombre_convenio=${this.convNt('c.nombre_convenio')}
              ${whereSql}
              ${this.excluirCanceladas()}
              GROUP BY c.cups
            )
            SELECT
              (SELECT SUM(costo) FROM (SELECT costo FROM costo_cups ORDER BY costo DESC LIMIT 20) t) AS top20,
              (SELECT SUM(costo) FROM costo_cups) AS total
          `,
      ),
      this.prisma.$queryRaw<
        Array<{
          convenio_grupo: string;
          citas: bigint;
          millones: number | null;
        }>
      >(
        Prisma.sql`
            SELECT c.convenio_grupo,
                   COUNT(*) AS citas,
                   ROUND(SUM(m.costo_medio)/1e6, 1) AS millones
            FROM costos c
            JOIN ${ntMapCosto} m ON m.cups=c.cups AND m.nombre_convenio=${this.convNt('c.nombre_convenio')}
            ${whereSql}
              AND c.convenio_grupo IS NOT NULL
              ${this.excluirCanceladas()}
            GROUP BY c.convenio_grupo
            ORDER BY millones DESC
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ convenio_grupo: string; millones: number | null }>
      >(
        Prisma.sql`
            SELECT convenio_grupo,
                   ROUND(SUM(valor_recuperacion)/1e6,1) AS millones
            FROM costos c ${whereSql}
              AND convenio_grupo IS NOT NULL AND valor_recuperacion > 0
            GROUP BY convenio_grupo
            ORDER BY millones DESC
          `,
      ),
    ]);

    const top20 = Number(paretoTotal[0]?.top20 ?? 0);
    const total = Number(paretoTotal[0]?.total ?? 0);
    const paretoTop20Pct =
      total > 0 ? Math.round(((top20 * 100) / total) * 10) / 10 : 0;

    return {
      kpis: {
        costoRealMillones: costoReal[0]?.millones ?? null,
        citasCosteadas: Number(costoReal[0]?.citas_costeadas ?? 0),
        costoEsperadoMillones: costoEsperado[0]?.millones ?? null,
        recuperacionMillones: recuperacion[0]?.millones ?? null,
        eficienciaPct:
          (recuperacion[0]?.millones ?? 0) && (costoReal[0]?.millones ?? 0)
            ? Math.round(
                (recuperacion[0].millones! / costoReal[0].millones!) * 100 * 10,
              ) / 10
            : null,
        // Ejecucion en VALOR frente a la nota tecnica: cuanto del contrato del
        // periodo se ejecuto realmente, en pesos. Es el equivalente monetario
        // del cumplimiento de Ejecucion NT (que va en citas).
        // OJO al leerlo: el numerador solo cuenta las citas cuyo par
        // (cups, convenio) existe en la NT, asi que lo ejecutado fuera de la
        // nota tecnica no suma. Es un porcentaje conservador por diseno.
        ejecucionNtPct:
          (costoEsperado[0]?.millones ?? 0) && (costoReal[0]?.millones ?? 0)
            ? Math.round(
                (costoReal[0].millones! / costoEsperado[0].millones!) * 100 * 10,
              ) / 10
            : null,
      },
      paretoCups: paretoCups.map(serializeRow),
      paretoTop20Pct,
      costoPorConvenio: costoConvenio.map(serializeRow),
      recuperacionPorConvenio: recupConvenio.map(serializeRow),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  D4 — CALIDAD Y OPORTUNIDAD
  // ═══════════════════════════════════════════════════════════════

  async getCalidad(filters: DashboardFiltersDto) {
    const { whereSql } = buildCostosWhere(filters);

    // La inasistencia/incumplimiento por convenio es una metrica de cumplimiento
    // de la IPS: los convenios de evento (sin NT) no aplican (su no-ejecucion es
    // inasistencia del usuario, no incumplimiento de la IPS). Se filtra a nivel
    // de cita igual que en Resumen, para que p.ej. COMPENSAR CUCUTA EVENTO no
    // aparezca pero COMPENSAR CAJICA PGP si.
    const ntConvenios = Prisma.sql`
      AND ${this.convNt('c.nombre_convenio')} IN (SELECT DISTINCT ${this.convNt('nombre_convenio')} FROM nt_map)`;

    const [oportunidad, estadoSede, inasistencia, mixAgenda] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ especialidad: string; n: bigint; dias: number | null }>
        >(
          Prisma.sql`
          SELECT especialidad,
                 COUNT(*) AS n,
                 ROUND(AVG(${this.diasHabiles('c.fecha_asig', 'c.fecha_cita')}),1) AS dias
          FROM costos c ${whereSql}
            AND c.fecha_asig IS NOT NULL AND c.fecha_cita >= c.fecha_asig
            AND especialidad IS NOT NULL AND especialidad <> ''
            ${this.excluirCanceladas()}
          GROUP BY especialidad
          ORDER BY n DESC
        `,
        ),
        this.prisma.$queryRaw<
          Array<{
            sede_grupo: string;
            total: bigint;
            pct_cump: number | null;
            pct_incump: number | null;
            pct_canc: number | null;
          }>
        >(
          Prisma.sql`
          SELECT sede_grupo,
                 COUNT(*) AS total,
                 ROUND(100*SUM(estado_consulta='CUMPLIDA')/COUNT(*),1) AS pct_cump,
                 ROUND(100*SUM(estado_consulta='INCUMPLIDA')/COUNT(*),1) AS pct_incump,
                 ROUND(100*SUM(estado_consulta='CANCELADA')/COUNT(*),1) AS pct_canc
          FROM costos c ${whereSql}
            AND sede_grupo IS NOT NULL AND estado_consulta IS NOT NULL
            ${this.excluirAgendasNoAsistenciales()}
          GROUP BY sede_grupo
          ORDER BY total DESC
        `,
        ),
        this.prisma.$queryRaw<
          Array<{ convenio_grupo: string; mes: string; pct: number | null }>
        >(
          Prisma.sql`
          SELECT convenio_grupo, DATE_FORMAT(fecha_cita,'%Y-%m') AS mes,
                 ROUND(100*SUM(estado_consulta='INCUMPLIDA')/NULLIF(COUNT(*),0),1) AS pct
          FROM costos c ${whereSql} ${ntConvenios}
            AND convenio_grupo IS NOT NULL
            AND fecha_cita IS NOT NULL
            ${this.excluirAgendasNoAsistenciales()}
            ${this.excluirCanceladas()}
          GROUP BY convenio_grupo, mes
          ORDER BY convenio_grupo, mes
        `,
        ),
        this.prisma.$queryRaw<
          Array<{ sede_grupo: string; tipo_agenda: string; n: bigint }>
        >(
          Prisma.sql`
          SELECT sede_grupo, tipo_agenda, COUNT(*) AS n
          FROM costos c ${whereSql}
            AND sede_grupo IS NOT NULL
            AND tipo_agenda IS NOT NULL
            ${this.excluirCanceladas()}
          GROUP BY sede_grupo, tipo_agenda
        `,
        ),
      ]);

    return {
      oportunidadEspecialidad: oportunidad.map(serializeRow),
      estadoPorSede: estadoSede.map(serializeRow),
      inasistenciaMensual: inasistencia.map(serializeRow),
      mixAgendaPorSede: mixAgenda.map(serializeRow),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  D5 — PyM / RIAS
  // ═══════════════════════════════════════════════════════════════

  async getPym(filters: DashboardFiltersDto) {
    const { whereSql } = buildCostosWhere(filters);

    const [topProgramas, alertas] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ pym: string; n: bigint; pct_cump: number | null }>
      >(
        Prisma.sql`
          SELECT pym, COUNT(*) AS n,
                 ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct_cump
          FROM costos c ${whereSql}
            AND pym IS NOT NULL AND pym <> ''
            ${this.excluirAgendasNoAsistenciales()}
            ${this.excluirCanceladas()}
          GROUP BY pym ORDER BY n DESC
        `,
      ),
      this.prisma.$queryRaw<
        Array<{ cohorte: string; poblacion: bigint; pct_cump: number | null }>
      >(
        Prisma.sql`
          SELECT pym AS cohorte,
                 COUNT(*) AS poblacion,
                 ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct_cump
          FROM costos c ${whereSql}
            AND pym IS NOT NULL AND pym <> ''
            ${this.excluirAgendasNoAsistenciales()}
            ${this.excluirCanceladas()}
          GROUP BY pym
          HAVING poblacion > 200 AND pct_cump < 80
          ORDER BY pct_cump ASC LIMIT 8
        `,
      ),
    ]);

    return {
      topProgramas: topProgramas.map(serializeRow),
      alertasCohortes: alertas.map(serializeRow),
      _warning:
        'Grupo etario y poblacion denominador pendientes Fase A del ETL',
    };
  }
}

/**
 * Convierte BigInt -> number y Decimal -> number antes de serializar a JSON.
 * NestJS no sabe serializar BigInt nativamente.
 */
function serializeRow<T extends Record<string, unknown>>(
  row: T | undefined,
): T | null {
  if (!row) return null;
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') out[k] = Number(v);
    else if (v !== null && typeof v === 'object' && 'toFixed' in v)
      out[k] = Number(v);
    else out[k] = v;
  }
  return out as T;
}
