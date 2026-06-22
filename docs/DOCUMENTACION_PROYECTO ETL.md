# Documentación del Proyecto — Base de Datos CITAS

**Cliente:** NORDVITAL IPS
**Versión:** 2.1
**Fecha:** 10 de junio de 2026
**Motor:** MySQL 8.4
**Esquema:** `citas_db`

> Esta es la documentación **vigente** del proyecto. El flujo v1 (Excel mensual manual con `03_load_raw.py` / `05_carga_diaria.py`) fue reemplazado por el pipeline automatizado descrito aquí.

---

## 1. Contexto del proyecto

### 1.1 Problema a resolver

NORDVITAL IPS gestiona citas médicas a través de **tres sistemas distintos**:

- **PLENUS** — Sistema clínico principal (CSV TAB)
- **PANA** — Sistema secundario (CSV `;` o XLSX legado)
- **SAP** — Sistema administrativo (XLSX por sede)

Cada sistema entrega datos en su propio formato, columnas y nomenclatura. El objetivo es **consolidar las tres fuentes** en una única tabla normalizada (`costos`) con códigos CUPS homologados, lista para reportería y subida al servidor productivo.

### 1.2 Evolución del proyecto

| Versión | Fecha | Flujo |
|---|---|---|
| 1.0 | 11 may 2026 | Excel mensual manual con VLOOKUPs (`Citas PLENUS.xlsx` / `PANA.xlsx` / `SAP.xlsx`) → BD vía `03_load_raw.py` |
| 2.0 | 28 may 2026 | **Pipeline automatizado**: bots de descarga → maestros `Raw_*` → BD con homologación CUPS |
| 2.1 | 10 jun 2026 | + Agrupador de convenios para reportería (`cat_convenio_agrupador`) + soporte `break_*.csv` para PANA + regla NORDVITAL→NUEVA EPS |

### 1.3 Solución vigente

Pipeline diario:

1. **Bots Playwright** descargan los reportes desde PLENUS, PANA y SAP a `data/descarga_diaria/`.
2. **`01_carga_diaria_csv.py`** anexa esos archivos a los maestros planos `Raw_*` (preserva histórico).
3. **`03_carga_diaria_DB.py`** lee los maestros, recarga la BD (RAW + costos).

Una sola vez por entorno:

- **`00_init_db.py`** crea la BD y la deja lista.
- **`02_cargar_cups.py`** carga los catálogos de CUPS desde CSV (se re-ejecuta cuando se actualicen los homologados).

---

## 2. Arquitectura

### 2.1 Diagrama general

```
┌────────────────────────────────────────────────────────────────────┐
│  BOTS DE DESCARGA (Playwright)                                     │
│  Citas_PLENUS.py  |  Citas_PANA.py  |  Citas_SAP.py                │
└────────────────────────────────┬───────────────────────────────────┘
                                 │  descargas .csv / .xlsx
                                 ▼
                  data/descarga_diaria/
                                 │
                       py 01_carga_diaria_csv.py  (append incremental)
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │ MAESTROS PLANOS (historico acumulado)             │
        │   data/Raw_PLENUS.csv   (TAB)                     │
        │   data/Raw_PANA.csv     (;)                       │
        │   data/Raw_SAP.xlsx     (Hoja1)                   │
        └────────────────────────┬─────────────────────────┘
                                 │
                       py 03_carga_diaria_DB.py
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │ TABLAS RAW en MySQL (TRUNCATE + INSERT cada vez)  │
        │   raw_plenus  |  raw_pana  |  raw_sap             │
        └────────────────────────┬─────────────────────────┘
                                 │  JOIN con catalogos
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │ CATALOGOS (estables)                              │
        │  Estables (02_insert_catalogos.sql):              │
        │    cat_regimen / cat_tipo_agenda / cat_tipo_cita  │
        │    cat_estado_cita / cat_sede / cat_convenio      │
        │    cat_convenio_sap / cat_especialidad            │
        │  CUPS homologados (02_cargar_cups.py):            │
        │    cat_cups / cat_cups_pana                       │
        │  Agrupador reporting (02_cargar_convenios.py):    │
        │    cat_convenio_agrupador                         │
        └────────────────────────┬─────────────────────────┘
                                 │  04_insert_costos.sql
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │ TABLA MAESTRA  costos                             │
        │ ~381.000 filas consolidadas                       │
        │ Lista para subir al servidor                      │
        └──────────────────────────────────────────────────┘
```

### 2.2 Resumen de tablas

| Grupo | Tabla | Filas aprox. | Propósito |
|---|---|---:|---|
| Catálogo | `cat_regimen` | 7 | Normaliza tipo de régimen |
| Catálogo | `cat_tipo_agenda` | 5 | Normaliza modalidad de agenda |
| Catálogo | `cat_tipo_cita` | 3 | Normaliza tipo de cita |
| Catálogo | `cat_estado_cita` | 6 | Estado autorización + consulta |
| Catálogo | `cat_sede` | 11 | Normaliza nombre de sede |
| Catálogo | `cat_convenio` | 43 | Convenio para PLENUS/PANA |
| Catálogo | `cat_convenio_sap` | 24 | Convenio SAP por clave compuesta |
| Catálogo | `cat_especialidad` | ~50 | Especialidad ajustada |
| Catálogo CUPS | `cat_cups` | **197** | Código CUPS + nombre homologado (Nordvital) |
| Catálogo CUPS | `cat_cups_pana` | **109** | Mapea PANA (especialidad + control) → CUPS |
| Catálogo agrupador | `cat_convenio_agrupador` | **54** | Mapea `nombre_convenio` → (convenio, sede, modalidad, regimen) para reportería |
| RAW | `raw_plenus` | ~190.000 | Datos crudos PLENUS |
| RAW | `raw_pana` | ~119.000 | Datos crudos PANA |
| RAW | `raw_sap` | ~71.500 | Datos crudos SAP |
| Maestra | `costos` | ~381.000 | Consolidado final con CUPS homologado + agrupador |

