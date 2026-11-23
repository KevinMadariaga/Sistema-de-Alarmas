# Sistema de Alarmas

Aplicación web para cargar un CSV de alarmas de red (2G/3G/4G), calcular cuánto tiempo lleva activa
cada una y clasificarla en **NORMAL**, **WARN** o **CRÍTICO**. Incluye filtros, búsqueda por ID,
exportación a Excel y un resumen del día agrupado por hora.

## Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4 (Excel con `exceljs`, iconos con `lucide-react`)
- **Backend:** Python, FastAPI, SQLAlchemy, SQLite
- **Despliegue:** Vercel (web) y Render (backend)

## Arquitectura

Todo está en un solo repositorio:

- **Web** (`web/`, Next.js): lee y valida el CSV en el navegador, muestra la tabla, los filtros, el resumen y exporta a Excel.
- **Backend** (`backend/`, FastAPI): guarda el archivo en SQLite y resuelve en SQL la clasificación, el filtro, la búsqueda, el orden, la paginación y el resumen del día.
- **Conexión:** la web llama al backend por HTTP a la URL de `NEXT_PUBLIC_API_URL`. Todas las llamadas pasan por `web/src/lib/api.ts`. Sin esa variable, la web usa sus rutas internas (`web/src/app/api/…`), que aplican la misma lógica con los datos en memoria.

## Estructura del proyecto

```
web/                            → Frontend Next.js
  src/app/                      → Página, layout y rutas internas /api (respaldo en memoria)
  src/components/               → Componentes de UI: tabla, modales, filtros
  src/hooks/useAlarms.ts        → Estado de carga, paginación y refresco cada minuto
  src/lib/                      → Lógica: CSV, clasificación, fechas, resumen, exportar Excel
    api.ts                      → Cliente HTTP, único punto de conexión con el backend
backend/                        → API FastAPI
  main.py                       → Endpoints, CORS y manejo de errores
  database.py                   → Conexión a SQLite (alarmas.db, se crea sola)
  models.py                     → Tablas de SQLAlchemy
  services/alarmas_service.py   → Regla de negocio, fechas y resumen del día
  test_alarmas.py               → Tests del backend
```

## Instalación

### Requisitos

- **Node.js 20+** y npm
- **Python 3.11+**

### Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv                         # solo la primera vez
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

En Windows: `.venv\Scripts\pip` y `.venv\Scripts\uvicorn`.

- Verificar: http://localhost:8000/health → `{"ok": true}`
- Documentación interactiva: http://localhost:8000/docs

### Web (Next.js)

En otra terminal:

```bash
cd web
npm install                                   # solo la primera vez
npm run dev
```

La app queda en http://localhost:3000.

### Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `web/.env.local` | URL del backend. En local: `http://localhost:8000`. Sin ella, la web usa sus rutas internas en memoria |
| `CORS_ORIGINS` | entorno del backend | Dominios extra que pueden llamar a la API, separados por coma. `localhost:3000` ya está permitido |

Reiniciar `npm run dev` después de crear o cambiar `web/.env.local`.

## Local y producción

- **Local:** `web/.env.local` apunta a `http://localhost:8000`. No hace falta `CORS_ORIGINS`.
- **Producción:** la web está en **Vercel** y el backend en **Render**. Ambos se conectan a este repositorio y se redespliegan con cada `git push` a `main`. Render solo se redespliega cuando cambia `backend/`.

| | Web → Vercel | Backend → Render |
|---|---|---|
| Tipo | Project (en la fila **web**, "Importar un solo proyecto") | Web Service |
| Root Directory | `web` | `backend` |
| Build Command | automático (Next.js) | `pip install -r requirements.txt` |
| Start Command | automático | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Variable de entorno | `NEXT_PUBLIC_API_URL` = URL de Render | `CORS_ORIGINS` = URL de Vercel |

- Las URL van con `https://` y sin `/` al final.
- `NEXT_PUBLIC_API_URL` se fija al compilar: si se cambia, hay que hacer **Redeploy** en Vercel.
- El backend va en Render y no en Vercel porque Vercel no conserva la base SQLite entre peticiones y limita la subida a 4.5 MB.

## Tests

```bash
(cd web && npm test)                              # lógica de la web y ruta interna de clasificación
(cd backend && .venv/bin/python test_alarmas.py)  # backend
```

Otros comandos de la web: `npm run lint` y `npm run build`.
