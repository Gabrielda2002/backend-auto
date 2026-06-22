"""Smoke test: ejecuta las queries clave que usan los nuevos endpoints
de filtros y dashboards para confirmar que los agregados cuadran."""
import pymysql

con = pymysql.connect(
    host="localhost", user="root", password="S.O.A.D",
    database="citas_db", port=3306, charset="utf8mb4",
)
cur = con.cursor()

def q(sql):
    cur.execute(sql)
    return cur.fetchall()

def section(t):
    print("\n" + "=" * 64)
    print(t)
    print("=" * 64)

section("Nuevos endpoints de filtros")
print("  GET /filtros/convenios-grupo")
for v, n in q("SELECT convenio_grupo, COUNT(*) FROM costos WHERE convenio_grupo IS NOT NULL GROUP BY convenio_grupo ORDER BY 2 DESC LIMIT 6"):
    print(f"    {v:30s} {n:>10,}")

print("\n  GET /filtros/sedes-grupo")
for v, n in q("SELECT sede_grupo, COUNT(*) FROM costos WHERE sede_grupo IS NOT NULL GROUP BY sede_grupo ORDER BY 2 DESC LIMIT 6"):
    print(f"    {v:30s} {n:>10,}")

print("\n  GET /filtros/modalidades")
for v, n in q("SELECT modalidad, COUNT(*) FROM costos WHERE modalidad IS NOT NULL GROUP BY modalidad ORDER BY 2 DESC LIMIT 6"):
    print(f"    {v:30s} {n:>10,}")

print("\n  GET /filtros/regimenes")
for v, n in q("SELECT regimen_grupo, COUNT(*) FROM costos WHERE regimen_grupo IS NOT NULL GROUP BY regimen_grupo ORDER BY 2 DESC"):
    print(f"    {v:30s} {n:>10,}")

section("D1 sin filtros: cumplimientoTopConvenios y volumenPorSede")
print("  topConvenios (convenio_grupo):")
for row in q("""
    SELECT convenio_grupo, COUNT(*) AS citas,
           ROUND(100*SUM(estado_consulta='CUMPLIDA')/NULLIF(SUM(estado_consulta IS NOT NULL),0),1) AS pct
    FROM costos WHERE 1=1 AND convenio_grupo IS NOT NULL
    GROUP BY convenio_grupo HAVING citas > 500
    ORDER BY citas DESC LIMIT 5
"""):
    print(f"    {row[0]:30s} citas={row[1]:>8,}  pct={row[2]}")

print("\n  volumenPorSede (sede_grupo):")
for row in q("""
    SELECT sede_grupo, COUNT(*)
    FROM costos WHERE 1=1 AND sede_grupo IS NOT NULL
    GROUP BY sede_grupo ORDER BY 2 DESC LIMIT 6
"""):
    print(f"    {row[0]:30s} {row[1]:>10,}")

section("D1 con filtro convenio=COMPENSAR")
print("  total filas con convenio_grupo=COMPENSAR:")
for row in q("SELECT COUNT(*) FROM costos WHERE convenio_grupo='COMPENSAR'"):
    print(f"    {row[0]:,}")
print("  cumplimientoTopConvenios:")
for row in q("""
    SELECT convenio_grupo, COUNT(*) AS citas
    FROM costos WHERE 1=1 AND convenio_grupo='COMPENSAR'
      AND convenio_grupo IS NOT NULL
    GROUP BY convenio_grupo HAVING citas > 500
    ORDER BY citas DESC LIMIT 5
"""):
    print(f"    {row[0]:30s} citas={row[1]:,}")

section("D2 con filtro convenio=COMPENSAR")
print("  kpiCumplimientoGlobal:")
for row in q("""
    WITH ejec AS (
      SELECT c.nombre_convenio, c.cups, COUNT(*) AS n,
             COUNT(DISTINCT DATE_FORMAT(c.fecha_cita,'%Y-%m')) AS meses
      FROM costos c WHERE 1=1 AND c.convenio_grupo='COMPENSAR'
        AND c.cups IS NOT NULL AND c.nombre_convenio IS NOT NULL
      GROUP BY c.nombre_convenio, c.cups
    )
    SELECT SUM(e.n), SUM(m.meta_mes * e.meses),
           ROUND(100*SUM(e.n)/NULLIF(SUM(m.meta_mes * e.meses),0),1)
    FROM ejec e
    JOIN nt_map m ON m.cups = e.cups AND m.nombre_convenio = e.nombre_convenio
"""):
    print(f"    ejecutado={row[0]:,}  meta={row[1]:,}  pct={row[2]}")

section("D3 con filtro convenio=COMPENSAR + modalidad=PGP")
print("  costoPorConvenio (top 5 por agrupador):")
for row in q("""
    SELECT c.convenio_grupo, COUNT(*) AS citas,
           ROUND(SUM(m.costo_medio)/1e6, 1) AS millones
    FROM costos c
    JOIN nt_map m ON m.cups=c.cups AND m.nombre_convenio=c.nombre_convenio
    WHERE 1=1 AND c.convenio_grupo='COMPENSAR' AND c.modalidad='PGP'
      AND c.convenio_grupo IS NOT NULL
    GROUP BY c.convenio_grupo ORDER BY millones DESC LIMIT 5
"""):
    print(f"    {row[0]:30s} citas={row[1]:,}  ${row[2]}M")

con.close()
print("\nOK")