Total: **15 tablas**.

---

## 3. Estructura del repositorio

```
automatizacion-costos-vs-nota-tecnica/
├── .env                        ← credenciales MySQL (NO se commitea)
├── .env.example                ← plantilla para copiar
│
├── data/
│   ├── Raw_PLENUS.csv          ← maestro plano PLENUS (sep TAB)
│   ├── Raw_PANA.csv            ← maestro plano PANA (sep ';')
│   ├── Raw_SAP.xlsx            ← maestro PLANO SAP (Hoja1)
│   ├── cat_cups.csv            ← 197 CUPS homologados Nordvital
│   ├── cat_cups_pana.csv       ← 109 mapeos PANA → CUPS
│   ├── cat_convenio.xlsx       ← fuente del agrupador (origen negocio)
│   ├── cat_convenio_agrupador.csv ← 54 filas: nombre_convenio → grupos
│   ├── Códigos CUPS.xlsx       ← fuente original (regenera los CSV de CUPS)
│   ├── Notas tecnicas 2026.xlsx ← fuente notas tecnicas (negocio)
│   ├── notas_tecnicas_2026.csv ← CSV plano derivado del xlsx
│   ├── raw_backup/             ← (gitignored) snapshots manuales de Raw_*
│   └── descarga_diaria/
│       ├── (archivos del día pendientes)
│       └── procesados/         ← (gitignored) histórico con timestamp tras carga
│
├── python/
│   ├── 00_init_db.py           ← una vez: crea BD + tablas + catálogos
│   ├── 01_carga_diaria_csv.py  ← diario: descargas → Raw_*
│   ├── 02_cargar_cups.py       ← esporádico: actualiza CUPS homologados
│   ├── 02_cargar_convenios.py  ← esporadico: actualiza agrupador de convenios
│   ├── 03_carga_diaria_DB.py   ← diario: Raw_* → MySQL + costos
│   ├── Citas_PLENUS.py         ← bot Playwright PLENUS
│   ├── Citas_PANA.py           ← bot Playwright PANA
│   ├── Citas_SAP.py            ← bot pyautogui SAP
│   ├── tools/
│   │   ├── convertir_cat_convenio.py  ← xlsx → cat_convenio_agrupador.csv
│   │   ├── convertir_notas_tecnicas.py
│   │   └── migrar_agrupador.py        ← aplica el agrupador a BD existente (no-destructivo)
│   └── .venv/                  ← entorno virtual del proyecto
│
├── sql/
│   ├── 01_create_tables.sql    ← DDL (15 tablas)
│   ├── 02_insert_catalogos.sql ← catálogos estables (sin cat_cups ni agrupador)
│   └── 04_insert_costos.sql    ← reconstruye costos desde RAW + catálogos
│
├── logs/                              ← (gitignored)
│   ├── log_carga_diaria.txt        ← logs de 03_carga_diaria_DB.py
│   └── log_carga_diaria_append.txt ← logs de 01_carga_diaria_csv.py
│
└── docs/
    ├── DOCUMENTACION_PROYECTO.md     ← este archivo (vigente)
    ├── Plan_Montaje_BD_Citas.csv     ← cronograma histórico (fase 1)
    └── diagramas/                    ← drawio v1 por fuente (referencia)
```

---

## 4. Despliegue inicial (primera vez)

### 4.1 Requisitos

- Windows 10/11
- MySQL 8.4 instalado y servicio activo
- Python 3.10+ con `venv`

### 4.2 Pasos

**1. Clonar el repo y crear el entorno virtual:**

```powershell
cd python
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install pandas openpyxl sqlalchemy pymysql python-dotenv playwright
playwright install chromium
cd ..
```

**2. Crear el archivo `.env` con la contraseña real de MySQL:**

```powershell
Copy-Item .env.example .env
notepad .env   # editar DB_PASS
```

**3. Inicializar la base de datos:**

```powershell
py python\00_init_db.py
```

Esto:
- Crea `citas_db` si no existe.
- Ejecuta `01_create_tables.sql` → 15 tablas vacías.
- Ejecuta `02_insert_catalogos.sql` → catálogos estables.
- Ejecuta `02_cargar_cups.py` → `cat_cups` (197 filas) y `cat_cups_pana` (109 filas).
- Ejecuta `02_cargar_convenios.py` → `cat_convenio_agrupador` (53 filas).

**4. Cargar los maestros a MySQL:**

```powershell
py python\03_carga_diaria_DB.py
```

Esto puebla `raw_plenus`, `raw_pana`, `raw_sap` y reconstruye `costos`.

---

## 5. Operación recurrente

### 5.1 Flujo diario

