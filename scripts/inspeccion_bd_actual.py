"""Inspecciona estructura actual de citas_db tras cambios ETL recientes."""
import pymysql

con = pymysql.connect(
    host="localhost", user="root", password="S.O.A.D",
    database="citas_db", port=3306, charset="utf8mb4",
)
cur = con.cursor()

print("=== TABLAS en citas_db ===")
cur.execute("SHOW TABLES")
tables = [r[0] for r in cur.fetchall()]
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM `{t}`")
    n = cur.fetchone()[0]
    print(f"  {t:35s}  {n:>10,}")

print("\n=== Columnas de costos ===")
cur.execute("SHOW COLUMNS FROM costos")
for row in cur.fetchall():
    print(f"  {row[0]:30s} {row[1]}")

print("\n=== Columnas de notas_tecnicas ===")
cur.execute("SHOW COLUMNS FROM notas_tecnicas")
for row in cur.fetchall():
    print(f"  {row[0]:30s} {row[1]}")

# Tablas que potencialmente son nuevas (cat_*, raw_*, filtros, etc.)
nuevas_candidatas = [t for t in tables if t not in ('costos', 'notas_tecnicas', 'nt_map')]
print(f"\n=== Estructura de tablas potencialmente nuevas ({len(nuevas_candidatas)}) ===")
for t in nuevas_candidatas:
    print(f"\n--- {t} ---")
    cur.execute(f"SHOW COLUMNS FROM `{t}`")
    for row in cur.fetchall():
        print(f"  {row[0]:30s} {row[1]}")
    cur.execute(f"SELECT * FROM `{t}` LIMIT 3")
    cols = [c[0] for c in cur.description]
    print(f"  -- muestra (3 filas):")
    for r in cur.fetchall():
        print(f"     {dict(zip(cols, r))}")

con.close()
