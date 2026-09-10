import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { buildAggWhere } from './dashboard-filters.helper';

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
      SELECT t.nombre_convenio, t.cups,
             CAST(SUM(t.cnt) AS SIGNED) AS n, COUNT(t.ym) AS meses
      FROM (
        SELECT a.convenio_nt AS nombre_convenio, a.cups,
               EXTRACT(YEAR_MONTH FROM a.fecha_cita) AS ym, SUM(a.citas) AS cnt
        FROM costos_agg a ${where}
          AND a.cups IS NOT NULL AND a.convenio_nt IS NOT NULL
          ${this.aggAsistencial()} ${this.aggSoloConsulta()} ${extra}
        GROUP BY a.convenio_nt, a.cups, EXTRACT(YEAR_MONTH FROM a.fecha_cita)
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
      SELECT GREATEST(COUNT(DISTINCT EXTRACT(YEAR_MONTH FROM a.fecha_cita)), 1)
      FROM costos_agg a ${where} AND a.fecha_cita IS NOT NULL
        ${this.aggAsistencial()}
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
        SELECT DISTINCT a.convenio_nt AS nombre_convenio
        FROM costos_agg a ${where} AND a.convenio_nt IS NOT NULL
          ${this.aggAsistencial()}
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
      SELECT DISTINCT a.convenio_nt
      FROM costos_agg a ${where} AND a.convenio_nt IS NOT NULL
        ${this.aggAsistencial()}
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
   * Hay una sede FISICA seleccionada (no la ciudad, no "todas").
   *
   * Es la bisagra de los KPIs que se comparan contra la nota tecnica: la NT no
   * tiene dimension de sede, asi que una sede fisica no tiene meta ni contrato
   * propios. Cuando esto es true, los denominadores (meta, costo esperado) se
   * calculan a nivel CIUDAD y el KPI pasa a leerse como el APORTE de la sede a
   * su ciudad, no como un cumplimiento propio.
   */
  private sedeSeleccionada(filters: DashboardFiltersDto): boolean {
    return (
      typeof filters.sede === 'string' &&
      filters.sede.length > 0 &&
      filters.sede !== 'all'
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS SOBRE EL PRE-AGREGADO costos_agg (alias `a`)
  // ═══════════════════════════════════════════════════════════════
  //
  // Equivalencias con las consultas sobre `costos` (alias `c`):
  //
  //   COUNT(*)                                  -> aggCitas()
  //   SUM(estado_consulta='CUMPLIDA')           -> aggCumplidas()
  //   SUM(estado IS NOT NULL AND <> CANCELADA)  -> aggConEstado()
  //   SUM(valor_recuperacion)                   -> SUM(a.recuperacion)
  //   AVG(diasHabiles(...))                     -> aggOportunidad()
  //   ntConvenios (IN nt_map)                   -> aggSoloNt()
  //   excluirAgendasNoAsistenciales()           -> aggAsistencial()
  //   excluirCanceladas()                       -> aggExcluirCanceladas()
  //
  // El CAST a SIGNED no es cosmetico: SUM() sobre INT devuelve DECIMAL en
  // MySQL, y COUNT(*) devuelve BIGINT. Sin el cast el JSON de respuesta puede
  // cambiar de forma aunque el numero sea el mismo.
  // El COALESCE tampoco: COUNT(*) sobre cero filas da 0, pero SUM() da NULL.

  private aggCitas(): Prisma.Sql {
    return Prisma.sql`CAST(COALESCE(SUM(a.citas), 0) AS SIGNED)`;
  }

  private aggCumplidas(): Prisma.Sql {
    return Prisma.sql`CAST(COALESCE(SUM(a.cumplidas), 0) AS SIGNED)`;
  }

  private aggIncumplidas(): Prisma.Sql {
    return Prisma.sql`CAST(COALESCE(SUM(a.incumplidas), 0) AS SIGNED)`;
  }

  /**
   * Citas de un estado cualquiera. `estado_consulta` es una dimension del
   * agregado, asi que contar un estado concreto es sumar `citas` de las filas
   * que lo tienen — no hace falta una medida propia por cada estado.
   */
  private aggEstado(valor: string): Prisma.Sql {
    return Prisma.sql`CAST(COALESCE(SUM(CASE WHEN a.estado_consulta = ${valor} THEN a.citas ELSE 0 END), 0) AS SIGNED)`;
  }

  /** Citas que entran al calculo de oportunidad (con ambas fechas y cita >= asignacion). */
  private aggConOportunidad(): Prisma.Sql {
    return Prisma.sql`CAST(COALESCE(SUM(a.dias_habiles_n), 0) AS SIGNED)`;
  }

  /** Citas con estado conocido y distinto de CANCELADA (denominador del cumplimiento). */
  private aggConEstado(): Prisma.Sql {
    return Prisma.sql`CAST(COALESCE(SUM(CASE WHEN a.estado_consulta IS NOT NULL AND a.estado_consulta <> 'CANCELADA' THEN a.citas ELSE 0 END), 0) AS SIGNED)`;
  }

  /** Promedio de dias habiles reconstruido: no se puede promediar un agregado. */
  private aggOportunidad(): Prisma.Sql {
    return Prisma.sql`SUM(a.dias_habiles_suma) / NULLIF(SUM(a.dias_habiles_n), 0)`;
  }

  private aggSoloNt(): Prisma.Sql {
    return Prisma.sql`AND a.tiene_nt = 1`;
  }

  private aggAsistencial(): Prisma.Sql {
    return Prisma.sql`AND a.agenda_no_asistencial = 0`;
  }

  private aggExcluirCanceladas(): Prisma.Sql {
    return Prisma.sql`AND NOT (a.estado_consulta <=> 'CANCELADA')`;
  }

  /** Equivalente de soloConsulta() sobre el agregado (cups y funcionalidad son dimensiones). */
  private aggSoloConsulta(): Prisma.Sql {
    return Prisma.sql`AND NOT (LEFT(a.cups,4) IN ('8902','8903') AND (a.funcionalidad <> 'CONSULTA' OR a.funcionalidad IS NULL))`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN: reconstruir la tabla pre-agregada costos_agg
  // ═══════════════════════════════════════════════════════════════

  /**
   * Reconstruye `costos_agg`, el pre-agregado de `costos` que alimenta los
   * dashboards. Llamar DESPUES de cada corrida del ETL (igual que
   * rebuild-nt-map), porque `costos` se reconstruye entera en cada carga.
   *
   * POR QUE EXISTE: las consultas de dashboards son lentas no por falta de
   * indices sino por row lookups. Un COUNT(*) filtrado por sede tarda ~290 ms
   * (se resuelve con el indice), pero en cuanto la consulta toca una columna
   * no indexada — `estado_consulta`, `nombre_convenio`, `nombre_medico` — hay
   * que traer la fila completa de una tabla de 465 MB, medio millon de veces,
   * y pasa a ~6 s. Se probaron indices de cobertura y solo dieron 1,0x-1,3x:
   * `nombre_medico` y `nombre_convenio` son VARCHAR anchos y con prefijo el
   * optimizador ni usa el indice.
   *
   * COMO LO RESUELVE: colapsa `costos` por las dimensiones de
   * `buildAggWhere` y resuelve UNA SOLA VEZ, aqui, los dos predicados
   * caros que hoy se evaluan por fila en cada consulta:
   *   - `agenda_no_asistencial` (el UPPER/TRIM sobre nombre_medico)
   *   - `tiene_nt` (el IN contra nt_map)
   * Medido: 1.123.132 filas -> ~226.000 (5x), 465 MB -> ~53 MB, y la misma
   * consulta baja de 6.557 ms a 1.194 ms con resultados identicos.
   *
   * PROMEDIOS: la oportunidad no se puede promediar sobre un agregado, asi
   * que se guardan `dias_habiles_suma` y `dias_habiles_n` y el AVG se
   * reconstruye como SUM/SUM. Mismo criterio para cualquier promedio futuro.
   */
  async rebuildAgregado(): Promise<{ rows: number; segundos: number }> {
    // Cerrojo en proceso: dos reconstrucciones simultaneas se destruyen entre
    // si (la segunda borra la tabla mientras la primera la esta llenando, y el
    // dashboard queda en cero). Pasa facil: el boton se remonta al cambiar de
    // panel, hay varias pestanyas, o dos usuarios a la vez.
    if (this.reconstruyendoAgg) {
      throw new ConflictException(
        'Ya hay una reconstruccion en curso. Espera a que termine.',
      );
    }
    this.reconstruyendoAgg = true;
    try {
      return await this.construirAgregado();
    } finally {
      this.reconstruyendoAgg = false;
    }
  }

  private reconstruyendoAgg = false;

  /**
   * Construye el agregado en una tabla aparte y la intercambia al final con
   * RENAME TABLE, que en MySQL es atomico. Asi la tabla viva nunca se queda
   * vacia ni a medio llenar: si algo falla, los dashboards siguen sirviendo la
   * ultima version buena. Antes se hacia DROP + CREATE + INSERT sobre la tabla
   * en uso, y un fallo a mitad de camino dejaba el dashboard en cero.
   */
  private async construirAgregado(): Promise<{
    rows: number;
    segundos: number;
  }> {
    const t0 = Date.now();
    await this.prisma.$executeRawUnsafe('DROP TABLE IF EXISTS costos_agg_tmp');
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE costos_agg_tmp (
        fecha_cita            DATE,
        sede_grupo            VARCHAR(50),
        nombre_sede           VARCHAR(150),
        convenio_grupo        VARCHAR(50),
        -- Se guardan los dos: nombre_convenio es el valor crudo que exponen
        -- los selectores de /filtros, y convenio_nt el normalizado con convNt
        -- (NUEVA EPS colapsado) que usa el cruce con la nota tecnica. Guardar
        -- solo el segundo haria que los filtros dejaran de distinguir los
        -- regimenes de NUEVA EPS. Cuesta 196 filas mas (+0,08%).
        nombre_convenio       VARCHAR(300),
        convenio_nt           VARCHAR(300),
        modalidad             VARCHAR(50),
        regimen_grupo         VARCHAR(20),
        grupo_especialidad    VARCHAR(150),
        especialidad          VARCHAR(500),
        cups                  VARCHAR(20),
        funcionalidad         VARCHAR(50),
        tipo_agenda           VARCHAR(50),
        pym                   VARCHAR(255),
        estado_consulta       VARCHAR(50),
        agenda_no_asistencial TINYINT NOT NULL DEFAULT 0,
        tiene_nt              TINYINT NOT NULL DEFAULT 0,
        citas                 INT     NOT NULL DEFAULT 0,
        cumplidas             INT     NOT NULL DEFAULT 0,
        incumplidas           INT     NOT NULL DEFAULT 0,
        recuperacion          DECIMAL(18,2) NOT NULL DEFAULT 0,
        dias_habiles_suma     BIGINT  NOT NULL DEFAULT 0,
        dias_habiles_n        INT     NOT NULL DEFAULT 0,
        KEY ix_agg_sede   (sede_grupo, agenda_no_asistencial, tiene_nt, convenio_grupo),
        KEY ix_agg_fecha  (fecha_cita),
        KEY ix_agg_cups   (cups, convenio_nt),
        -- (fecha_cita, agenda_no_asistencial) es el par que filtran casi todas
        -- las consultas. Sirve sobre todo a periodoMeses(), que va embebido en
        -- contratadoScope y por eso se evalua muchas veces por request: baja de
        -- ~640 ms a ~38 ms (17x). Se probo tambien una version ancha que
        -- incluia tiene_nt, cups y citas: ganaba solo 1,2x en el resto y
        -- tardaba 382 s en construirse, asi que se descarto. Esta tarda 1 s.
        KEY ix_agg_fecha_asist (fecha_cita, agenda_no_asistencial)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // El GROUP BY repite las expresiones en vez de usar el alias: MySQL lo
    // permite por alias, pero repetirlas deja explicito que la fila del
    // agregado es exactamente esa combinacion de dimensiones.
    const convNt = `(CASE WHEN c.nombre_convenio LIKE 'NUEVA EPS%' THEN 'NUEVA EPS' ELSE c.nombre_convenio END)`;
    const noAsist = `(UPPER(TRIM(COALESCE(c.nombre_medico,''))) = 'TOMA DE MUESTRAS NUEVA EPS CUCUTA')`;
    // `tiene_nt` NO puede ir como expresion en el GROUP BY: con only_full_group_by
    // MySQL rechaza (error 1055) cualquier expresion que contenga una subconsulta,
    // porque no puede probar la dependencia funcional. Se resuelve con un LEFT JOIN
    // al conjunto de convenios con NT y un MAX(): dentro de cada grupo todas las
    // filas comparten `convenio_nt`, asi que el MAX es el valor correcto del flag.
    const ntConvenios = `(
      SELECT DISTINCT (CASE WHEN nombre_convenio LIKE 'NUEVA EPS%' THEN 'NUEVA EPS' ELSE nombre_convenio END) AS conv
      FROM nt_map
    )`;
    const dias = `(
      DATEDIFF(c.fecha_cita, c.fecha_asig)
      - FLOOR((DATEDIFF(c.fecha_cita, c.fecha_asig) + DAYOFWEEK(c.fecha_asig) - 1) / 7)
      - (SELECT COUNT(*) FROM festivos f
         WHERE f.dia > c.fecha_asig AND f.dia <= c.fecha_cita AND DAYOFWEEK(f.dia) <> 1)
    )`;
    // La oportunidad solo aplica a citas con ambas fechas y fecha_cita >= fecha_asig,
    // mismas condiciones que usa getResumen al calcularla sobre costos.
    const aplicaDias = `(c.fecha_asig IS NOT NULL AND c.fecha_cita IS NOT NULL AND c.fecha_cita >= c.fecha_asig)`;

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO costos_agg_tmp
      SELECT
        c.fecha_cita, c.sede_grupo, c.nombre_sede, c.convenio_grupo,
        c.nombre_convenio, ${convNt}, c.modalidad, c.regimen_grupo,
        c.grupo_especialidad, c.especialidad, c.cups, c.funcionalidad,
        c.tipo_agenda, c.pym, c.estado_consulta,
        ${noAsist},
        MAX(ntc.conv IS NOT NULL),
        COUNT(*),
        -- COALESCE obligatorio: hay grupos con estado_consulta NULL (las filas
        -- de LAB y ODONTO que el ETL carga aparte), y SUM sobre valores todos
        -- NULL devuelve NULL, no 0. Las columnas son NOT NULL.
        COALESCE(SUM(c.estado_consulta = 'CUMPLIDA'), 0),
        COALESCE(SUM(c.estado_consulta = 'INCUMPLIDA'), 0),
        COALESCE(SUM(COALESCE(c.valor_recuperacion, 0)), 0),
        COALESCE(SUM(CASE WHEN ${aplicaDias} THEN ${dias} ELSE 0 END), 0),
        COALESCE(SUM(${aplicaDias}), 0)
      FROM costos c
      LEFT JOIN ${ntConvenios} ntc ON ntc.conv = ${convNt}
      GROUP BY
        c.fecha_cita, c.sede_grupo, c.nombre_sede, c.convenio_grupo,
        c.nombre_convenio, ${convNt}, c.modalidad, c.regimen_grupo,
        c.grupo_especialidad, c.especialidad, c.cups, c.funcionalidad,
        c.tipo_agenda, c.pym, c.estado_consulta, ${noAsist}
    `);

    // Se cuenta ANTES de publicar: si la nueva version salio vacia, algo fallo
    // en silencio y es mejor no reemplazar la tabla buena por una vacia.
    const result = await this.prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM costos_agg_tmp`,
    );
    const rows = Number(result[0]?.n ?? 0);
    if (rows === 0) {
      await this.prisma.$executeRawUnsafe('DROP TABLE IF EXISTS costos_agg_tmp');
      throw new InternalServerErrorException(
        'La reconstruccion produjo 0 filas; se conserva la version anterior.',
      );
    }

    // Publicacion atomica. RENAME TABLE con varias tablas es atomico en MySQL:
    // no hay instante en que `costos_agg` no exista para quien este leyendo.
    const existe = await this.prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = 'costos_agg'`,
    );
    await this.prisma.$executeRawUnsafe('DROP TABLE IF EXISTS costos_agg_old');
    if (Number(existe[0]?.n ?? 0) > 0) {
      await this.prisma.$executeRawUnsafe(
        'RENAME TABLE costos_agg TO costos_agg_old, costos_agg_tmp TO costos_agg',
      );
      await this.prisma.$executeRawUnsafe('DROP TABLE IF EXISTS costos_agg_old');
    } else {
      await this.prisma.$executeRawUnsafe(
        'RENAME TABLE costos_agg_tmp TO costos_agg',
      );
    }

    const segundos = Math.round((Date.now() - t0) / 100) / 10;
    this.logger.log(`costos_agg reconstruida: ${rows} filas en ${segundos}s`);
    return { rows, segundos };
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
    // Lee del pre-agregado costos_agg, no de costos. Ver rebuildAgregado().
    const { whereSql } = buildAggWhere(filters);

    // Solo los convenios con nota tecnica entran al ANALISIS de cumplimiento.
    // Los de evento (sin NT) se ven en los datos de volumen, pero su tasa de
    // cita cumplida/incumplida no aplica (el evento ejecutado es 100%; las no
    // ejecutadas son inasistencias del usuario, no incumplimiento de la IPS).
    // El cruce con nt_map ya viene resuelto en la columna `tiene_nt`: asi un
    // mismo grupo comercial cuenta solo en las sedes donde su contrato tiene NT
    // (p.ej. COMPENSAR CUCUTA EVENTO no entra, pero COMPENSAR CAJICA PGP si).
    const ntConvenios = this.aggSoloNt();

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
            SELECT ${this.aggCitas()} AS total,
                   MIN(a.fecha_cita) AS desde, MAX(a.fecha_cita) AS hasta
            FROM costos_agg a ${whereSql}
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ pct: number | null; cumplidas: bigint; con_estado: bigint }>
      >(
        Prisma.sql`
            SELECT
              ROUND(100 * ${this.aggCumplidas()} / NULLIF(${this.aggConEstado()},0), 1) AS pct,
              ${this.aggCumplidas()} AS cumplidas,
              ${this.aggConEstado()} AS con_estado
            FROM costos_agg a ${whereSql} ${ntConvenios}
              ${this.aggAsistencial()}
          `,
      ),
      this.prisma.$queryRaw<Array<{ millones: number | null }>>(
        Prisma.sql`SELECT ROUND(SUM(a.recuperacion)/1e6,1) AS millones FROM costos_agg a ${whereSql}`,
      ),
      this.prisma.$queryRaw<Array<{ n: bigint }>>(
        Prisma.sql`
            SELECT COUNT(*) AS n FROM (
              SELECT a.convenio_grupo,
                     100*${this.aggCumplidas()}/NULLIF(${this.aggConEstado()},0) AS pct,
                     ${this.aggCitas()} AS citas
              FROM costos_agg a ${whereSql}
                AND a.convenio_grupo IS NOT NULL ${ntConvenios}
                ${this.aggAsistencial()}
              GROUP BY a.convenio_grupo
              HAVING citas > 100 AND pct < 90
            ) t
          `,
      ),
      this.prisma.$queryRaw<Array<{ dias: number | null }>>(
        Prisma.sql`
            SELECT ROUND(${this.aggOportunidad()},1) AS dias
            FROM costos_agg a ${whereSql}
              ${this.aggExcluirCanceladas()}
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ mes: string; citas: bigint; cumplidas: bigint }>
      >(
        Prisma.sql`
            SELECT DATE_FORMAT(a.fecha_cita,'%Y-%m') AS mes,
                   ${this.aggCitas()} AS citas,
                   ${this.aggCumplidas()} AS cumplidas
            FROM costos_agg a ${whereSql}
              AND a.fecha_cita IS NOT NULL
              ${this.aggAsistencial()}
              ${this.aggExcluirCanceladas()}
            GROUP BY mes ORDER BY mes
          `,
      ),
      this.prisma.$queryRaw<Array<{ tipo: string; n: bigint }>>(
        Prisma.sql`
            SELECT COALESCE(a.funcionalidad,'NO DEFINIDO') AS tipo, ${this.aggCitas()} AS n
            FROM costos_agg a ${whereSql}
              ${this.aggExcluirCanceladas()}
            GROUP BY tipo ORDER BY n DESC
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ convenio_grupo: string; citas: bigint; pct: number | null }>
      >(
        Prisma.sql`
            SELECT a.convenio_grupo,
                   ${this.aggConEstado()} AS citas,
                   ROUND(100*${this.aggCumplidas()}/NULLIF(${this.aggConEstado()},0),1) AS pct
            FROM costos_agg a ${whereSql}
              AND a.convenio_grupo IS NOT NULL ${ntConvenios}
              ${this.aggAsistencial()}
            GROUP BY a.convenio_grupo
            ORDER BY pct DESC, citas DESC
          `,
      ),
      this.prisma.$queryRaw<Array<{ sede_grupo: string; citas: bigint }>>(
        Prisma.sql`
            SELECT a.sede_grupo, ${this.aggCitas()} AS citas
            FROM costos_agg a ${whereSql}
              AND a.sede_grupo IS NOT NULL
              ${this.aggExcluirCanceladas()}
            GROUP BY a.sede_grupo ORDER BY citas DESC
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
    const { whereSql } = buildAggWhere(filters);
    // Meta a nivel ciudad: misma base pero ignorando la sede fisica. Asi, al
    // seleccionar una sede, el KPI muestra su aporte respecto a la ciudad
    // (ejecutado_sede / meta_ciudad). Sin sede seleccionada whereMetaSql == whereSql.
    //
    // Este fragmento se inyecta en periodoMeses(), ejecAgg() y
    // contratadoScope(), que leen de `costos_agg` con alias `a`, asi que tiene
    // que salir de buildAggWhere. Antes lo armaba un segundo builder que emitia
    // alias `c` (para la tabla cruda `costos`) y MySQL respondia 1054 "Unknown
    // column 'c.sede_grupo'". Como whereMetaSql solo se usa en la rama
    // `sedeActiva`, el fallo aparecia unicamente al bajar al detalle de sede
    // fisica, y tumbaba el endpoint entero porque las 7 consultas van en
    // Promise.all. Ese builder ya no existe.
    const { whereSql: whereMetaSql } = buildAggWhere({
      ...filters,
      sede: undefined,
    });
    const sedeActiva = this.sedeSeleccionada(filters);

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
            -- ROUND igual que en la rama sin sede: el reparto proporcional del
            -- numerador capado da decimales (129973.3826) y esto es un conteo
            -- de citas. El pct se calcula ANTES de redondear, sobre el valor
            -- exacto, para no arrastrar el error al porcentaje.
            ROUND(num.ejecutado) AS ejecutado,
            den.meta_periodo AS meta_periodo,
            -- Ejecutado de la CIUDAD entera, para poder leer la sede como
            -- aporte. Las sedes reconcilian con el (verificado: la suma de las
            -- sedes de una ciudad da su ejecutado capado).
            den.ejecutado_total AS ejecutado_total,
            ROUND(100 * num.ejecutado / NULLIF(den.meta_periodo, 0), 1) AS pct,
            ROUND(100 * num.ejecutado / NULLIF(den.ejecutado_total, 0), 1) AS aporte_pct
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
                SELECT a.convenio_nt AS nombre_convenio, a.cups, ${this.aggCitas()} AS ejec_sede
                FROM costos_agg a ${whereSql}
                  AND a.cups IS NOT NULL AND a.convenio_nt IS NOT NULL
                  ${this.aggAsistencial()} ${this.aggSoloConsulta()}
                GROUP BY a.convenio_nt, a.cups
              ) s ON s.cups = city.cups AND s.nombre_convenio = city.nombre_convenio
            ) num
            CROSS JOIN
            (
              -- meta y ejecutado de la ciudad salen del MISMO recorrido de
              -- contratadoScope: pedirlos por separado lo evaluaria dos veces,
              -- y es la subconsulta mas cara del endpoint.
              SELECT COALESCE(SUM(t.meta), 0) AS meta_periodo,
                     ROUND(COALESCE(SUM(LEAST(t.n, t.meta)), 0)) AS ejecutado_total
              FROM ${this.contratadoScope(whereMetaSql, ntMap)} t
            ) den
        `
      : Prisma.sql`
          SELECT
            ROUND(COALESCE(SUM(LEAST(t.n, t.meta)), 0)) AS ejecutado,
            ROUND(COALESCE(SUM(t.meta), 0)) AS meta_periodo,
            -- Sin sede fisica no hay un "total" al que aportar: este ES el
            -- total. NULL le dice al front que muestre cumplimiento, no aporte.
            NULL AS ejecutado_total,
            ROUND(100 * COALESCE(SUM(LEAST(t.n, t.meta)), 0) / NULLIF(SUM(t.meta), 0), 1) AS pct,
            NULL AS aporte_pct
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
        Array<{
          ejecutado: bigint;
          meta_periodo: number;
          ejecutado_total: number | null;
          pct: number | null;
          aporte_pct: number | null;
        }>
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
            SELECT a.cups
            FROM costos_agg a
            JOIN ${ntMap} m ON m.cups = a.cups AND m.nombre_convenio = a.convenio_nt
            ${whereSql} ${this.aggAsistencial()} ${this.aggSoloConsulta()}
            GROUP BY a.cups
            ORDER BY ${this.aggCitas()} DESC, a.cups
            LIMIT 8
          ),
          ejec AS ${this.ejecAgg(whereSql, Prisma.sql`AND a.cups IN (SELECT cups FROM top_cups)`)},
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
          -- Desempate explicito: hay muchisimas filas con pct = 0, que empatan
          -- todas en ABS(pct-100) = 100. Sin criterio adicional el LIMIT 8
          -- elegia 8 cualesquiera segun el orden fisico de lectura, asi que la
          -- lista cambiaba sola entre recargas o tras recargar la tabla.
          ORDER BY ABS(pct - 100) DESC, meta DESC, convenio, m.cups LIMIT 8
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
            SELECT a.convenio_nt AS nombre_convenio, DATE_FORMAT(a.fecha_cita,'%Y-%m') AS mes, ${this.aggCitas()} AS n
            FROM costos_agg a ${whereSql}
              AND a.fecha_cita IS NOT NULL AND a.convenio_nt IS NOT NULL
              ${this.aggAsistencial()} ${this.aggSoloConsulta()}
            GROUP BY a.convenio_nt, mes
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
            SELECT GREATEST(COUNT(DISTINCT EXTRACT(YEAR_MONTH FROM a.fecha_cita)), 1) AS meses
            FROM costos_agg a ${whereSql} AND a.fecha_cita IS NOT NULL
              ${this.aggAsistencial()}
          ),
          conv_scope AS (
            SELECT DISTINCT a.convenio_nt AS nombre_convenio
            FROM costos_agg a ${whereSql} AND a.convenio_nt IS NOT NULL
              ${this.aggAsistencial()}
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
            a.cups,
            (SELECT LEFT(descripcion,90) FROM cat_cups cc WHERE cc.codigo = a.cups LIMIT 1) AS descripcion,
            ${this.aggCitas()} AS ejecutado
          -- Anti-join en vez de NOT IN (subconsulta): con NOT IN el optimizador
          -- no puede usar indices y termina examinando las 234k filas del
          -- agregado. Con LEFT JOIN ... IS NULL da el mismo resultado (54 filas,
          -- verificado) en 586 ms contra 1.637 ms: 2,8x.
          FROM costos_agg a
          LEFT JOIN (SELECT DISTINCT cups FROM nt_map WHERE meta_mes > 0) nm
            ON nm.cups = a.cups
          ${whereSql}
            AND a.cups IS NOT NULL
            AND nm.cups IS NULL
            ${this.aggAsistencial()}
          GROUP BY a.cups
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
    const { whereSql } = buildAggWhere(filters);
    // Mismo criterio que ejecucion-nt: la nota tecnica NO tiene dimension de
    // sede, asi que el contrato se calcula a nivel CIUDAD y no se mueve al
    // bajar a una sede fisica. Antes se calculaba con el filtro completo y el
    // denominador se encogia: `contratoMensual` se acota a los convenios
    // activos bajo el filtro y `periodoMeses` a los meses con datos, y una sede
    // suele tener menos de ambos. Medido en CHIA: la ciudad esperaba 8.889,1M y
    // SEDE CHIA mostraba 3.304,1M, lo que inflaba su ejecucion de 13,2% a 35,5%.
    // Sin sede seleccionada whereMetaSql == whereSql.
    const { whereSql: whereMetaSql } = buildAggWhere({
      ...filters,
      sede: undefined,
    });
    const sedeActiva = this.sedeSeleccionada(filters);
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
      costoRealTotal,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ millones: number | null; citas_costeadas: bigint }>
      >(
        Prisma.sql`
            SELECT
              -- Cada fila del agregado representa \`citas\` citas, no una: el
              -- costo va multiplicado, no sumado una sola vez.
              ROUND(SUM(m.costo_medio * a.citas)/1e6, 1) AS millones,
              ${this.aggCitas()} AS citas_costeadas
            FROM costos_agg a
            JOIN ${ntMapCosto} m ON m.cups = a.cups AND m.nombre_convenio = a.convenio_nt
            ${whereSql}
              ${this.aggExcluirCanceladas()}
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
              ${this.contratoMensual(whereMetaSql)} * ${this.periodoMeses(whereMetaSql)} / 1e6
            , 1) AS millones
          `,
      ),
      this.prisma.$queryRaw<Array<{ millones: number | null }>>(
        Prisma.sql`SELECT ROUND(SUM(a.recuperacion)/1e6,1) AS millones FROM costos_agg a ${whereSql}`,
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
            SELECT a.cups,
                   (SELECT LEFT(descripcion,50) FROM notas_tecnicas nt WHERE nt.cups=a.cups LIMIT 1) AS descripcion,
                   ${this.aggCitas()} AS n,
                   ROUND(SUM(m.costo_medio * a.citas)/1e6, 1) AS millones
            FROM costos_agg a
            JOIN ${ntMapCosto} m ON m.cups=a.cups AND m.nombre_convenio=a.convenio_nt
            ${whereSql}
              ${this.aggExcluirCanceladas()}
            GROUP BY a.cups
            ORDER BY millones DESC
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ top20: number | null; total: number | null }>
      >(
        Prisma.sql`
            WITH costo_cups AS (
              SELECT a.cups, SUM(m.costo_medio * a.citas) AS costo
              FROM costos_agg a JOIN ${ntMapCosto} m ON m.cups=a.cups AND m.nombre_convenio=a.convenio_nt
              ${whereSql}
              ${this.aggExcluirCanceladas()}
              GROUP BY a.cups
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
            SELECT a.convenio_grupo,
                   ${this.aggCitas()} AS citas,
                   ROUND(SUM(m.costo_medio * a.citas)/1e6, 1) AS millones
            FROM costos_agg a
            JOIN ${ntMapCosto} m ON m.cups=a.cups AND m.nombre_convenio=a.convenio_nt
            ${whereSql}
              AND a.convenio_grupo IS NOT NULL
              ${this.aggExcluirCanceladas()}
            GROUP BY a.convenio_grupo
            ORDER BY millones DESC
          `,
      ),
      this.prisma.$queryRaw<
        Array<{ convenio_grupo: string; millones: number | null }>
      >(
        Prisma.sql`
            SELECT a.convenio_grupo,
                   ROUND(SUM(a.recuperacion)/1e6,1) AS millones
            FROM costos_agg a ${whereSql}
              AND a.convenio_grupo IS NOT NULL
            GROUP BY a.convenio_grupo
            -- El original filtraba fila a fila con \`valor_recuperacion > 0\`, que
            -- el agregado no puede reproducir porque ya viene sumado. Equivale a
            -- este HAVING: no hay valores negativos en la columna (verificado:
            -- 0 negativos, y SUM total == SUM de solo positivos), asi que un
            -- grupo con alguna fila positiva es exactamente un grupo con suma > 0.
            -- OJO: la condicion va sobre la suma CRUDA, no sobre \`millones\`. Un
            -- convenio con recuperacion pequenya redondea a 0.0 millones y el
            -- original si lo devolvia; filtrar por el redondeo lo hacia desaparecer.
            HAVING SUM(a.recuperacion) > 0
            ORDER BY millones DESC
          `,
      ),
      // Costo real de la CIUDAD, para leer la sede como aporte ("esta sede pone
      // el 39,6% de los $7.441,3M de CUCUTA"). Es la misma consulta que
      // costoReal pero con la sede fuera del WHERE. Solo se lanza si hay una
      // sede fisica seleccionada: sin ella el total ya es costoReal y pedirlo
      // seria repetir la consulta mas cara del endpoint.
      sedeActiva
        ? this.prisma.$queryRaw<Array<{ millones: number | null }>>(
            Prisma.sql`
            SELECT ROUND(SUM(m.costo_medio * a.citas)/1e6, 1) AS millones
            FROM costos_agg a
            JOIN ${ntMapCosto} m ON m.cups = a.cups AND m.nombre_convenio = a.convenio_nt
            ${whereMetaSql}
              ${this.aggExcluirCanceladas()}
          `,
          )
        : Promise.resolve([]),
    ]);

    const top20 = Number(paretoTotal[0]?.top20 ?? 0);
    const total = Number(paretoTotal[0]?.total ?? 0);
    const paretoTop20Pct =
      total > 0 ? Math.round(((top20 * 100) / total) * 10) / 10 : 0;

    // Aporte de la sede fisica al costo real de su ciudad. null sin sede
    // seleccionada: ahi el KPI ya ES el total y no hay nada a que aportar.
    const costoRealTotalMillones = sedeActiva
      ? (costoRealTotal[0]?.millones ?? null)
      : null;
    const aporteCostoRealPct =
      costoRealTotalMillones && costoReal[0]?.millones
        ? Math.round(
            (costoReal[0].millones / costoRealTotalMillones) * 100 * 10,
          ) / 10
        : null;

    return {
      kpis: {
        costoRealMillones: costoReal[0]?.millones ?? null,
        citasCosteadas: Number(costoReal[0]?.citas_costeadas ?? 0),
        costoRealTotalMillones,
        aporteCostoRealPct,
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
    // Lee del pre-agregado costos_agg, no de costos. Ver rebuildAgregado().
    const { whereSql } = buildAggWhere(filters);

    // La inasistencia/incumplimiento por convenio es una metrica de cumplimiento
    // de la IPS: los convenios de evento (sin NT) no aplican (su no-ejecucion es
    // inasistencia del usuario, no incumplimiento de la IPS). Se filtra a nivel
    // de cita igual que en Resumen, para que p.ej. COMPENSAR CUCUTA EVENTO no
    // aparezca pero COMPENSAR CAJICA PGP si.
    const ntConvenios = this.aggSoloNt();

    const [oportunidad, estadoSede, inasistencia, mixAgenda] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ especialidad: string; n: bigint; dias: number | null }>
        >(
          Prisma.sql`
          SELECT a.especialidad,
                 ${this.aggConOportunidad()} AS n,
                 ROUND(${this.aggOportunidad()},1) AS dias
          FROM costos_agg a ${whereSql}
            AND a.especialidad IS NOT NULL AND a.especialidad <> ''
            ${this.aggExcluirCanceladas()}
          GROUP BY a.especialidad
          HAVING n > 0
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
          SELECT a.sede_grupo,
                 ${this.aggCitas()} AS total,
                 ROUND(100*${this.aggCumplidas()}/${this.aggCitas()},1) AS pct_cump,
                 ROUND(100*${this.aggIncumplidas()}/${this.aggCitas()},1) AS pct_incump,
                 ROUND(100*${this.aggEstado('CANCELADA')}/${this.aggCitas()},1) AS pct_canc
          FROM costos_agg a ${whereSql}
            AND a.sede_grupo IS NOT NULL AND a.estado_consulta IS NOT NULL
            ${this.aggAsistencial()}
          GROUP BY a.sede_grupo
          ORDER BY total DESC
        `,
        ),
        this.prisma.$queryRaw<
          Array<{ convenio_grupo: string; mes: string; pct: number | null }>
        >(
          Prisma.sql`
          SELECT a.convenio_grupo, DATE_FORMAT(a.fecha_cita,'%Y-%m') AS mes,
                 ROUND(100*${this.aggIncumplidas()}/NULLIF(${this.aggCitas()},0),1) AS pct
          FROM costos_agg a ${whereSql} ${ntConvenios}
            AND a.convenio_grupo IS NOT NULL
            AND a.fecha_cita IS NOT NULL
            ${this.aggAsistencial()}
            ${this.aggExcluirCanceladas()}
          GROUP BY a.convenio_grupo, mes
          ORDER BY a.convenio_grupo, mes
        `,
        ),
        this.prisma.$queryRaw<
          Array<{ sede_grupo: string; tipo_agenda: string; n: bigint }>
        >(
          Prisma.sql`
          SELECT a.sede_grupo, a.tipo_agenda, ${this.aggCitas()} AS n
          FROM costos_agg a ${whereSql}
            AND a.sede_grupo IS NOT NULL
            AND a.tipo_agenda IS NOT NULL
            ${this.aggExcluirCanceladas()}
          GROUP BY a.sede_grupo, a.tipo_agenda
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
    // Lee del pre-agregado costos_agg, no de costos. Ver rebuildAgregado().
    // Nota: el denominador original es `SUM(estado_consulta IS NOT NULL)`, que
    // aqui equivale a aggConEstado() porque las canceladas ya salieron por el
    // WHERE; el `<> CANCELADA` del helper queda redundante pero inocuo.
    const { whereSql } = buildAggWhere(filters);

    const [topProgramas, alertas] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ pym: string; n: bigint; pct_cump: number | null }>
      >(
        Prisma.sql`
          SELECT a.pym, ${this.aggCitas()} AS n,
                 ROUND(100*${this.aggCumplidas()}/NULLIF(${this.aggConEstado()},0),1) AS pct_cump
          FROM costos_agg a ${whereSql}
            AND a.pym IS NOT NULL AND a.pym <> ''
            ${this.aggAsistencial()}
            ${this.aggExcluirCanceladas()}
          GROUP BY a.pym ORDER BY n DESC
        `,
      ),
      this.prisma.$queryRaw<
        Array<{ cohorte: string; poblacion: bigint; pct_cump: number | null }>
      >(
        Prisma.sql`
          SELECT a.pym AS cohorte,
                 ${this.aggCitas()} AS poblacion,
                 ROUND(100*${this.aggCumplidas()}/NULLIF(${this.aggConEstado()},0),1) AS pct_cump
          FROM costos_agg a ${whereSql}
            AND a.pym IS NOT NULL AND a.pym <> ''
            ${this.aggAsistencial()}
            ${this.aggExcluirCanceladas()}
          GROUP BY a.pym
          HAVING poblacion > 200 AND pct_cump < 80
          -- Desempate por cohorte: sin el, un empate en pct_cump hacia que el
          -- LIMIT 8 devolviera cohortes distintas entre recargas.
          ORDER BY pct_cump ASC, cohorte LIMIT 8
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