```powershell
# 1. (Opcional) ejecutar bots para traer descargas del día
py python\Citas_PLENUS.py
py python\Citas_PANA.py
py python\Citas_SAP.py
# las descargas quedan en data/descarga_diaria/

# 2. Anexar las descargas a los maestros Raw_*
py python\01_carga_diaria_csv.py
# los archivos procesados se mueven a data/descarga_diaria/procesados/<timestamp>/

# 3. Recargar la BD (RAW + costos)
py python\03_carga_diaria_DB.py
```

### 5.2 Actualizar CUPS homologados

Cuando el equipo entregue una versión nueva de `Códigos CUPS.xlsx`:

```powershell
# 1. Regenerar los CSV desde el xlsx (script ad-hoc, o manual con pandas)
# 2. Recargar el catálogo
py python\02_cargar_cups.py
# 3. Recalcular costos para que tome los nuevos homologados
py python\03_carga_diaria_DB.py --solo-costos
```

### 5.3 Modos parciales de `03_carga_diaria_DB.py`

```powershell
py 03_carga_diaria_DB.py                # todo
py 03_carga_diaria_DB.py --solo-raw     # solo RAW, no toca costos
py 03_carga_diaria_DB.py --solo-costos  # solo reconstruir costos
py 03_carga_diaria_DB.py plenus pana    # solo fuentes específicas
```

### 5.4 Modos parciales de `01_carga_diaria_csv.py`

```powershell
py 01_carga_diaria_csv.py               # procesa las 3 fuentes
py 01_carga_diaria_csv.py --solo pana   # solo PANA (o plenus / sap)
py 01_carga_diaria_csv.py --dry-run     # reporta sin escribir ni mover
```

---

## 6. Diccionario de datos — Tabla `costos`

| # | Columna | Tipo | Descripción |
|---|---|---|---|
| 1 | `id` | BIGINT | PK autoincremental |
| 2 | `fuente` | VARCHAR(10) | PLENUS, PANA o SAP |
| 3 | `codigo_origen` | VARCHAR(30) | ID natural del sistema fuente |
| 4 | `fecha_cita` | DATE | Fecha de la cita |
| 5 | `hora_cita` | TIME | Hora de la cita |
| 6 | `fecha_deseada` | DATE | Fecha solicitada por el paciente |
| 7 | `fecha_asig` | DATE | Fecha de asignación |
| 8 | `tipo_documento` | VARCHAR(20) | CC, CE, TI, etc. |
| 9 | `identificacion` | VARCHAR(30) | Documento del paciente |
| 10 | `nombre` | VARCHAR(255) | Nombre del paciente |
| 11 | `sexo` | CHAR(1) | F o M |
| 12 | `idsoft_medico` | VARCHAR(30) | ID del sistema del médico |
| 13 | `id_medico` | VARCHAR(30) | Identificación del médico |
| 14 | `nombre_medico` | VARCHAR(255) | Nombre del médico |
| 15 | `especialidad` | VARCHAR(500) | Especialidad médica |
| 16 | `pym` | VARCHAR(255) | **Programa P&M homologado** (de `cat_cups.homologado` / `cat_cups_pana.homologado`) |
| 17 | `procedimiento_especifico` | VARCHAR(500) | Procedimiento detallado |
| 18 | `grupo` | VARCHAR(150) | Grupo funcional |
| 19 | `cie10_dxppal` | VARCHAR(20) | Diagnóstico principal CIE-10 |
| 20 | `tipo_cita` | VARCHAR(50) | CONTROL o PRIMERA VEZ |
| 21 | `valor_recuperacion` | DECIMAL(18,2) | Cuota de recuperación |
| 22 | `costo_servicio` | DECIMAL(18,2) | Costo del servicio |
| 23 | `funcionalidad` | VARCHAR(50) | CONSULTA o PROCEDIMIENTO |
| 24 | `tipo_agenda` | VARCHAR(50) | PRESENCIAL / TELEMEDICINA / TELESALUD |
| 25 | `estado_autorizacion` | VARCHAR(100) | Estado de autorización |
| 26 | `estado_consulta` | VARCHAR(50) | CUMPLIDA / INCUMPLIDA / CANCELADA |
| 27 | `nombre_usuario_asignacion` | VARCHAR(255) | Usuario que asignó la cita |
| 28 | `proceso_cita` | VARCHAR(50) | AUTOGESTION o GESTION LF |
| 29 | `nombre_convenio` | VARCHAR(300) | Convenio/EPS |
| 30 | `regimen` | VARCHAR(50) | CONTRIBUTIVO / SUBSIDIADO / PARTICULAR |
| 31 | `nombre_sede` | VARCHAR(150) | Sede normalizada |
| 32 | `cups` | VARCHAR(20) | **Código CUPS** (en PANA se deriva vía `cat_cups_pana`) |
| 33 | `tipo_servicio` | VARCHAR(50) | PGP / EVENTO / CAPITA / PARTICULAR |
| 34 | `grupo_especialidad` | VARCHAR(150) | Grupo de especialidad |
| 35 | `nombre_mpio` | VARCHAR(100) | Municipio |
| 36 | `entidad_administradora` | VARCHAR(150) | EPS responsable |
| 37 | `convenio_grupo` | VARCHAR(50) | **Agrupador** del convenio (ej. COMPENSAR, FAMISANAR) — desde `cat_convenio_agrupador` |
| 38 | `sede_grupo` | VARCHAR(50) | **Agrupador** de sede (CAJICA, CHIA, GENERAL, etc.) |
| 39 | `modalidad` | VARCHAR(50) | **Agrupador** modalidad contractual (PGP, EVENTO, CAPITA, PLAN COMPLEMENTARIO, etc.) |
| 40 | `regimen_grupo` | VARCHAR(20) | **Agrupador** régimen según negocio (CONTRIBUTIVO/SUBSIDIADO/NULL) |
| 41 | `fecha_carga` | DATETIME | Timestamp de inserción (auditoría) |

