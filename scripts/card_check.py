import pymysql
c = pymysql.connect(host='localhost', user='root', password='S.O.A.D',
                    database='citas_db', charset='utf8mb4').cursor()
qs = [
    ('nt_map filas', 'SELECT COUNT(*) FROM nt_map'),
    ('nt_map CUPS distintos', 'SELECT COUNT(DISTINCT cups) FROM nt_map'),
    ('nt_map convenios distintos', 'SELECT COUNT(DISTINCT nombre_convenio) FROM nt_map'),
    ('nt_map (conv,cups) combos', 'SELECT COUNT(*) FROM (SELECT 1 FROM nt_map GROUP BY nombre_convenio,cups) t'),
    ('costos especialidades', "SELECT COUNT(DISTINCT especialidad) FROM costos WHERE especialidad IS NOT NULL AND especialidad<>''"),
    ('costos pym distintos', "SELECT COUNT(DISTINCT pym) FROM costos WHERE pym IS NOT NULL AND pym<>''"),
]
for lbl, s in qs:
    c.execute(s)
    print(f'{lbl:35s} {c.fetchone()[0]}')
