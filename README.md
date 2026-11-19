# Sistema de Alarmas

Aplicación web para cargar un CSV de alarmas de red (2G/3G/4G), calcular cuánto tiempo lleva activa
cada una y clasificarla en **NORMAL**, **WARN** o **CRÍTICO**. Incluye filtros, búsqueda por ID,
exportación a Excel y un resumen del día agrupado por hora.

```
Sistema de Alarmas/
├── web/        # Frontend Next.js 15 + TypeScript + Tailwind
└── backend/    # API FastAPI + SQLite (clasificación y resumen)
```

## Funcionalidades

**Carga del archivo**
- Arrastrar y soltar el CSV en cualquier parte de la ventana, o elegirlo con **Seleccionar archivo**.
- Validaciones con ventana explicativa: extensión distinta de `.csv`, Excel renombrado a `.csv` (contenido binario), archivo vacío, más de 200.000 filas, columnas faltantes y separador distinto de `|`.
- Si el separador es `,`, `;` o tabulación, ofrece **convertirlo a `|`** y cargar igual.
- Acepta archivos de Windows (BOM y saltos de línea CRLF) y columnas en cualquier orden.
- Las filas con ID no numérico o fecha inválida se omiten. Un aviso las cuenta y **Ver detalle** lista cada una con su motivo.
- **Cambiar archivo:** pide confirmación y reemplaza el archivo anterior (filtros y búsqueda vuelven a su estado inicial).

**Tabla de alarmas**
- Distintivo de color (CRÍTICO, WARN, NORMAL). Al pasar el mouse muestra el motivo del nivel.
- Columnas: ID, 2G, 3G, 4G, fecha, hora, duración acumulada, municipio, departamento y NOTIFICADA.
- Duración recalculada cada minuto con el reloj del servidor, sin parpadeo.
- Paginación de 10 filas, con bloques de números de página.
- Columna del distintivo fija al desplazar la tabla en pantallas pequeñas.

**Herramientas**
- **Buscador** por ID, municipio o departamento, sin distinguir mayúsculas ni tildes ("cubara" encuentra "Cubará").
- **Filtro por distintivo** con el conteo de cada nivel.
- **Orden:** por distintivo (Crítico → Normal), hora más reciente u hora más antigua.
- **Selector 12 h / 24 h** para mostrar la hora.
- Icono ⓘ con los formatos de fecha detectados en el documento.

**Resumen del día**
- Alarmas del archivo creadas hoy (hora de Colombia), agrupadas por hora.
- Gráfico de barras o de torta, con el detalle por hora.

**Exportar a Excel**
- Descarga un `.xlsx` con todas las filas del filtro y la búsqueda actuales (no solo la página visible).
- Incluye el distintivo con color, el filtro aplicado y la hora de generación. El nombre del archivo lleva el filtro y la fecha.

**Backend**
- API FastAPI con SQLite: guarda el archivo, clasifica, filtra, busca, ordena y pagina en SQL.
- Cada carga reemplaza a la anterior en una sola transacción. El número de lote (`batchId`) evita mezclar datos de dos archivos (responde 409).
- Errores siempre en formato `{ "error": "..." }`, que la web muestra tal cual.
- Documentación interactiva en `/docs`.

**Otros**
- Funciona sin backend Python usando las rutas internas de Next (respaldo en memoria).
- Accesibilidad: navegación con teclado, enlace "Saltar al contenido", avisos para lectores de pantalla y respeto de "reducir movimiento".
- Diseño adaptable a móvil.

## Requisitos

- **Node.js 20+** y npm
- **Python 3.11+**

## 1. Levantar el backend (FastAPI)

```bash
cd backend
python3 -m venv .venv            # solo la primera vez
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

En Windows: `.venv\Scripts\pip` y `.venv\Scripts\uvicorn`.

- Verificar: http://localhost:8000/health → `{"ok": true}`
- Documentación interactiva: http://localhost:8000/docs
- El archivo cargado se guarda en `backend/alarmas.db` (SQLite). La base se crea sola junto a `main.py` y cada carga reemplaza la anterior. Sin `NEXT_PUBLIC_API_URL`, la ruta interna de Next lo guarda en memoria del proceso.

## 2. Levantar la web (Next.js)

```bash
cd web
npm install                      # solo la primera vez
npm run dev                      # http://localhost:3000
```

## 3. Conectar la web con el backend

Crear `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Reiniciar `npm run dev` después de crear o cambiar este archivo.

- **Con la variable**, la web llama al backend FastAPI en el puerto 8000. Debe estar levantado: si no, la web muestra *"No se pudo subir el archivo: Failed to fetch"*.
- **Sin la variable**, la web usa sus rutas internas (`web/src/app/api/…`), que aplican la misma lógica. Sirve para probar solo la web, sin Python.

Toda la comunicación con el backend pasa por `web/src/lib/api.ts`.

## Cómo funciona

1. **La web lee y valida el CSV:**
   - solo se aceptan archivos `.csv` separados por `|`;
   - se verifican las columnas obligatorias;
   - `ID_ALARMA` debe ser numérico y la fecha debe ser válida.