---

## 7. Reglas de transformación (RAW → costos)

### 7.1 PLENUS — `04_insert_costos.sql`, bloque 1

| Columna costos | Regla |
|---|---|
| `tipo_cita` | VLOOKUP a `cat_tipo_cita` (default CONTROL) |
| `tipo_agenda` | VLOOKUP a `cat_tipo_agenda` |
| `estado_autorizacion` + `estado_consulta` | VLOOKUP a `cat_estado_cita` |
| `regimen` | VLOOKUP a `cat_regimen` |
| `nombre_sede` | VLOOKUP a `cat_sede` |
| `nombre_convenio` + `tipo_servicio` + `nombre_mpio` + `entidad_administradora` | VLOOKUP a `cat_convenio` |
| `funcionalidad` | IF `funcionalidad=CONSULTA` → CONSULTA, else PROCEDIMIENTO |
| `proceso_cita` | IF `nombre_usuario=nombre_medico` → AUTOGESTION, else GESTION LF |
| **`cups`** | TRIM(`codigocups`) |
| **`pym`** | COALESCE(`cat_cups.homologado` por `codigocups`, `raw.pym`) |

### 7.2 PANA — `04_insert_costos.sql`, bloque 2

| Columna costos | Regla |
|---|---|
| `fecha_cita` / `hora_cita` | DATE() y TIME() de `fecha_cita` (campo único en RAW) |
| `sexo` | IF `Femenino` → F, else M |
| `tipo_cita` | IF `control='X'` → CONTROL, else PRIMERA VEZ |
| `funcionalidad` | IF `especialidad` vacía → PROCEDIMIENTO, else CONSULTA |
| `tipo_agenda` | VLOOKUP a `cat_tipo_agenda` |
| `nombre_convenio` + datos | VLOOKUP a `cat_convenio` por `nombre_cnt` |
| **`nombre_convenio`** (regla especial) | Si `nombre_cnt='NORDVITAL IPS SAS'` → `NUEVA EPS PGP CONTRIBUTIVO`/`SUBSIDIADO` según `plan_cnt` (PANA reporta la IPS como contratante, no la EPS real) |
| **`cups`** | `cat_cups_pana.codigo` (JOIN por `especialidad_cita` + `control`) |
| **`pym`** | COALESCE(`cat_cups_pana.homologado`, regla CASE legacy) |

### 7.3 SAP — `04_insert_costos.sql`, bloque 3

| Columna costos | Regla |
|---|---|
| `fecha_deseada` | COALESCE(`fecha_deseada`, `fecha_inicio`) |
| `sexo` | IF `FEMENINO` → F, else M |
| `especialidad` | CONCAT(`texto_prestacion1` + 2 + 3) limpiando '#' |
| **`cups`** | SUBSTRING(`prestacion`, 9, 8) |
| `tipo_cita` | SUBSTRING(`prestacion`, 9, 4): 8902=PRIMERA VEZ, 8903=CONTROL |
| `funcionalidad` | Si CUPS empieza por 8902/8903 → CONSULTA, else PROCEDIMIENTO |
| `tipo_agenda` | Valor fijo PRESENCIAL |
| `estado_autorizacion` | Valor fijo AUTORIZADO |
| `nombre_convenio` + datos | VLOOKUP a `cat_convenio_sap` por **clave compuesta** (sede + cod_aseguradora + interlocutor) |
| **`pym`** | `cat_cups.homologado` (JOIN por código extraído) |

### 7.4 grupo_especialidad — `04_insert_costos.sql`, bloque 4

`UPDATE costos SET grupo_especialidad = CASE ... END` clasifica la
`especialidad` (texto libre) en 7 grupos mediante patrones `LIKE`. **El orden
importa**: lo específico (odontología, diagnóstico, procedimiento) se evalúa
antes que lo general/médico para evitar clasificaciones erróneas (p. ej.
«ECOGRAFIA» no debe caer en MED. ESPECIALIZADA).

| Orden | Grupo | Patrones representativos |
|---|---|---|
| 1 | `ODONTOLOGIA` | ODONTOLOG%, ENDODONCIA, EXODONCIA, HIGIENE ORAL, CIRUGIA MAXILOFACIAL |
| 2 | `AP. DIAGNOSTICO` | ECOGRAFIA%, RADIOLOG%, MAMOGRAFIA, NASOLARINGOSCOPIA, IMAGENES DIAGNOSTICAS |
| 3 | `PROCEDIMIENTO MENOR` | RESECCION, BIOPSIA, INFILTRACION, CURACION, INYECCION, RETIRO SUTURA, ANTICONCEPTIVOS SUBDERMICOS |
| 4 | `AP. TERAPEUTICO` | FISIOTERAPIA%, TERAPIA OCUPACIONAL, FONOAUDIOLOG%, OPTOMETRIA, NUTRICION, PSICOLOGIA, TRABAJO SOCIAL |
| 5 | `ENFERMERIA Y PYP` | AUXILIAR ENFERMERIA, ENFERMERIA, EDUCACION, ATENCION INTEGRAL, PLANIFICACION, CITOLOGIA, LACTANCIA |
| 6 | `MED. GENERAL` | MEDICINA GENERAL |
| 7 | `MED. ESPECIALIZADA` | PEDIATRIA, MEDICINA INTERNA, GINECOLOGIA, CARDIOLOGIA, DERMATOLOGIA, CIRUGIA%, MEDICINA FAMILIAR, ... |
| — | `OTROS` | cualquier especialidad no clasificada (residual) |
| — | `NULL` | citas sin especialidad (procedimientos) |

