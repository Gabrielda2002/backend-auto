# Reconstrucción manual del workbook `comparacion_dashboards.xlsx`

Este documento es la **receta paso a paso** para recrear el workbook desde cero en Excel **sin usar ningún script ni código**, partiendo únicamente del archivo `citas_db_costos.xlsx` (que contiene `Hoja1` con citas y `citas_db notas_tecnicas` con la nota técnica).

> **Requisito**: Excel 365 o Excel 2021+ (para funciones `UNIQUE`, `SORTBY`, `FILTER`, `XLOOKUP`, `TAKE`, `SEQUENCE`, `TRANSPOSE` con arrays dinámicos).

---

## Índice

1. [Convenciones y paleta de colores](#convenciones)
2. [Hojas de datos](#hojas-de-datos)
   - [data_costos → tblCostos](#hoja-data_costos)
   - [data_nt → tblNT](#hoja-data_nt)
   - [nt_map → tblNTMap (derivada manualmente)](#hoja-nt_map)
3. [Dashboard 1 · Resumen Gerencial](#dashboard-1)
4. [Dashboard 2 · Ejecución vs NT](#dashboard-2)
5. [Dashboard 3 · Análisis Financiero](#dashboard-3)
6. [Dashboard 4 · Calidad y Oportunidad](#dashboard-4)
7. [Dashboard 5 · PyM / RIAS](#dashboard-5)
8. [README (hoja final)](#readme)
9. [Validación final](#validacion)

---

<a name="convenciones"></a>

## 1 · Convenciones y paleta de colores

**Orden de hojas (de izquierda a derecha en las pestañas):**

1. `README`
2. `1 · Resumen Gerencial`
3. `2 · Ejecución vs NT`
4. `3 · Análisis Financiero`
5. `4 · Calidad y Oportunidad`
6. `5 · PyM-RIAS`
7. `data_costos`
8. `data_nt`
9. `nt_map`

**Colores de pestañas** (clic derecho → Color de etiqueta):

| Hoja | Color hex |
|------|-----------|
| README | gris `#888888` |
| Dashboards 1-5 | turquesa `#1F8E8E` |
| `data_costos` | azul marino `#0B3B5E` |
| `data_nt` | turquesa `#1F8E8E` |
| `nt_map` | verde `#2E7D32` |

**Paleta corporativa Nordvital:**

| Nombre | Hex | Uso |
|--------|-----|-----|
| NAVY | `#0B3B5E` | Cabeceras, KPI value, encabezados de sección |
| TURQ | `#1F8E8E` | Acentos, gráficos secundarios |
| GREEN | `#2E7D32` | Bueno (color scale verde) |
| AMBER | `#FBC02D` | Aviso (color scale ámbar) |
| RED | `#D32F2F` | Crítico (color scale rojo) |
| LIGHT | `#F7F9FB` | Fondo KPI card |
| GRID | `#C2C7CF` | Bordes de tablas |

**Formatos numéricos a usar (Formato celdas → Personalizado):**

| Tipo | Formato |
|------|---------|
| Número entero | `#,##0` |
| Porcentaje | `0.0%` |
| Moneda en millones | `"$"#,##0.0,,"M"` (las dos comas dividen entre millón) |
| Días | `0.0" días"` |
| Fecha | `yyyy-mm-dd` |

---

<a name="hojas-de-datos"></a>

## 2 · Hojas de datos

Antes de hacer cualquier dashboard, hay que crear las tres tablas Excel reales (`Tabla1 / Insertar → Tabla` con nombre definido).

<a name="hoja-data_costos"></a>

### 2.1 · Hoja `data_costos` → tabla `tblCostos`

**Paso a paso:**

1. **Crear hoja nueva** llamada `data_costos`. Color pestaña: NAVY.
2. **Copiar la hoja `Hoja1` completa** desde `citas_db_costos.xlsx` (las 344,438 filas, 37 columnas) y pegarla a partir de **A1** (incluye encabezados en fila 1).
3. **Agregar 6 columnas calculadas** después de la columna `fecha_carga` (a partir de la columna **AG**):

   | Col | Encabezado (fila 1) | Fórmula (fila 2, copiar hasta el final) |
   |-----|---------------------|------------------------------------------|
   | AG | `mes_key` | `=TEXT([@fecha_cita],"yyyy-mm")` |
   | AH | `oportunidad_dias` | `=IFERROR([@fecha_cita]-[@fecha_deseada],0)` |
   | AI | `cumplida_flag` | `=IF([@estado_consulta]="CUMPLIDA",1,0)` |
   | AJ | `nt_lookup_key` | `=UPPER(TRIM([@nombre_convenio]))&"|"&UPPER(TRIM([@regimen]))&"|"&TEXT([@cups],"@")` |
   | AK | `nt_costo_unit` | `=IFERROR(XLOOKUP([@nt_lookup_key],tblNTMap[key],tblNTMap[costo_unitario]),0)` |
   | AL | `nt_costo_total` | `=[@cumplida_flag]*[@[nt_costo_unit]]` |

4. **Convertir el rango `A1:AL344439` en tabla Excel:**
   - Selecciona una celda dentro del rango.
   - Cinta: **Insertar → Tabla** (o `Ctrl+T`).
   - Marca **"La tabla tiene encabezados"**.
   - Acepta.
5. **Renombrar la tabla** a `tblCostos`:
   - Selecciona una celda de la tabla.
   - Cinta: **Diseño de tabla → Nombre de tabla**.
   - Escribe `tblCostos` y `Enter`.
6. **Estilo**: Diseño de tabla → Estilos → `Estilo de tabla medio 2`.
7. **Inmovilizar fila 1**: Vista → Inmovilizar paneles → Inmovilizar fila superior.

> Las columnas calculadas (AG–AL) deben aplicarse a **todas las filas** automáticamente al ser tabla Excel — al escribir la fórmula en una celda Excel la propaga.

<a name="hoja-data_nt"></a>

### 2.2 · Hoja `data_nt` → tabla `tblNT`

1. **Crear hoja** `data_nt`. Color: TURQ.
2. **Copiar la hoja `citas_db notas_tecnicas`** desde `citas_db_costos.xlsx` y pegarla a partir de **A1**.

   Encabezados esperados (12 columnas):

   `id | convenio | cups | descripcion | n_eventos_mes | eventos_ano | fu | costo_medio_evento | programa | fecha_de_nt | centro_de_costo | unidad_de_costo`

3. **Convertir en tabla** (`Ctrl+T`). Nombre: `tblNT`. Estilo: `Estilo de tabla medio 4`.
4. **Inmovilizar fila 1**.

<a name="hoja-nt_map"></a>

### 2.3 · Hoja `nt_map` → tabla `tblNTMap` (derivada de `tblNT`)

Esta es una tabla **derivada** que aplica la regla de partir convenios "X / SUBSIDIADO" en dos filas (una CONTRIBUTIVO + una SUBSIDIADO). Como queremos hacerlo manualmente sin scripts, se usa una tabla auxiliar dentro de la misma hoja.

**Paso a paso:**

1. **Crear hoja** `nt_map`. Color: GREEN.
2. **Fila 1**: en `A1:G1` escribe la nota: `tblNTMap — derivado de tblNT por reglas`. Combina celdas. Estilo: relleno NAVY, texto blanco, negrita.
3. **Fila 3 (encabezados):** escribe en `A3:G3`:

   `convenio_base | regimen | cups | costo_unitario | n_eventos_mes | descripcion | key`

4. **Generar las filas derivadas (a partir de A4):**

   Como Excel no tiene un "split de filas" nativo, hay dos opciones:

   **Opción A — Helper en hoja auxiliar (recomendado, 100% fórmulas):**

   En una hoja temporal llamada `nt_helper`:

   - **A1:G1** → mismos encabezados que arriba.
   - **A2 (array dinámico)**:
     ```
     =LET(
       conv, UPPER(TRIM(tblNT[convenio])),
       cup,  TRIM(TEXT(tblNT[cups],"@")),
       costo,tblNT[costo_medio_evento],
       nev,  tblNT[n_eventos_mes],
       desc, tblNT[descripcion],
       term_sub,  RIGHT(conv,13)=" / SUBSIDIADO",
       contains_sub,  ISNUMBER(SEARCH(" SUBSIDIADO",conv)),
       contains_con,  ISNUMBER(SEARCH(" CONTRIBUTIVO",conv)),
       base_split,    TRIM(SUBSTITUTE(conv," / SUBSIDIADO","")),
       base_sub,      TRIM(SUBSTITUTE(conv," SUBSIDIADO","")),
       base_con,      TRIM(SUBSTITUTE(conv," CONTRIBUTIVO","")),
       regimen, IF(term_sub,"CONTRIBUTIVO",
                IF(contains_sub,"SUBSIDIADO",
                IF(contains_con,"CONTRIBUTIVO","CONTRIBUTIVO"))),
       conv_base, IF(term_sub, base_split,
                  IF(contains_sub, base_sub,
                  IF(contains_con, base_con, conv))),
       HSTACK(conv_base, regimen, cup, costo, nev, desc,
              conv_base&"|"&regimen&"|"&cup)
     )
     ```
   - **A_extra (filas adicionales por "X / SUBSIDIADO")**: debajo del resultado anterior, copia las filas que cumplen `term_sub=TRUE` cambiando `regimen` a `"SUBSIDIADO"`. Una fórmula sencilla:
     ```
     =LET(
       mask, RIGHT(UPPER(TRIM(tblNT[convenio])),13)=" / SUBSIDIADO",
       conv, FILTER(UPPER(TRIM(tblNT[convenio])), mask),
       cup,  FILTER(TRIM(TEXT(tblNT[cups],"@")), mask),
       costo,FILTER(tblNT[costo_medio_evento], mask),
       nev,  FILTER(tblNT[n_eventos_mes], mask),
       desc, FILTER(tblNT[descripcion], mask),
       base, TRIM(SUBSTITUTE(conv," / SUBSIDIADO","")),
       HSTACK(base, "SUBSIDIADO", cup, costo, nev, desc,
              base&"|SUBSIDIADO|"&cup)
     )
     ```
   - Selecciona todo el bloque resultante (las dos áreas anteriores), copia y **Pegar especial → Solo valores** en la hoja `nt_map` a partir de `A4`.
   - Elimina la hoja `nt_helper`.
   - Si quedan duplicados por `key`, ordena por `key` y usa **Datos → Quitar duplicados** marcando solo la columna `key`.

   **Opción B — Pegar manualmente desde la fuente:**

   Si tienes la tabla `nt_map` ya generada en otra parte (CSV, MySQL, etc.) pégala como valores en `A4` directamente.

5. **Convertir `A3:G(última fila)` en tabla** (`Ctrl+T`, *Mi tabla tiene encabezados*). Nombre: `tblNTMap`. Estilo: `Estilo de tabla medio 5`.

6. **Inmovilizar primeras 3 filas**: Vista → Inmovilizar paneles → Inmovilizar paneles (con A4 seleccionada).

> Tras este paso, la columna `nt_costo_unit` de `tblCostos` se rellena automáticamente porque su fórmula apunta a `tblNTMap[key]`.

---

<a name="dashboard-1"></a>

## 3 · Dashboard 1 · Resumen Gerencial

**Crear hoja** `1 · Resumen Gerencial`, color TURQ.

### 3.1 · Título y subtítulo

| Celda | Contenido |
|-------|-----------|
| `A1:N1` (combinar) | `Dashboard 1 · Resumen Gerencial` — fuente NAVY 18pt negrita |
| `A2:N2` (combinar) | `KPIs y series calculados con fórmulas sobre tblCostos / tblNTMap. Cero valores pegados.` — itálica gris 9pt |

Altura de fila 1: **28 pt**.

### 3.2 · Banda de sección "KPIs principales"

| Celda | Contenido | Estilo |
|-------|-----------|--------|
| `A4:N4` (combinar) | `  KPIs principales` | Fondo NAVY, texto blanco negrita 11pt |

Altura fila 4: **22 pt**.

### 3.3 · Tarjetas KPI (4 tarjetas + 1 derivada)

Cada KPI ocupa **3 columnas × 3 filas** (etiqueta arriba, valor en medio, leyenda abajo). Altura: etiqueta 22pt, valor 42pt, leyenda 26pt. Fondo `LIGHT` con borde superior TURQ de 2pt, bordes laterales GRID 1pt.

| Posición (combinar) | Etiqueta (fila 6) | Fórmula del valor (fila 7) | Leyenda (fila 8) | Formato |
|---------------------|-------------------|----------------------------|------------------|---------|
| `A6:C8` | CUMPLIMIENTO GLOBAL | `=SUM(tblCostos[cumplida_flag])/ROWS(tblCostos[id])` | `CUMPLIDAS / TOTAL · SUM(cumplida_flag)/ROWS(id)` | porcentaje `0.0%` |
| `D6:F8` | CITAS CUMPLIDAS | `=SUM(tblCostos[cumplida_flag])` | `COUNTIF(estado_consulta="CUMPLIDA")` | entero `#,##0` |
| `G6:I8` | RECUPERACIÓN | `=SUM(tblCostos[valor_recuperacion])` | `SUM(tblCostos[valor_recuperacion])` | moneda M `"$"#,##0.0,,"M"` |
| `J6:L8` | OPORTUNIDAD PROM. | `=AVERAGE(tblCostos[oportunidad_dias])` | `AVERAGE(fecha_cita - fecha_deseada)` | `0.0" días"` |
| `M6` (etiqueta), `M7` (valor), `M8` (leyenda) | CONVENIOS EN RIESGO | `=SUMPRODUCT((COUNTIFS(tblCostos[nombre_convenio],UNIQUE(tblCostos[nombre_convenio]))>100)*((SUMIFS(tblCostos[cumplida_flag],tblCostos[nombre_convenio],UNIQUE(tblCostos[nombre_convenio]))/COUNTIFS(tblCostos[nombre_convenio],UNIQUE(tblCostos[nombre_convenio])))<0.7))` | `<70% cumplim. y >100 citas` | entero |

### 3.4 · Banda "Evolución mensual de citas"

| Celda | Contenido |
|-------|-----------|
| `A11:F11` (combinar) | `  Evolución mensual de citas` — estilo sección NAVY |

**Encabezados de tabla en fila 13** (`A13:F13`, fondo NAVY blanco negrita):

`mes | citas | cumplidas | % cumplim. | recuperación | oportunidad prom.`

**Filas 14-18** (un mes por fila):

| Fila | A | B | C | D | E | F |
|------|---|---|---|---|---|---|
| 14 | `2026-01` | `=COUNTIF(tblCostos[mes_key],$A14)` | `=SUMIFS(tblCostos[cumplida_flag],tblCostos[mes_key],$A14)` | `=IFERROR(C14/B14,0)` | `=SUMIFS(tblCostos[valor_recuperacion],tblCostos[mes_key],$A14)` | `=IFERROR(AVERAGEIFS(tblCostos[oportunidad_dias],tblCostos[mes_key],$A14),0)` |
| 15 | `2026-02` | (mismo, ref `$A15`) | … | … | … | … |
| 16 | `2026-03` | … | … | … | … | … |
| 17 | `2026-04` | … | … | … | … | … |
| 18 | `2026-05` | … | … | … | … | … |

Formato: B/C entero, D porcentaje, E moneda M, F días.

### 3.5 · Gráfico evolución mensual

1. Selecciona `A14:C18`.
2. Cinta: **Insertar → Gráficos → Columna agrupada**.
3. Mueve el gráfico a la celda **H13**, tamaño aprox 580×280 px.
4. Título: `Evolución mensual (fórmulas COUNTIF/SUMIFS)`.
5. Serie 1 ("Citas") → relleno NAVY. Serie 2 ("Cumplidas") → relleno TURQ.
6. Leyenda abajo, gridlines horizontales activadas.

### 3.6 · Banda "Cumplimiento por convenio (top 25)"

| Celda | Contenido |
|-------|-----------|
| `A22:F22` (combinar) | `  Cumplimiento por convenio (top 25 por volumen)` — sección |

**Encabezados fila 24:** `convenio | régimen | citas | cumplidas | % cumplim. | en riesgo`

**Fórmula de array dinámico en `A25` (esparce a A25:B49):**

```
=IFERROR(INDEX(SORTBY(UNIQUE(tblCostos[[nombre_convenio]:[regimen]]),
COUNTIFS(tblCostos[nombre_convenio],INDEX(UNIQUE(tblCostos[[nombre_convenio]:[regimen]]),,1),
tblCostos[regimen],INDEX(UNIQUE(tblCostos[[nombre_convenio]:[regimen]]),,2)),-1),
SEQUENCE(25),{1,2}),"")
```

**Columnas C, D, E, F (filas 25 a 49 — copiar la fórmula hacia abajo):**

| Col | Fórmula en fila 25 (después arrastrar hasta 49) |
|-----|--------------------------------------------------|
| C | `=IF(A25="","",COUNTIFS(tblCostos[nombre_convenio],A25,tblCostos[regimen],B25))` |
| D | `=IF(A25="","",SUMIFS(tblCostos[cumplida_flag],tblCostos[nombre_convenio],A25,tblCostos[regimen],B25))` |
| E | `=IFERROR(D25/C25,0)` |
| F | `=IF(AND(C25>100,E25<0.7),"⚠ RIESGO","")` |

**Formato condicional en `E25:E49`** (color scale 3 colores):

- Inicio → Formato condicional → Escalas de color → Más reglas → Escala 3 colores
- Valor mínimo: número `0` → color RED `#D32F2F`
- Valor medio: número `0.7` → color AMBER `#FBC02D`
- Valor máximo: número `1` → color GREEN `#2E7D32`

### 3.7 · Anchos de columna

| Cols | Ancho |
|------|-------|
| A | 38 |
| B | 14 |
| C, D, E | 12 |
| F | 14 |
| G | 14 |
| M, N | 22 |

---

<a name="dashboard-2"></a>

## 4 · Dashboard 2 · Ejecución vs NT

**Crear hoja** `2 · Ejecución vs NT`, color TURQ.

### 4.1 · Título y subtítulo

| Celda | Contenido |
|-------|-----------|
| `A1:N1` | `Dashboard 2 · Ejecución vs Nota Técnica` |
| `A2:N2` | `KPIs = COUNTIFS/SUMIFS sobre tblCostos joined a tblNTMap via XLOOKUP. Meta = SUM(n_eventos_mes) × 5 meses.` |
| `A4:N4` | sección `  KPI Cumplimiento vs NT` |

### 4.2 · Tarjetas KPI (4 tarjetas, mismo layout que Dashboard 1)

| Posición | Etiqueta | Fórmula | Leyenda | Formato |
|----------|----------|---------|---------|---------|
| `A6:C8` | EJECUTADO | `=SUMPRODUCT((tblCostos[nt_costo_unit]>0)*(tblCostos[cumplida_flag]=1))` | `Citas CUMPLIDAS con NT vigente` | entero |
| `D6:F8` | META PERIODO | `=SUM(tblNTMap[n_eventos_mes])*5` | `SUM(n_eventos_mes) × 5 meses (Ene-May)` | entero |
| `G6:I8` | % CUMPLIMIENTO NT | `=IFERROR(SUMPRODUCT((tblCostos[nt_costo_unit]>0)*(tblCostos[cumplida_flag]=1))/(SUM(tblNTMap[n_eventos_mes])*5),0)` | `Ejecutado / Meta` | porcentaje |
| `J6:L8` | CITAS CON MATCH NT | `=SUMPRODUCT((tblCostos[nt_costo_unit]>0)*1)` | `Citas (todas) emparejadas con NT vigente` | entero |

### 4.3 · Banda "Heatmap Convenio × Top 8 CUPS"

| Celda | Contenido |
|-------|-----------|
| `A11:J11` | sección `  Heatmap Convenio × Top 8 CUPS (% cumplimiento)` |

**Fila 13 (encabezados):**
- `A13` → texto `convenio` (fondo NAVY)
- `B13` (fórmula de array dinámico que esparce a `B13:I13`):

  ```
  =TRANSPOSE(TAKE(SORTBY(UNIQUE(tblCostos[cups]),COUNTIF(tblCostos[cups],UNIQUE(tblCostos[cups])),-1),8))
  ```

**Columna A filas 14:33** — fórmula de array dinámico en `A14` que esparce 20 valores hacia abajo:

```
=TAKE(SORTBY(UNIQUE(tblCostos[nombre_convenio]),COUNTIF(tblCostos[nombre_convenio],UNIQUE(tblCostos[nombre_convenio])),-1),20)
```

**Matriz `B14:I33` (20 filas × 8 columnas)** — escribe esta fórmula en `B14` y copia/pega a toda la matriz:

```
=IFERROR(SUMIFS(tblCostos[cumplida_flag],tblCostos[nombre_convenio],$A14,tblCostos[cups],B$13)/COUNTIFS(tblCostos[nombre_convenio],$A14,tblCostos[cups],B$13),"")
```

> Notar las referencias mixtas: `$A14` fija la columna del convenio y `B$13` fija la fila del CUPS.

**Formato:** porcentaje `0.0%` en toda la matriz.

**Formato condicional en `B14:I33`** (color scale 3 colores):
- Min: número `0` → RED
- Mid: número `0.7` → AMBER
- Max: número `1.2` → GREEN

### 4.4 · Anchos

| Cols | Ancho |
|------|-------|
| A | 38 |
| B-I | 12 |

**Inmovilizar paneles** en la celda `B14` (Vista → Inmovilizar paneles → Inmovilizar paneles).

---

<a name="dashboard-3"></a>

## 5 · Dashboard 3 · Análisis Financiero

**Crear hoja** `3 · Análisis Financiero`, color TURQ.

### 5.1 · Título y subtítulo

| Celda | Contenido |
|-------|-----------|
| `A1:N1` | `Dashboard 3 · Análisis Financiero` |
| `A2:N2` | `Costo real = SUM(tblCostos[nt_costo_total]) — solo citas cumplidas con NT. Esperado = SUMPRODUCT(NTMap.n_eventos × costo) × 5.` |
| `A4:N4` | sección `  KPIs Financieros` |

### 5.2 · Tarjetas KPI

| Posición | Etiqueta | Fórmula | Leyenda | Formato |
|----------|----------|---------|---------|---------|
| `A6:C8` | COSTO REAL EJECUTADO | `=SUM(tblCostos[nt_costo_total])` | `SUM(cumplida_flag × nt_costo_unit)` | moneda M |
| `D6:F8` | COSTO ESPERADO NT | `=SUMPRODUCT(tblNTMap[n_eventos_mes],tblNTMap[costo_unitario])*5` | `meta × costo × 5 meses` | moneda M |
| `G6:I8` | RECUPERACIÓN | `=SUM(tblCostos[valor_recuperacion])` | `SUM(tblCostos[valor_recuperacion])` | moneda M |
| `J6:L8` | % EFICIENCIA | `=IFERROR(SUM(tblCostos[valor_recuperacion])/SUM(tblCostos[nt_costo_total]),0)` | `Recuperación / Costo Real` | porcentaje |

### 5.3 · Banda "Pareto Top 10 CUPS por costo real"

| Celda | Contenido |
|-------|-----------|
| `A11:E11` | sección `  Pareto Top 10 CUPS por costo real` |

**Encabezados fila 13** (`A13:D13`): `cups | citas cumplidas | costo real | % acum`

**`A14` — array dinámico esparce a `A14:A23`:**

```
=TAKE(SORTBY(UNIQUE(tblCostos[cups]),SUMIFS(tblCostos[nt_costo_total],tblCostos[cups],UNIQUE(tblCostos[cups])),-1),10)
```

**Columnas B, C, D filas 14-23 (copiar fórmula hacia abajo):**

| Col | Fórmula en fila 14 |
|-----|--------------------|
| B | `=SUMIFS(tblCostos[cumplida_flag],tblCostos[cups],A14)` |
| C | `=SUMIFS(tblCostos[nt_costo_total],tblCostos[cups],A14)` |
| D | `=IFERROR(SUM($C$14:C14)/SUM(tblCostos[nt_costo_total]),0)` |

> La fórmula D usa `SUM($C$14:C14)` con ancla en la primera celda → al arrastrar hacia abajo crece el rango sumado (eso da el acumulado Pareto).

**Formato condicional en `C14:C23`** → Barra de datos (data bar) color NAVY.

### 5.4 · Gráfico Pareto

1. Selecciona `A14:A23` y `C14:C23` (Ctrl para selección no contigua).
2. Insertar → Columna agrupada.
3. Posición: celda **F13**, tamaño ~560×320 px.
4. Título: `Pareto costo real por CUPS`.
5. Eje Y formato: `"$"#,##0,,"M"`.
6. Sin leyenda. Relleno serie NAVY.

### 5.5 · Banda "Top 10 Convenios por costo real"

| Celda | Contenido |
|-------|-----------|
| `A25:E25` | sección `  Top 10 Convenios por costo real` |

**Encabezados fila 27** (`A27:E27`): `convenio | régimen | citas cumpl. | costo real | recuperación`

**`A28` — array dinámico que esparce a `A28:B37`:**

```
=TAKE(SORTBY(UNIQUE(tblCostos[[nombre_convenio]:[regimen]]),
SUMIFS(tblCostos[nt_costo_total],tblCostos[nombre_convenio],
INDEX(UNIQUE(tblCostos[[nombre_convenio]:[regimen]]),,1),
tblCostos[regimen],INDEX(UNIQUE(tblCostos[[nombre_convenio]:[regimen]]),,2)),-1),10)
```

**Columnas C, D, E filas 28-37:**

| Col | Fórmula en fila 28 |
|-----|--------------------|
| C | `=IF(A28="","",SUMIFS(tblCostos[cumplida_flag],tblCostos[nombre_convenio],A28,tblCostos[regimen],B28))` |
| D | `=IF(A28="","",SUMIFS(tblCostos[nt_costo_total],tblCostos[nombre_convenio],A28,tblCostos[regimen],B28))` |
| E | `=IF(A28="","",SUMIFS(tblCostos[valor_recuperacion],tblCostos[nombre_convenio],A28,tblCostos[regimen],B28))` |

### 5.6 · Anchos

| Cols | Ancho |
|------|-------|
| A | 38 |
| B | 14 |
| C, D, E | 16 |

---

<a name="dashboard-4"></a>

## 6 · Dashboard 4 · Calidad y Oportunidad

**Crear hoja** `4 · Calidad y Oportunidad`, color TURQ.

### 6.1 · Título

| Celda | Contenido |
|-------|-----------|
| `A1:N1` | `Dashboard 4 · Calidad y Oportunidad` |
| `A2:N2` | `Oportunidad = fecha_cita - fecha_deseada (col calculada en tblCostos). Estado por sede = COUNTIFS.` |
| `A4:N4` | sección `  KPIs de calidad` |

### 6.2 · Tarjetas KPI

| Posición | Etiqueta | Fórmula | Leyenda | Formato |
|----------|----------|---------|---------|---------|
| `A6:C8` | OPORTUNIDAD PROM. | `=AVERAGE(tblCostos[oportunidad_dias])` | `AVERAGE(fecha_cita - fecha_deseada)` | días |
| `D6:F8` | OPORTUNIDAD MEDIANA | `=MEDIAN(tblCostos[oportunidad_dias])` | `MEDIAN sobre tblCostos` | días |
| `G6:I8` | % CITAS CON DEMORA | `=COUNTIF(tblCostos[oportunidad_dias],">3")/ROWS(tblCostos[id])` | `Oportunidad > 3 días` | porcentaje |
| `J6:L8` | % INASISTENCIA | `=COUNTIF(tblCostos[estado_consulta],"INASISTIO")/ROWS(tblCostos[id])` | `COUNTIF(estado_consulta="INASISTIO")` | porcentaje |

### 6.3 · Banda "Oportunidad por especialidad (top 15)"

| Celda | Contenido |
|-------|-----------|
| `A11:D11` | sección `  Oportunidad por especialidad (top 15)` |

**Encabezados fila 13** (`A13:D13`): `especialidad | citas | oportunidad prom. | % demora`

**`A14` — array dinámico que esparce a `A14:A28`:**

```
=TAKE(SORTBY(UNIQUE(tblCostos[especialidad]),COUNTIF(tblCostos[especialidad],UNIQUE(tblCostos[especialidad])),-1),15)
```

**Columnas B, C, D filas 14-28:**

| Col | Fórmula en fila 14 |
|-----|--------------------|
| B | `=IF(A14="","",COUNTIF(tblCostos[especialidad],A14))` |
| C | `=IFERROR(AVERAGEIFS(tblCostos[oportunidad_dias],tblCostos[especialidad],A14),0)` |
| D | `=IFERROR(COUNTIFS(tblCostos[especialidad],A14,tblCostos[oportunidad_dias],">3")/COUNTIF(tblCostos[especialidad],A14),0)` |

**Formato condicional:**
- `C14:C28` → escala 3 colores: min `0` GREEN, mid `5` AMBER, max `15` RED.
- `D14:D28` → barra de datos color RED.

### 6.4 · Gráfico de barras (horizontal)

1. Selecciona `A14:A28` y `C14:C28`.
2. Insertar → Barra agrupada.
3. Posición: celda **F13**, tamaño ~540×360 px.
4. Título: `Oportunidad promedio por especialidad`.
5. Sin leyenda. Relleno serie AMBER.

### 6.5 · Banda "Estados de consulta por sede"

| Celda | Contenido |
|-------|-----------|
| `A30:F30` | sección `  Estados de consulta por sede` |

**Encabezados fila 32:**
- `A32` → `sede`
- `B32` → `CUMPLIDA`
- `C32` → `PERDIDA`
- `D32` → `CANCELADA`
- `E32` → `INASISTIO`
- `F32` → `REASIGNADA`

**`A33` — array dinámico que esparce a `A33:A44`:**

```
=TAKE(SORTBY(UNIQUE(tblCostos[nombre_sede]),COUNTIF(tblCostos[nombre_sede],UNIQUE(tblCostos[nombre_sede])),-1),12)
```

**Matriz `B33:F44` (12 filas × 5 estados)** — fórmula en `B33` que se copia para toda la matriz:

```
=IF($A33="","",COUNTIFS(tblCostos[nombre_sede],$A33,tblCostos[estado_consulta],B$32))
```

> `$A33` fija la columna sede y `B$32` fija la fila de estados (referencia mixta).

### 6.6 · Anchos

| Cols | Ancho |
|------|-------|
| A | 32 |
| B-F | 12 |

---

<a name="dashboard-5"></a>

## 7 · Dashboard 5 · PyM / RIAS

**Crear hoja** `5 · PyM-RIAS`, color TURQ.

### 7.1 · Título

| Celda | Contenido |
|-------|-----------|
| `A1:L1` | `Dashboard 5 · PyM / RIAS` |
| `A2:L2` | `Programas PyM = UNIQUE(tblCostos[pym]). Métricas con COUNTIFS/AVERAGEIFS.` |
| `A4:L4` | sección `  KPIs PyM` |

### 7.2 · Tarjetas KPI

| Posición | Etiqueta | Fórmula | Leyenda | Formato |
|----------|----------|---------|---------|---------|
| `A6:C8` | TOTAL CITAS PYM | `=COUNTIFS(tblCostos[pym],"<>")` | `Citas con campo pym poblado` | entero |
| `D6:F8` | % CUMPLIM. PYM | `=IFERROR(SUMIFS(tblCostos[cumplida_flag],tblCostos[pym],"<>")/COUNTIFS(tblCostos[pym],"<>"),0)` | `cumplidas PyM / total PyM` | porcentaje |
| `G6:I8` | PROGRAMAS ACTIVOS | `=SUMPRODUCT(1/COUNTIF(tblCostos[pym],tblCostos[pym]&""))` | `COUNT DISTINCT(pym)` | entero |
| `J6:L8` | INASISTENCIA PYM | `=IFERROR(COUNTIFS(tblCostos[pym],"<>",tblCostos[estado_consulta],"INASISTIO")/COUNTIFS(tblCostos[pym],"<>"),0)` | `inasistidas PyM / total PyM` | porcentaje |

### 7.3 · Banda "Top 15 programas PyM"

| Celda | Contenido |
|-------|-----------|
| `A11:E11` | sección `  Top 15 programas PyM` |

**Encabezados fila 13** (`A13:E13`): `pym | citas | cumplidas | % cumplim. | % inasistencia`

**`A14` — array dinámico que esparce a `A14:A28`:**

```
=TAKE(SORTBY(UNIQUE(FILTER(tblCostos[pym],tblCostos[pym]<>"")),
COUNTIF(tblCostos[pym],UNIQUE(FILTER(tblCostos[pym],tblCostos[pym]<>""))),-1),15)
```

**Columnas B, C, D, E filas 14-28:**

| Col | Fórmula en fila 14 |
|-----|--------------------|
| B | `=IF(A14="","",COUNTIF(tblCostos[pym],A14))` |
| C | `=IF(A14="","",SUMIFS(tblCostos[cumplida_flag],tblCostos[pym],A14))` |
| D | `=IFERROR(C14/B14,0)` |
| E | `=IFERROR(COUNTIFS(tblCostos[pym],A14,tblCostos[estado_consulta],"INASISTIO")/B14,0)` |

**Formato condicional:**
- `D14:D28` → escala 3 colores: min `0` RED, mid `0.5` AMBER, max `1` GREEN.
- `E14:E28` → barra de datos RED.

### 7.4 · Gráfico de barras (volumen)

1. Selecciona `A14:B28`.
2. Insertar → Barra agrupada.
3. Posición: celda **G13**, tamaño ~540×360 px.
4. Título: `Volumen por programa PyM`.
5. Sin leyenda. Relleno serie NAVY.

### 7.5 · Anchos

| Cols | Ancho |
|------|-------|
| A | 36 |
| B-E | 14 |

---

<a name="readme"></a>

## 8 · Hoja `README`

Esta hoja documenta el workbook para quien lo reciba. Color pestaña: gris `#888888`.

### 8.1 · Título

| Celda | Contenido |
|-------|-----------|
| `A1:G1` | `Dashboards Nordvital — workbook 100% basado en fórmulas` (negrita 18pt NAVY) |
| `A2:G2` | `Generado: yyyy-mm-dd hh:mm` (itálica gris 9pt) |

### 8.2 · Bloques de contenido

Inserta texto explicativo a partir de la fila 4. Aplica estilo "sección" (fondo NAVY, texto blanco) a los encabezados de bloque y estilo "formula tag" (itálica turquesa) a los bullets de fórmulas.

**Bloque 1 — REGLA**
```
REGLA: ninguna celda de los dashboards contiene un valor pegado.
       Cambia cualquier dato en `data_costos` o `data_nt` y los
       KPIs, tablas y gráficos recalculan al instante.
```

**Bloque 2 — Fuentes (las únicas hojas con datos):**
- `data_costos` — tabla `tblCostos` (Hoja1 original, 344K filas, 37 cols + 6 calculadas)
- `data_nt` — tabla `tblNT` (citas_db notas_tecnicas original, 7,700 filas)
- `nt_map` — tabla `tblNTMap` DERIVADA de tblNT por reglas

**Bloque 3 — Columnas calculadas en `tblCostos`:**
- `mes_key` = `TEXT(fecha_cita,"yyyy-mm")`
- `oportunidad_dias` = `fecha_cita - fecha_deseada`
- `cumplida_flag` = `1` si `estado_consulta="CUMPLIDA"` sino `0`
- `nt_lookup_key` = `convenio | regimen | cups` (uppercase)
- `nt_costo_unit` = `XLOOKUP(nt_lookup_key, tblNTMap[key], tblNTMap[costo_unitario])`
- `nt_costo_total` = `cumplida_flag × nt_costo_unit`

**Bloque 4 — Reglas de derivación de `tblNTMap`:**

Para cada fila de `tblNT`:

1. Si `convenio` termina en ` / SUBSIDIADO` → genera **2 filas**: una con régimen `CONTRIBUTIVO` y otra `SUBSIDIADO`, ambas con el mismo `convenio_base` (sin el sufijo).
2. Si `convenio` contiene ` SUBSIDIADO` → genera **1 fila** régimen `SUBSIDIADO`.
3. Si `convenio` contiene ` CONTRIBUTIVO` → genera **1 fila** régimen `CONTRIBUTIVO`.
4. Cualquier otro caso → genera **1 fila** régimen `CONTRIBUTIVO`.

La clave de lookup es: `convenio_base|regimen|cups` (todo en mayúsculas, sin espacios laterales).

**Bloque 5 — Hojas de dashboard:**
1. Resumen Gerencial — KPIs globales, evolución mensual, riesgo por convenio
2. Ejecución vs NT — cumplimiento NT, heatmap convenio × CUPS
3. Análisis Financiero — costo real, esperado, recuperación, Pareto CUPS
4. Calidad y Oportunidad — oportunidad por especialidad, estados por sede
5. PyM / RIAS — programas PyM, cumplimiento, inasistencia

**Bloque 6 — Cómo VALIDAR que es real:**
- Selecciona cualquier celda numérica de un KPI o tabla — la barra de fórmulas mostrará una fórmula que apunta a `tblCostos` / `tblNT` / `tblNTMap`.
- Cambia un `estado_consulta` a `"CUMPLIDA"` en `data_costos` → KPI sube.
- Filtra `tblCostos` por sede → tablas y charts NO se filtran (los KPIs usan el rango completo, no la vista filtrada). Para análisis filtrado, duplica la hoja y modifica las fórmulas para apuntar a `SUBTOTAL`.

**Bloque 7 — Requisitos:** Excel 365 / 2021+ (UNIQUE, SORTBY, FILTER, XLOOKUP, TAKE).

Ancho columnas A-G: 16.

---

<a name="validacion"></a>

## 9 · Validación final

Una vez construido todo, verifica estos números con el filtro completo (sin filtros activos en las tablas):

| KPI | Valor esperado (al 9-jun-2026) |
|-----|-------------------------------|
| Cumplimiento global (Dashboard 1, `B7`) | **43.4 %** |
| Citas cumplidas | **113,330** |
| Recuperación | **$85.16 M** |
| Convenios en riesgo | **23** |
| Oportunidad promedio | **3.4 días** |
| Ejecutado vs NT (Dashboard 2) | **163,260** |
| Meta periodo | **325,441** |
| % Cumplimiento NT | **50.17 %** |
| Costo real ejecutado (Dashboard 3) | **$3,745.8 M** |
| Costo esperado NT | **$24,006.8 M** |
| % Eficiencia | **2.27 %** |

Si alguno discrepa, revisa en orden:

1. Que las **fórmulas estén bien escritas** (la barra de fórmulas debe mostrar `=SUM(...)` etc, no un número).
2. Que **`tblCostos` tenga las 6 columnas calculadas** y que se hayan propagado a las 344,438 filas.
3. Que **`tblNTMap`** tenga ~12,375 filas y la columna `key` esté en mayúsculas sin espacios.
4. Que el **XLOOKUP** en `nt_costo_unit` esté encontrando matches: filtra `tblCostos` por `nt_costo_unit > 0` y debe haber ~163,000 filas.

### Cómo recrear el workbook en pocos minutos

Si vuelves a perder el archivo, ten siempre listo:

1. `citas_db_costos.xlsx` con sus dos hojas originales.
2. Este documento abierto para copiar/pegar las fórmulas exactas.
3. Excel 365 / 2021+ instalado.

El orden de trabajo siempre es:

1. Crear `data_costos` y `tblCostos` (con las 6 columnas calculadas).
2. Crear `data_nt` y `tblNT`.
3. Crear `nt_map` y `tblNTMap` (aplicando las reglas de derivación).
4. Crear las 5 hojas de dashboard en orden, copiando las fórmulas de cada sección.
5. Crear el `README`.
6. Ordenar las pestañas y aplicar colores.
7. Guardar como `.xlsx`.
