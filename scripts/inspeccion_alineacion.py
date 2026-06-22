"""Inspeccion para alinear Excel <-> JSON: funcionalidad y patrones convenio NT."""
import pymysql

con = pymysql.connect(
    host="localhost", user="root", password="S.O.A.D",
    database="citas_db", port=3306, charset="utf8mb4",
)
cur = con.cursor()

print("=== funcionalidad distinct ===")
cur.execute("SELECT COALESCE(funcionalidad,'<NULL>') f, COUNT(*) n FROM costos GROUP BY funcionalidad ORDER BY n DESC")
for f, n in cur.fetchall():
    print(f"  {f:20s} {n:>10,}")

print("\n=== Patrones del campo `convenio` en notas_tecnicas ===")
cur.execute("""
    SELECT
      SUM(convenio LIKE '%/ SUBSIDIADO') AS termina_slash_subsidiado,
      SUM(convenio LIKE '% SUBSIDIADO' AND convenio NOT LIKE '%/ SUBSIDIADO') AS termina_subsidiado,
      SUM(convenio LIKE '% CONTRIBUTIVO' AND convenio NOT LIKE '%/ SUBSIDIADO') AS termina_contributivo,
      SUM(convenio NOT LIKE '% SUBSIDIADO' AND convenio NOT LIKE '% CONTRIBUTIVO') AS sin_sufijo,
      COUNT(*) AS total
    FROM notas_tecnicas
""")
row = cur.fetchone()
print(f"  termina ' / SUBSIDIADO'    = {row[0]}")
print(f"  termina ' SUBSIDIADO'      = {row[1]}")
print(f"  termina ' CONTRIBUTIVO'    = {row[2]}")
print(f"  sin sufijo                 = {row[3]}")
print(f"  TOTAL                      = {row[4]}")

print("\n=== Muestra de convenios distintos ===")
cur.execute("SELECT DISTINCT convenio FROM notas_tecnicas ORDER BY convenio")
for (c,) in cur.fetchall():
    print(f"  {c}")

print("\n=== nombre_convenio en costos: muestra los que tienen ' / SUBSIDIADO' literal? ===")
cur.execute("""
    SELECT
      SUM(nombre_convenio LIKE '%/ SUBSIDIADO') AS con_slash,
      SUM(nombre_convenio LIKE '% SUBSIDIADO') AS con_sub,
      SUM(nombre_convenio LIKE '% CONTRIBUTIVO') AS con_contrib,
      COUNT(DISTINCT nombre_convenio) AS distintos
    FROM costos
""")
row = cur.fetchone()
print(f"  con ' / SUBSIDIADO'        = {row[0]}")
print(f"  con ' SUBSIDIADO'          = {row[1]}")
print(f"  con ' CONTRIBUTIVO'        = {row[2]}")
print(f"  distintos                  = {row[3]}")

print("\n=== Validar matching JSON: nombre_convenio en NT que SI existen en costos ===")
cur.execute("""
    WITH nt_norm AS (
        SELECT DISTINCT
          CASE WHEN convenio LIKE '%/ SUBSIDIADO'
               THEN REPLACE(convenio,' / SUBSIDIADO','')
               ELSE convenio END AS nc
        FROM notas_tecnicas
        UNION
        SELECT DISTINCT
          REPLACE(REPLACE(convenio,' / SUBSIDIADO',''),' CONTRIBUTIVO',' SUBSIDIADO') AS nc
        FROM notas_tecnicas
        WHERE convenio LIKE '%/ SUBSIDIADO'
    )
    SELECT
      (SELECT COUNT(*) FROM nt_norm) AS nt_distintos,
      (SELECT COUNT(*) FROM nt_norm WHERE nc IN (SELECT DISTINCT nombre_convenio FROM costos)) AS matched_costos
""")
print(cur.fetchone())

con.close()