### 7.5 nombre_sede — `04_insert_costos.sql`, bloque 5

`UPDATE costos ... SET nombre_sede` unifica las subsedes de Cúcuta (que llegan
con nombres dispares según el sistema) a una forma canónica `SEDE 01`–`SEDE 07`.
Esto habilita el filtro jerárquico **Ciudad → Sede** en los dashboards.

| `nombre_sede` crudo | → normalizado |
|---|---|
| `NORDVITAL IPS SEDE 3` / `3E` / `SEDE 3` | `NORDVITAL IPS - SEDE 03` |
| `NORDVITAL IPS CALLE 15` | `NORDVITAL IPS - SEDE 04` |
| `NORDVITAL IPS CL 14` | `NORDVITAL IPS - SEDE 06` |
| `NORDVITAL CALLE 8 CUCUTA` / `NORDVITAL IPS SAS` | `NORDVITAL IPS - SEDE 07` |
| `UBA VIHONCO SEDE 2 CALLE 9 CONTRIBUTIVO` | `NORDVITAL IPS - SEDE SIN ESPECIFICAR` |

> Las sedes de las demás ciudades (CAJICA, CHIA, LA MESA, UBATE, LA CALERA) no
> se tocan: son únicas y homónimas de su ciudad.

---

## 8. Catálogos CUPS (homologación)

### 8.1 Origen

`data/Códigos CUPS.xlsx` contiene 3 hojas; usamos 2:

- **`CUPS Nordvital`** → 197 códigos con `Codigo`, `Descripcion`, `Homologado` (nombre para filtros).
- **`CUPS PANA`** → 109 filas con `Codigo`, `Homologado`, `especialidad_cita`, `control` (X=control / vacío=primera vez).

### 8.2 CSVs versionados

- `data/cat_cups.csv` — 3 columnas: `codigo;descripcion;homologado`
- `data/cat_cups_pana.csv` — 4 columnas: `especialidad_cita;es_control;codigo;homologado` (donde `es_control` = `S` o `N`)

### 8.3 Carga

`py python\02_cargar_cups.py` hace TRUNCATE + INSERT idempotente desde los CSVs.

### 8.4 Cobertura actual

| Fuente | Cobertura `cups` | Cobertura `pym` (homologado) |
|---|---:|---:|
| PLENUS | 99.99% | 99.99% |
| PANA | 95.4% | 96.9% |
| SAP | 100% | 63% (resto son procedimientos no consultas) |

---

## 8b. Catálogo agrupador de convenios (reportería)

### 8b.1 Origen y propósito

`data/cat_convenio.xlsx` → `data/cat_convenio_agrupador.csv` (54 filas) → tabla `cat_convenio_agrupador`.

Mapea cada `nombre_convenio` (PLENUS / PANA / SAP) a 4 dimensiones cortas usadas en reportería:

| Columna | Ejemplo |
|---|---|
| `convenio` | COMPENSAR, FAMISANAR, COOSALUD, NUEVA EPS, PARTICULAR... |
| `sede` | CAJICA, CHIA, LA MESA, GENERAL, FERROCARRILES... |
| `modalidad` | PGP, EVENTO, CAPITA, PLAN COMPLEMENTARIO, PARTICULAR... |
| `regimen` | CONTRIBUTIVO, SUBSIDIADO o NULL |

Estas 4 columnas se copian a `costos` como `convenio_grupo`, `sede_grupo`, `modalidad`, `regimen_grupo` vía LEFT JOIN en `04_insert_costos.sql` (en los 3 bloques).

### 8b.2 Carga

```powershell
py python\02_cargar_convenios.py          # TRUNCATE + INSERT desde el CSV
py python\03_carga_diaria_DB.py --solo-costos  # propaga a costos
```

### 8b.3 Mantenimiento

Cuando negocio entregue una versión actualizada de `cat_convenio.xlsx`:

```powershell
py python\tools\convertir_cat_convenio.py   # regenera el CSV desde el xlsx
py python\02_cargar_convenios.py
py python\03_carga_diaria_DB.py --solo-costos
```

### 8b.4 Migración a una BD existente (no-destructiva)

Si la BD ya estaba operando antes de este cambio, usa:

```powershell
py python\tools\migrar_agrupador.py
```

Esto: 1) CREATE TABLE IF NOT EXISTS de `cat_convenio_agrupador`, 2) ALTER TABLE costos ADD COLUMN de las 4 columnas (idempotente), 3) carga del CSV, 4) reconstrucción de costos.

### 8b.5 Cobertura actual