2. **Sube el archivo una sola vez** (`POST /api/alarms/upload`). El backend lo guarda y el navegador no conserva las filas.
3. **La tabla pide páginas de 10** (`GET /api/alarms/page`). El servidor clasifica cada alarma con su propio reloj y aplica el distintivo elegido, la búsqueda, el orden y la página. Devuelve solo esas 10 filas y los conteos de las tarjetas. Cada minuto se vuelve a pedir **solo la página visible**.
4. **Exportar a Excel** pide todas las filas del filtro actual (`size=0`) únicamente al exportar.
5. **Resumen del día:** el botón llama a `GET /api/summary`, que cuenta por hora las alarmas del archivo creadas hoy, en hora de Colombia (`America/Bogota`), con el reloj del servidor.

### Columnas del CSV

```
ID_ALARMA|"2G"|"3G"|"4G"|"FECHA_CREACION"|"MUNICIPIO"|"DEPARTAMENTO"|"NOTIFICADA"
4659944|0|0|13|09-OCT-26 10.12.56.000000000 PM|"Cabuyaro"|"Meta"|"N"
```

Todo se maneja en **hora estándar de Colombia** (`America/Bogota`), sin depender del navegador:

- **Fechas sin zona horaria:** se interpretan como hora de Colombia, igual en la web y en el backend.
- **Duración acumulada:** la calcula el servidor con su propio reloj.
- **Resumen del día:** también lo calcula el servidor, en hora de Colombia.
- **Tabla y Excel:** muestran la fecha y la hora **tal como vienen en el documento**; el selector 12 h / 24 h solo cambia el formato.

El icono ⓘ junto al selector de hora muestra los formatos de FECHA_CREACION detectados (Oracle, militar 24 h, 12 h o ISO). Cada archivo se muestra al cargar en formato estándar AM/PM.

Formatos de fecha aceptados:
- Oracle: `09-OCT-26 10.12.56.000000000 PM`, con meses en inglés o en español.
- Militar: `2026-11-18 14:30:00`.
- 12 h: `18/11/2026 02:30 PM` o `2:30 p. m.`.
- ISO con zona horaria.

### Regla de negocio

Está en `backend/services/alarmas_service.py`, con una copia en `web/src/lib/alarms.ts`. Las **condiciones base** se evalúan en este orden:

1. `NOTIFICADA = 'N'`.
2. Las tres tecnologías (2G, 3G, 4G) tienen valor `>= 0`. Si una es negativa o está vacía, la alarma ya no cumple.
3. Al menos una tecnología vale exactamente `100`.

| Distintivo | Cuándo |
|---|---|
| **CRÍTICO** | Cumple la condición base y lleva más de 24 h activa |
| **WARN** | Cumple la condición base y lleva más de 1 h y hasta 24 h activa |
| **NORMAL** | Todas las demás: no entra en CRÍTICO ni en WARN |

Al pasar el mouse sobre el distintivo en la tabla se ve el motivo de su nivel. El Excel exportado incluye el distintivo de cada alarma (NORMAL / WARN / CRÍTICO), sin el motivo.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor |
| POST | `/api/alarms/upload` | Sube el archivo: `{ alarms: [...] }` → `{ batchId, total, rejected, stored }`. Reemplaza al anterior. El servidor asigna `batchId`, sin depender del reloj del navegador |
| GET | `/api/alarms/page` | `?batchId&level=ALL\|CRITICO\|WARN\|NORMAL&q&sort=level\|recent\|oldest&page&size=10` → `{ classifiedAt, total, page, size, counts, rows }`. `size=0`: todas las filas filtradas |
| GET | `/api/summary` | `?batchId&timeZone=America/Bogota` → `{ date, total, hours[24] }` |

Si el `batchId` ya no es el vigente (otra carga lo reemplazó o el servidor se reinició), responde **409** y la web pide volver a cargar el archivo.

## Colores

Los colores están centralizados por función en `web/src/app/globals.css`:

| Rol | Color | Uso |
|---|---|---|
| `brand` | azul corporativo | botones primarios, foco y selección |
| `critical` | rojo sobrio | distintivo CRÍTICO |
| `warn` | ámbar ocre | distintivo WARN y avisos |
| `ok` | verde apagado | distintivo Normal y confirmaciones |
| `danger` | rojo | errores y acciones destructivas |

Los componentes usan esos nombres, como `bg-brand-600` o `text-critical-800`. Son escalas propias (no las de Tailwind por defecto). Para cambiar un color en toda la app, edita sus valores en `globals.css`.

Los colores que no pasan por CSS (Excel, gráfico de torta y el color de la barra del navegador en móvil) están en `web/src/lib/theme.ts`.

## Tests

```bash
cd web && npm test               # lógica de la web y ruta interna de clasificación
cd backend && .venv/bin/python test_alarmas.py
```

Otros comandos de la web: `npm run lint` y `npm run build`.

## Probar manualmente

Sube un CSV con las columnas indicadas arriba. Para probar las validaciones, sube un archivo con otro separador (`,` o `;`), sin alguna columna, vacío o con otra extensión: la web explica cada caso en una ventana.
