"""Calcula mÃ©tricas reales para los 5 dashboards y vuelca JSON.

Lee datos vivos de citas_db; omite mÃ©tricas que dependen de Nota TÃ©cnica
o de fecha_nacimiento/grupo_etario (pendientes de Fase A del ETL).
"""
from __future__ import annotations
import json
import os
from decimal import Decimal
from datetime import date
import pymysql


def _serialize(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (date,)):
        return o.isoformat()
    raise TypeError(o)


def q(cur, sql, args=None):
    cur.execute(sql, args or ())
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def main():
    con = pymysql.connect(
        host="localhost", user="root", password="S.O.A.D",
        database="citas_db", port=3306, charset="utf8mb4",
    )
    cur = con.cursor()
    out = {}

    # ---- Periodo cubierto (solo CONSULTAS) ----
    cur.execute("SELECT MIN(fecha_cita), MAX(fecha_cita), COUNT(*) FROM costos WHERE funcionalidad='CONSULTA'")
    fmin, fmax, total = cur.fetchone()
    out["meta"] = {"fecha_min": str(fmin), "fecha_max": str(fmax), "total_citas": total,
                   "scope": "funcionalidad='CONSULTA'"}

    # ============================================================
    # DASHBOARD 1 â€” RESUMEN GERENCIAL
    # ============================================================
    d1 = {}

    # KPI Cumplimiento global (% CUMPLIDA sobre total con estado)
    d1["kpi_cumplimiento"] = q(cur, """
        SELECT
          ROUND(100 * SUM(estado_consulta='CUMPLIDA') / NULLIF(SUM(estado_consulta IS NOT NULL),0), 1) AS pct,
          SUM(estado_consulta='CUMPLIDA') AS cumplidas,
          SUM(estado_consulta IS NOT NULL) AS con_estado
        FROM costos
        WHERE funcionalidad='CONSULTA'
    """)[0]

    # KPI RecuperaciÃ³n total ($M)
    d1["kpi_recuperacion"] = q(cur, """
        SELECT ROUND(SUM(valor_recuperacion)/1e6,1) AS millones FROM costos
        WHERE funcionalidad='CONSULTA'
    """)[0]

    # KPI Convenios en riesgo (% cumplida < 70% y >100 citas)
    d1["kpi_convenios_riesgo"] = q(cur, """
        SELECT COUNT(*) AS n FROM (
          SELECT nombre_convenio,
                 100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0) AS pct,
                 COUNT(*) AS citas
          FROM costos
          WHERE nombre_convenio IS NOT NULL AND funcionalidad='CONSULTA'
          GROUP BY nombre_convenio
          HAVING citas > 100 AND pct < 70
        ) t
    """)[0]

    # KPI Oportunidad promedio (dÃ­as)
    d1["kpi_oportunidad"] = q(cur, """
        SELECT ROUND(AVG(DATEDIFF(fecha_cita, fecha_deseada)),1) AS dias
        FROM costos
        WHERE fecha_deseada IS NOT NULL AND fecha_cita >= fecha_deseada
          AND funcionalidad='CONSULTA'
    """)[0]

    # EvoluciÃ³n mensual de citas
    d1["evolucion_mensual"] = q(cur, """
        SELECT DATE_FORMAT(fecha_cita,'%%Y-%%m') AS mes,
               COUNT(*) AS citas,
               SUM(estado_consulta='CUMPLIDA') AS cumplidas
        FROM costos
        WHERE fecha_cita IS NOT NULL AND funcionalidad='CONSULTA'
        GROUP BY mes ORDER BY mes
    """)

    # DistribuciÃ³n por funcionalidad
    d1["distribucion_servicios"] = q(cur, """
        SELECT COALESCE(funcionalidad,'NO DEFINIDO') AS tipo, COUNT(*) AS n
        FROM costos GROUP BY tipo ORDER BY n DESC
    """)

    # Top 5 convenios por % cumplimiento (>500 citas)
    d1["cumplimiento_top_convenios"] = q(cur, """
        SELECT nombre_convenio,
               COUNT(*) AS citas,
               ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct
        FROM costos
        WHERE nombre_convenio IS NOT NULL AND funcionalidad='CONSULTA'
        GROUP BY nombre_convenio
        HAVING citas > 500
        ORDER BY citas DESC LIMIT 5
    """)

    # Costo por sede (top 4)
    d1["costo_por_sede"] = q(cur, """
        SELECT nombre_sede,
               ROUND(SUM(costo_servicio)/1e6,1) AS millones,
               COUNT(*) AS citas
        FROM costos
        WHERE nombre_sede IS NOT NULL AND funcionalidad='CONSULTA'
        GROUP BY nombre_sede ORDER BY millones DESC LIMIT 6
    """)

    out["resumen_gerencial"] = d1

    # ============================================================
    # DASHBOARD 2 - EJECUCION VS NOTA TECNICA (CON NT real)
    # NT (notas_tecnicas) tiene meta mensual (n_eventos_mes) y costo_medio_evento
    # Mapeo flexible: NT.convenio "X / SUBSIDIADO" matchea X CONTRIBUTIVO y X SUBSIDIADO
    # ============================================================
    d2 = {"_info": "NT vigente notas_tecnicas (oct/2025 - may/2026, 7700 filas, 11 convenios)"}

    # ---- Crear tabla puente NT mapeada a convenios de costos ----
    # NT.convenio "X / SUBSIDIADO" -> dos filas: X CONTRIBUTIVO y X SUBSIDIADO
    # NT.convenio simple -> una fila igual
    # Asi todos los JOINs siguientes son nt_map.cups + nt_map.nombre_convenio (igualdad simple, indexable)
    cur.execute("DROP TABLE IF EXISTS nt_map")
    cur.execute("""
        CREATE TABLE nt_map (
          nombre_convenio VARCHAR(300),
          cups VARCHAR(20),
          meta_mes INT,
          costo_medio DECIMAL(18,2),
          programa VARCHAR(100),
          INDEX ix_cups_conv (cups, nombre_convenio)
        ) ENGINE=InnoDB
    """)
    cur.execute("""
        INSERT INTO nt_map (nombre_convenio, cups, meta_mes, costo_medio, programa)
        SELECT
          CASE WHEN convenio LIKE '%% / SUBSIDIADO'
               THEN REPLACE(convenio,' / SUBSIDIADO','')
               ELSE convenio END,
          cups, n_eventos_mes, costo_medio_evento, programa
        FROM notas_tecnicas
        UNION ALL
        SELECT
          REPLACE(REPLACE(convenio,' / SUBSIDIADO',''),' CONTRIBUTIVO',' SUBSIDIADO'),
          cups, n_eventos_mes, costo_medio_evento, programa
        FROM notas_tecnicas
        WHERE convenio LIKE '%% / SUBSIDIADO'
    """)
    # PyMySQL abre la sesion con autocommit=0; sin commit explicito el INSERT
    # se ve dentro de esta sesion (queries siguientes funcionan) pero al
    # cerrar la conexion MariaDB hace rollback y nt_map queda vacia.
    con.commit()

    # KPI Cumplimiento global vs meta
    d2["kpi_cumplimiento_global"] = q(cur, """
        WITH ejec AS (
          SELECT c.nombre_convenio, c.cups, COUNT(*) AS n,
                 COUNT(DISTINCT DATE_FORMAT(c.fecha_cita,'%%Y-%%m')) AS meses
          FROM costos c
          WHERE c.cups IS NOT NULL AND c.nombre_convenio IS NOT NULL
            AND c.funcionalidad='CONSULTA'
          GROUP BY c.nombre_convenio, c.cups
        )
        SELECT
          SUM(e.n) AS ejecutado,
          SUM(m.meta_mes * e.meses) AS meta_periodo,
          ROUND(100*SUM(e.n)/NULLIF(SUM(m.meta_mes * e.meses),0),1) AS pct_cumplimiento
        FROM ejec e
        JOIN nt_map m ON m.cups = e.cups AND m.nombre_convenio = e.nombre_convenio
    """)[0]

    # Heatmap convenio x top 8 CUPS
    d2["heatmap_convenio_cups"] = q(cur, """
        WITH top_cups AS (
          SELECT cups FROM nt_map GROUP BY cups ORDER BY SUM(meta_mes) DESC LIMIT 8
        ),
        ejec AS (
          SELECT c.nombre_convenio, c.cups, COUNT(*) n,
                 COUNT(DISTINCT DATE_FORMAT(c.fecha_cita,'%%Y-%%m')) meses
          FROM costos c
          WHERE c.cups IN (SELECT cups FROM top_cups)
            AND c.funcionalidad='CONSULTA'
          GROUP BY c.nombre_convenio, c.cups
        )
        SELECT
          m.nombre_convenio AS convenio,
          m.cups,
          m.meta_mes,
          COALESCE(e.n,0) AS ejecutado,
          COALESCE(e.meses,5) AS meses,
          ROUND(100*COALESCE(e.n,0)/NULLIF(m.meta_mes * COALESCE(e.meses,5),0),1) AS pct
        FROM nt_map m
        LEFT JOIN ejec e ON e.cups = m.cups AND e.nombre_convenio = m.nombre_convenio
        WHERE m.cups IN (SELECT cups FROM top_cups)
        ORDER BY m.nombre_convenio, m.cups
    """)

    # Detalle desviaciones: items con cumplimiento <80% o >120% y meta > 100
    d2["desviaciones"] = q(cur, """
        WITH ejec AS (
          SELECT c.nombre_convenio, c.cups, COUNT(*) n,
                 COUNT(DISTINCT DATE_FORMAT(c.fecha_cita,'%%Y-%%m')) meses
          FROM costos c WHERE c.cups IS NOT NULL AND c.nombre_convenio IS NOT NULL
            AND c.funcionalidad='CONSULTA'
          GROUP BY c.nombre_convenio, c.cups
        )
        SELECT
          m.nombre_convenio AS convenio,
          m.cups,
          (SELECT LEFT(descripcion,60) FROM notas_tecnicas nt WHERE nt.cups=m.cups LIMIT 1) AS descripcion,
          m.meta_mes * COALESCE(e.meses,5) AS meta,
          COALESCE(e.n,0) AS ejecutado,
          ROUND(100*COALESCE(e.n,0)/NULLIF(m.meta_mes * COALESCE(e.meses,5),0),1) AS pct
        FROM nt_map m
        LEFT JOIN ejec e ON e.cups = m.cups AND e.nombre_convenio = m.nombre_convenio
        WHERE m.meta_mes > 100
        HAVING pct IS NOT NULL AND (pct < 80 OR pct > 120)
        ORDER BY ABS(pct - 100) DESC LIMIT 8
    """)

    # Tendencia mensual ejecutado para top 5 convenios NT
    d2["tendencia_cumplimiento"] = q(cur, """
        WITH meta AS (
          SELECT nombre_convenio, SUM(meta_mes) AS meta_mes_total
          FROM nt_map GROUP BY nombre_convenio
        ),
        ejec AS (
          SELECT nombre_convenio, DATE_FORMAT(fecha_cita,'%%Y-%%m') AS mes, COUNT(*) AS n
          FROM costos
          WHERE fecha_cita IS NOT NULL AND nombre_convenio IS NOT NULL
            AND funcionalidad='CONSULTA'
          GROUP BY nombre_convenio, mes
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
    """)

    out["ejecucion_nt"] = d2

    # ============================================================
    # DASHBOARD 3 - ANALISIS FINANCIERO (con NT real)
    # ============================================================
    d3 = {"_info": "Costo = NT.costo_medio_evento x citas ejecutadas matcheadas con NT (via nt_map)"}

    d3["kpi_costo_real_ejecutado"] = q(cur, """
        SELECT
          ROUND(SUM(m.costo_medio)/1e6, 1) AS millones,
          COUNT(*) AS citas_costeadas
        FROM costos c
        JOIN nt_map m ON m.cups = c.cups AND m.nombre_convenio = c.nombre_convenio
        WHERE c.funcionalidad='CONSULTA'
    """)[0]

    d3["kpi_costo_esperado_nt"] = q(cur, """
        SELECT ROUND(SUM(meta_mes * costo_medio * 5)/1e6, 1) AS millones FROM nt_map
    """)[0]

    d3["kpi_recuperacion"] = q(cur, """
        SELECT ROUND(SUM(valor_recuperacion)/1e6,1) AS millones FROM costos
        WHERE funcionalidad='CONSULTA'
    """)[0]

    d3["kpi_eficiencia"] = q(cur, """
        SELECT ROUND(100 *
          (SELECT SUM(valor_recuperacion) FROM costos WHERE funcionalidad='CONSULTA')
          / NULLIF((
            SELECT SUM(m.costo_medio) FROM costos c
            JOIN nt_map m ON m.cups=c.cups AND m.nombre_convenio=c.nombre_convenio
            WHERE c.funcionalidad='CONSULTA'
          ),0), 1) AS pct
    """)[0]

    d3["pareto_cups"] = q(cur, """
        SELECT c.cups,
               (SELECT LEFT(descripcion,50) FROM notas_tecnicas nt WHERE nt.cups=c.cups LIMIT 1) AS descripcion,
               COUNT(*) AS n,
               ROUND(SUM(m.costo_medio)/1e6, 1) AS millones
        FROM costos c
        JOIN nt_map m ON m.cups=c.cups AND m.nombre_convenio=c.nombre_convenio
        WHERE c.funcionalidad='CONSULTA'
        GROUP BY c.cups
        ORDER BY millones DESC LIMIT 10
    """)

    cur.execute("""
        WITH costo_cups AS (
          SELECT c.cups, SUM(m.costo_medio) AS costo
          FROM costos c JOIN nt_map m ON m.cups=c.cups AND m.nombre_convenio=c.nombre_convenio
          WHERE c.funcionalidad='CONSULTA'
          GROUP BY c.cups
        )
        SELECT
          (SELECT SUM(costo) FROM (SELECT costo FROM costo_cups ORDER BY costo DESC LIMIT 20) t) AS top20,
          (SELECT SUM(costo) FROM costo_cups) AS total
    """)
    top20, total_c = cur.fetchone()
    d3["pareto_top20_pct"] = round(float(top20) * 100 / float(total_c), 1) if total_c else 0

    d3["costo_por_convenio"] = q(cur, """
        SELECT c.nombre_convenio,
               COUNT(*) AS citas,
               ROUND(SUM(m.costo_medio)/1e6, 1) AS millones
        FROM costos c
        JOIN nt_map m ON m.cups=c.cups AND m.nombre_convenio=c.nombre_convenio
        WHERE c.funcionalidad='CONSULTA'
        GROUP BY c.nombre_convenio
        ORDER BY millones DESC LIMIT 5
    """)

    d3["recuperacion_por_convenio"] = q(cur, """
        SELECT nombre_convenio,
               ROUND(SUM(valor_recuperacion)/1e6,1) AS millones
        FROM costos
        WHERE nombre_convenio IS NOT NULL AND valor_recuperacion > 0
          AND funcionalidad='CONSULTA'
        GROUP BY nombre_convenio
        ORDER BY millones DESC LIMIT 5
    """)

    out["financiero"] = d3

    # ============================================================
    # DASHBOARD 4 â€” CALIDAD Y OPORTUNIDAD
    # ============================================================
    d4 = {}

    # Oportunidad por especialidad (top 4 con mÃ¡s volumen)
    d4["oportunidad_especialidad"] = q(cur, """
        SELECT especialidad,
               COUNT(*) AS n,
               ROUND(AVG(DATEDIFF(fecha_cita, fecha_deseada)),1) AS dias
        FROM costos
        WHERE fecha_deseada IS NOT NULL
          AND fecha_cita >= fecha_deseada
          AND especialidad IS NOT NULL AND especialidad <> ''
          AND funcionalidad='CONSULTA'
        GROUP BY especialidad
        HAVING n > 500
        ORDER BY n DESC LIMIT 4
    """)

    # Estado consultas por sede (top 3 sedes)
    d4["estado_por_sede"] = q(cur, """
        SELECT nombre_sede,
               COUNT(*) AS total,
               ROUND(100*SUM(estado_consulta='CUMPLIDA')/COUNT(*),1) AS pct_cump,
               ROUND(100*SUM(estado_consulta='INCUMPLIDA')/COUNT(*),1) AS pct_incump,
               ROUND(100*SUM(estado_consulta='CANCELADA')/COUNT(*),1) AS pct_canc
        FROM costos
        WHERE nombre_sede IS NOT NULL AND estado_consulta IS NOT NULL
          AND funcionalidad='CONSULTA'
        GROUP BY nombre_sede
        ORDER BY total DESC LIMIT 3
    """)

    # % Inasistencia mensual (top 2 convenios)
    d4["inasistencia_mensual"] = q(cur, """
        SELECT nombre_convenio, DATE_FORMAT(fecha_cita,'%%Y-%%m') AS mes,
               ROUND(100*SUM(estado_consulta='INCUMPLIDA')/NULLIF(COUNT(*),0),1) AS pct
        FROM costos
        WHERE nombre_convenio IN (
          SELECT nombre_convenio FROM (
            SELECT nombre_convenio, COUNT(*) c FROM costos
            WHERE nombre_convenio IS NOT NULL AND funcionalidad='CONSULTA'
            GROUP BY nombre_convenio ORDER BY c DESC LIMIT 2
          ) t
        )
        AND fecha_cita IS NOT NULL AND funcionalidad='CONSULTA'
        GROUP BY nombre_convenio, mes
        ORDER BY nombre_convenio, mes
    """)

    # Mix tipo agenda por sede (top 3 sedes)
    d4["mix_agenda_por_sede"] = q(cur, """
        SELECT nombre_sede, tipo_agenda, COUNT(*) AS n
        FROM costos
        WHERE nombre_sede IN (
          SELECT nombre_sede FROM (
            SELECT nombre_sede, COUNT(*) c FROM costos
            WHERE nombre_sede IS NOT NULL AND funcionalidad='CONSULTA'
            GROUP BY nombre_sede ORDER BY c DESC LIMIT 3
          ) t
        )
        AND tipo_agenda IS NOT NULL AND funcionalidad='CONSULTA'
        GROUP BY nombre_sede, tipo_agenda
    """)

    out["calidad"] = d4

    # ============================================================
    # DASHBOARD 5 â€” PyM / RIAS
    # ============================================================
    d5 = {"_warning": "Grupo etario y poblaciÃ³n denominador pendientes Fase A"}

    # Top programas PyM por volumen
    d5["top_programas"] = q(cur, """
        SELECT pym, COUNT(*) AS n,
               ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct_cump
        FROM costos
        WHERE pym IS NOT NULL AND pym <> '' AND funcionalidad='CONSULTA'
        GROUP BY pym ORDER BY n DESC LIMIT 10
    """)

    # KPIs detecciÃ³n temprana (buscar programas conocidos)
    d5["deteccion_temprana"] = q(cur, """
        SELECT pym, COUNT(*) AS n,
               ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct_cump
        FROM costos
        WHERE pym IS NOT NULL AND funcionalidad='CONSULTA'
          AND (UPPER(pym) LIKE '%%CITOLOG%%'
            OR UPPER(pym) LIKE '%%CARDIOV%%' OR UPPER(pym) LIKE '%%RIESGO%%'
            OR UPPER(pym) LIKE '%%PRENATAL%%' OR UPPER(pym) LIKE '%%GESTANT%%')
        GROUP BY pym ORDER BY n DESC LIMIT 10
    """)

    # Cohortes en alerta (% cumplimiento < 80%)
    d5["alertas_cohortes"] = q(cur, """
        SELECT pym AS cohorte,
               COUNT(*) AS poblacion,
               ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct_cump
        FROM costos
        WHERE pym IS NOT NULL AND pym <> '' AND funcionalidad='CONSULTA'
        GROUP BY pym
        HAVING poblacion > 200 AND pct_cump < 80
        ORDER BY pct_cump ASC LIMIT 8
    """)

    out["pym_rias"] = d5

    con.close()

    path = os.path.join("docs", "dashboards", "datos_reales.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, default=_serialize)
    print(f"OK -> {path}")
    print(json.dumps(out["meta"], default=_serialize, ensure_ascii=False))


if __name__ == "__main__":
    main()