| Fuente | Filas | Con `convenio_grupo` |
|---|---:|---:|
| PLENUS | 190.363 | 190.346 (99.99%) |
| PANA | 119.364 | 119.364 (100%) |
| SAP | 71.543 | 71.516 (99.96%) |
| **TOTAL** | **381.270** | **381.226 (99.99%)** |

### 8b.6 Regla especial PANA: NORDVITAL IPS SAS → NUEVA EPS

En `raw_pana`, el campo `nombre_cnt` viene siempre como `NORDVITAL IPS SAS` (la IPS contratista, no el convenio comercial). Por confirmación de negocio, **todas esas filas son realmente del convenio NUEVA EPS PGP**, con el régimen definido por `plan_cnt`.

Esta regla se aplica directamente en el bloque PANA de `04_insert_costos.sql`:

```sql
COALESCE(cv.nombre_convenio,
         CASE
             WHEN p.nombre_cnt = 'NORDVITAL IPS SAS' AND p.plan_cnt = 'CONTRIBUTIVO' THEN 'NUEVA EPS PGP CONTRIBUTIVO'
             WHEN p.nombre_cnt = 'NORDVITAL IPS SAS' AND p.plan_cnt = 'SUBSIDIADO'   THEN 'NUEVA EPS PGP SUBSIDIADO'
             ELSE p.nombre_cnt
         END)
```

Resultado: las ~119k filas PANA quedan distribuidas en NUEVA EPS PGP CONTRIBUTIVO (~100k) y NUEVA EPS PGP SUBSIDIADO (~19k), y consolidan correctamente con las ~44k filas NUEVA EPS de PLENUS (total NUEVA EPS ≈ 163.670).

---

## 8c. Formatos del archivo de PANA (XLSX y CSV)

Desde junio 2026 el bot de PANA entrega los reportes diarios en **CSV** (antes XLSX). El pipeline soporta ambos formatos de forma transparente.

### 8c.1 Detección y parser

`01_carga_diaria_csv.py` busca en `data/descarga_diaria/` los patrones `break_*.xlsx` **y** `break_*.csv`. La función `_leer_pana_archivo()` elige el parser por extensión:

| Extensión | Parser | Particularidad |
|---|---|---|
| `.xlsx` (legado) | `pd.read_excel` | Salta 6 filas de metadata (`skiprows=6`), header en fila 7 |
| `.csv` (nuevo)  | `pd.read_csv` `sep=';'` | Header en línea 1, encoding `utf-8-sig` con fallback a `latin-1` |

### 8c.2 Normalización de fechas ISO → dd/mm/yyyy

El CSV trae las fechas en formato ISO (`2026-06-05 09:00:00` o con microsegundos `2026-05-22 10:23:33.517905`). El maestro `Raw_PANA.csv` está en formato dd/mm/yyyy desde su origen XLSX. Para mantener el invariante "el maestro tiene un solo formato", `_normalizar_fechas_iso()` convierte las celdas ISO a `dd/mm/yyyy HH:MM:SS` antes de anexar.

Se aplica a las 7 columnas datetime de PANA:
`fecha_cita`, `cita_mas_proxima`, `fecha_deseada`, `fecha_asig`, `fecha_atencion`, `fecha_cumplimiento`, `fecha_atencion_proc`.

Usa `pd.to_datetime(..., format="ISO8601")` para aceptar valores con y sin microsegundos en la misma columna.

### 8c.3 Mezcla de formatos legado + nuevo en el maestro

Tras el cambio, el maestro `Raw_PANA.csv` puede contener filas con formato:

- Legado XLSX: `2/01/2026 10:30` (sin segundos, días/meses sin padding)
- Nuevo CSV:   `28/05/2026 14:40:00` (con segundos, padding)

En `03_carga_diaria_DB.py` la función `to_datetime_safe()` usa `format="mixed"` para parsear cada celda individualmente. Sin este parámetro, pandas infería el formato sobre las primeras filas (legado, sin segundos) y descartaba las nuevas → 22.839 filas se perdían silenciosamente con `NaT`.

### 8c.4 Migración del maestro existente

Si por alguna razón el maestro quedó con celdas ISO mezcladas (por ejemplo, una corrida que usó el código viejo antes del fix), se puede limpiar con un script ad-hoc que use `_normalizar_fechas_iso` y reescriba el CSV. Siempre **backup defensivo primero** a `data/raw_backup/Raw_PANA.<timestamp>.preisofix.csv`.

---

## 9. Mantenimiento de catálogos

### 9.1 Detección de huecos

