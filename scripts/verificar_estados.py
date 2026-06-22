"""Verifica valores reales en estado_consulta para resolver discrepancia D4."""
import pymysql

con = pymysql.connect(
    host="localhost", user="root", password="S.O.A.D",
    database="citas_db", port=3306, charset="utf8mb4",
)
cur = con.cursor()

print("=== Valores distintos en estado_consulta ===")
cur.execute("""
    SELECT COALESCE(estado_consulta,'<NULL>') AS estado, COUNT(*) AS n
    FROM costos
    GROUP BY estado_consulta
    ORDER BY n DESC
""")
total = 0
for estado, n in cur.fetchall():
    print(f"  {estado:30s} {n:>10,}")
    total += n
print(f"  {'TOTAL':30s} {total:>10,}")

print("\n=== Cruce: estado_consulta vs proceso_cita / estado_autorizacion ===")
cur.execute("""
    SELECT
      COUNT(*) AS total,
      SUM(estado_consulta IS NULL) AS n_estado_null,
      SUM(estado_consulta IS NOT NULL) AS n_estado_not_null,
      SUM(estado_consulta = 'CUMPLIDA') AS n_cumplida,
      SUM(estado_consulta = 'INCUMPLIDA') AS n_incumplida,
      SUM(estado_consulta = 'INASISTIO') AS n_inasistio,
      SUM(estado_consulta = 'CANCELADA') AS n_cancelada
    FROM costos
""")
row = cur.fetchone()
print(f"  total                  = {row[0]:>10,}")
print(f"  estado IS NULL         = {row[1]:>10,}")
print(f"  estado IS NOT NULL     = {row[2]:>10,}")
print(f"  CUMPLIDA               = {row[3]:>10,}")
print(f"  INCUMPLIDA             = {row[4]:>10,}")
print(f"  INASISTIO              = {row[5]:>10,}")
print(f"  CANCELADA              = {row[6]:>10,}")

con.close()