```sql
-- Convenios PLENUS sin match
SELECT DISTINCT p.convenionombre, COUNT(*) AS citas
FROM raw_plenus p
LEFT JOIN cat_convenio cv ON cv.nombre_convenio = p.convenionombre
WHERE cv.id IS NULL AND p.convenionombre IS NOT NULL
GROUP BY p.convenionombre ORDER BY citas DESC;

-- Sedes PLENUS sin match
SELECT DISTINCT p.nombresede, COUNT(*) AS citas
FROM raw_plenus p
LEFT JOIN cat_sede sd ON sd.raw = p.nombresede
WHERE sd.id IS NULL GROUP BY p.nombresede ORDER BY citas DESC;

-- Convenios PANA sin match
SELECT DISTINCT p.nombre_cnt, COUNT(*) AS citas
FROM raw_pana p
LEFT JOIN cat_convenio cv ON cv.nombre_convenio = p.nombre_cnt
WHERE cv.id IS NULL GROUP BY p.nombre_cnt ORDER BY citas DESC;

-- PANA: especialidades sin match en cat_cups_pana
SELECT DISTINCT p.especialidad_cita, p.control, COUNT(*) AS citas
FROM raw_pana p
LEFT JOIN cat_cups_pana cpp
       ON cpp.especialidad_cita = p.especialidad_cita
      AND cpp.es_control = CASE WHEN p.control='X' THEN 'S' ELSE 'N' END
WHERE cpp.id IS NULL AND p.especialidad_cita IS NOT NULL
GROUP BY p.especialidad_cita, p.control ORDER BY citas DESC;

-- SAP: combinaciones (sede + aseguradora + interlocutor) sin match
SELECT DISTINCT s.sede_uo, s.cod_aseguradora, s.interlocutor_comercial,
       COUNT(*) AS citas
FROM raw_sap s
LEFT JOIN cat_convenio_sap cv
       ON cv.sede_uo = s.sede_uo
      AND cv.cod_aseguradora = s.cod_aseguradora
      AND cv.interlocutor_comercial = s.interlocutor_comercial
WHERE cv.id IS NULL
GROUP BY 1,2,3 ORDER BY citas DESC;
```

### 9.2 Corrección

- **Catálogos estables** → editar `02_insert_catalogos.sql`, ejecutar el bloque INSERT correspondiente, y luego `py 03_carga_diaria_DB.py --solo-costos`.
- **CUPS** → editar el CSV (`data/cat_cups.csv` o `data/cat_cups_pana.csv`), ejecutar `py 02_cargar_cups.py`, luego `py 03_carga_diaria_DB.py --solo-costos`.

---

## 10. Consultas de validación

### 10.1 Conteos generales

```sql
SELECT COUNT(*) FROM raw_plenus;
SELECT COUNT(*) FROM raw_pana;
SELECT COUNT(*) FROM raw_sap;
SELECT COUNT(*) FROM costos;
SELECT fuente, COUNT(*) FROM costos GROUP BY fuente WITH ROLLUP;
```

### 10.2 Rango de fechas cubierto

```sql
SELECT fuente, MIN(fecha_cita) AS desde, MAX(fecha_cita) AS hasta
FROM costos GROUP BY fuente;
```

### 10.3 NULLs en columnas clave

```sql
SELECT fuente,
       SUM(nombre_convenio IS NULL) AS sin_convenio,
       SUM(nombre_sede     IS NULL) AS sin_sede,
       SUM(regimen         IS NULL) AS sin_regimen,
       SUM(pym             IS NULL) AS sin_pym,
       SUM(cups            IS NULL) AS sin_cups
FROM costos GROUP BY fuente;
```

### 10.4 Top homologados (verificar acentos correctos)

```sql
SELECT pym, COUNT(*) n FROM costos
WHERE pym IS NOT NULL
GROUP BY pym ORDER BY n DESC LIMIT 15;
```

### 10.5 Verificar acumulado tras un append

```sql
-- Filas RAW sin fecha (las que se descartan al construir costos)
SELECT COUNT(*) FROM raw_plenus WHERE fechacita    IS NULL;
SELECT COUNT(*) FROM raw_pana   WHERE fecha_cita   IS NULL;
SELECT COUNT(*) FROM raw_sap    WHERE fecha_inicio IS NULL;
```

---

## 11. Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `Access denied for user 'root'` | `.env` falta o `DB_PASS` vacío | `Copy-Item .env.example .env` y editar `DB_PASS` |
| `Unknown database 'citas_db'` | BD no inicializada | `py 00_init_db.py` |
| `Table 'cat_cups_pana' doesn't exist` | BD inicializada con DDL viejo | Re-ejecutar `py 00_init_db.py` (advertencia: borra todo) |
| `01_carga_diaria_csv.py` no anexa SAP | Excel maestro abierto en Excel | Cerrar `Raw_SAP.xlsx` y reintentar |
| Fechas PANA fuera de rango en costos | `dayfirst` no aplicado | Ya corregido en v2.0 (per-fuente: PLENUS=ISO, PANA/SAP=dd/mm) |
| `cat_cups` con 80 filas en vez de 197 | `02_cargar_cups.py` no se corrió | `py 02_cargar_cups.py` + `py 03_carga_diaria_DB.py --solo-costos` |
| INSERTs descartados en `04_insert_costos.sql` | Parser SQL antiguo cortaba sentencias con `--` | Ya corregido: se limpian comentarios antes del split |
| Llegó CSV de PANA y `01_carga_diaria_csv.py` lo ignoró | `01` v2.0 solo detectaba `break_*.xlsx` | Ya corregido en v2.1: detecta `break_*.csv` y `break_*.xlsx` (`_leer_pana_archivo`) |
| PANA: muchas filas con `fecha_cita IS NULL` tras cargar | CSV de PANA trae fechas ISO `yyyy-mm-dd`; `dayfirst=True` las invertía | Ya corregido en v2.1: `_normalizar_fechas_iso` convierte ISO → dd/mm/yyyy al anexar |
| PANA: filas con segundos en fecha quedan NaT en `costos` | `pd.to_datetime` infiere formato sobre las primeras filas (sin segundos) y descarta las nuevas (con segundos) | Ya corregido en v2.1: `to_datetime_safe` usa `format="mixed"` |
| Carga 01 corrió 2 veces seguidas → filas duplicadas en `Raw_PLENUS.csv` | `01_carga_diaria_csv.py` no deduplica al hacer append | Recortar las últimas N líneas del maestro (donde N = filas anexadas en la 2ª corrida, ver log); siempre hacer **backup defensivo** primero (`Copy-Item data\Raw_PLENUS.csv data\raw_backup\Raw_PLENUS.<ts>.predup.csv`) |

---

## 12. Backup recomendado

Antes de cualquier operación masiva:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe" -u root -p citas_db > backup_citas_db.sql
```

Restaurar:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p citas_db < backup_citas_db.sql
```

También conviene respaldar los maestros antes de un `01_carga_diaria_csv.py` masivo:

```powershell
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$bk = "data\backups_$ts"
New-Item -ItemType Directory -Force -Path $bk | Out-Null
Copy-Item "data\Raw_PANA.csv","data\Raw_PLENUS.csv","data\Raw_SAP.xlsx" "$bk\"
```

---

## 13. Cambios vs. versión 1.0

| Aspecto | v1.0 | v2.0 / v2.1 |
|---|---|---|
| Fuentes | 3 Excel mensuales descargados manualmente | Bots Playwright que descargan diario |
| Capa intermedia | Ninguna (Excel → MySQL directo) | Maestros planos `Raw_*` con append incremental |
| Script de carga | `03_load_raw.py` (eliminado) + `05_carga_diaria.py` | `01_carga_diaria_csv.py` + `03_carga_diaria_DB.py` |
| Inicialización | Manual vía MySQL Workbench | `py 00_init_db.py` |
| CUPS | 80 filas hardcoded en SQL, sin homologación | 197 + 109 filas desde CSV con `homologado` |
| Agrupador de convenios | No existía | 54 filas `cat_convenio_agrupador` para reporting (v2.1) |
| Formato PANA | XLSX con 6 filas de metadata | XLSX **o** CSV (header en línea 1) — v2.1 |
| Cobertura PANA `cups` | 0% (siempre NULL) | 95.4% |
| Cobertura agrupador | N/A | 99.99% (44 filas sin `nombre_convenio` desde origen) |
| Filas en `costos` | ~88.700 | ~381.000 |

### Bugs históricos corregidos en v2.0

1. **`Logger.close()` doble** en branch de error → `I/O on closed file`.
2. **Parser SQL** descartaba INSERTs precedidos de `-- comentario`.
3. **`dayfirst` global** invertía fechas ISO de PLENUS al activarse para PANA. Solución: por fuente.
4. **Header PLENUS envuelto en comillas** rompía el conteo de columnas. Solución: parser manual del header + limpieza de comillas en valores.
5. **Archivo temporal SAP `.tmp`** rechazado por openpyxl. Solución: usar `Raw_SAP.tmp.xlsx` + `os.replace` atómico.

### Bugs corregidos en v2.1

6. **PANA cambió de XLSX a CSV** y `01_carga_diaria_csv.py` solo detectaba `break_*.xlsx`. Solución: `procesar_pana` busca también `break_*.csv` y `_leer_pana_archivo` decide el parser por extensión.
7. **Fechas PANA en formato ISO** (`yyyy-mm-dd HH:MM:SS[.ffffff]`) del CSV nuevo se invertían con `dayfirst=True` y producían `NaT`. Solución: `_normalizar_fechas_iso` las convierte a `dd/mm/yyyy HH:MM:SS` (formato del maestro) antes de anexar, en las 7 columnas datetime de PANA.
8. **Mezcla de formatos en la misma columna** (legado `d/m/yyyy H:MM` + nuevo `dd/mm/yyyy HH:MM:SS`) hacía que pandas infiriera el formato sobre las primeras filas y descartara las nuevas. Solución: `to_datetime_safe` usa `format="mixed"` para parsear cada celda individualmente.
9. **PANA `nombre_cnt='NORDVITAL IPS SAS'`** es la IPS contratista, no el convenio comercial. Por confirmación de negocio son citas de NUEVA EPS PGP. Solución: regla en `04_insert_costos.sql` bloque PANA que sustituye por `NUEVA EPS PGP CONTRIBUTIVO` o `... SUBSIDIADO` según `plan_cnt`.
10. **Microsegundos en fechas ISO** (`2026-05-22 10:23:33.517905`) hacían que `pd.to_datetime` sin parámetros fallara. Solución: `_normalizar_fechas_iso` usa `format="ISO8601"` que acepta variantes con y sin microsegundos.

---

## 14. Próximos pasos sugeridos

1. **Migrar a servidor productivo** — replicar el esquema en el servidor de la IPS.
2. **Migrar `Raw_SAP.xlsx` a CSV** — para append nativo (hoy requiere reescribir el archivo entero, lento).
3. **Permisos por rol** — usuarios `analista` (solo lectura) y `cargador` (escritura limitada).
4. **Tarea programada** — Task Scheduler para correr `01_carga_diaria_csv.py` + `03_carga_diaria_DB.py` cada noche.
5. **Mantenimiento de catálogos** — proceso para que negocio agregue los huecos detectados en `cat_convenio`, `cat_cups_pana`, etc.
6. **Dashboard** — conectar Power BI o similar a la tabla `costos`.

---

**Fin del documento**
