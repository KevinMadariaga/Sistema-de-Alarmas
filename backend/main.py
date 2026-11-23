"""API de alarmas (FastAPI).

La web lee y valida el CSV y lo SUBE una vez (POST /api/alarms/upload). Este servidor lo guarda en SQLite
(alarmas.db) y la tabla pide páginas de 10 (GET /api/alarms/page): clasificación, filtro, búsqueda, orden y
paginación se resuelven en SQL con la hora actual. También arma el resumen del día por zona horaria.

"""
import json
import math
import os
import re
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import and_, case, func, update
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import AlarmaDB, LoteDB
from services.alarmas_service import check_base, construir_resumen_hoy, parsear_fecha, zona

MAX_ALARMAS = 200_000
MAX_BYTES = 100 * 1024 * 1024  # tope del cuerpo de la subida (antes de parsear el JSON)
SEP = "\x1f"  # separa id / municipio / departamento en la columna de búsqueda: una búsqueda no cruza campos
NIVELES = ("ALL", "CRITICO", "WARN", "NORMAL")
ORDENES = ("level", "recent", "oldest")


# ---------------------------------------------------------------- 1. arranque, CORS y errores


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Crear tablas al ARRANCAR el servidor (no al importar): importar main en tests no toca alarmas.db.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Sistema de Alarmas", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # CORS_ORIGINS: dominios extra separados por coma (p. ej. https://mi-app.vercel.app)
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"]
    + [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ErrorPeticion(Exception):
    status = 400


class ErrorLote(ErrorPeticion):
    status = 409  # el lote pedido ya no es el vigente (otra carga lo reemplazó o el servidor no lo tiene)


@app.exception_handler(ErrorPeticion)
async def _error_peticion(_: Request, exc: ErrorPeticion):
    # JSON {error}: el frontend muestra este mensaje (api.ts lee body.error).
    return JSONResponse(status_code=exc.status, content={"error": str(exc)})


@app.exception_handler(RequestValidationError)
async def _error_validacion(_: Request, exc: RequestValidationError):
    # Parámetros inválidos (tipos, rangos): mismo formato {error} que el resto, no el {detail} de FastAPI.
    campos = ", ".join(str(e["loc"][-1]) for e in exc.errors())
    return JSONResponse(status_code=400, content={"error": f"Parámetros inválidos: {campos}"})


# ---------------------------------------------------------------- 2. ayudantes


def _num(v) -> float | None:
    """Número finito o None. bool se excluye (es subclase de int); NaN/Infinity y enteros enormes también."""
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except OverflowError:
        return None
    return f if math.isfinite(f) else None


def _txt(v) -> str:
    return v if isinstance(v, str) else ""


def _plegar(s: str) -> str:
    """Minúsculas y sin tildes: "Cubará" y "CUBARA" coinciden con "cubara"."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower().strip()


def _a_epoch_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


_ID_VALIDO = re.compile(r"[0-9]+")  # solo dígitos ASCII


# ---------------------------------------------------------------- 3. subir el lote


def _guardar_lote(items: list, db: Session) -> dict:
    """Valida y guarda el lote. El número de lote lo asigna el SERVIDOR."""
    filas, rechazadas = [], 0
    for raw in items:
        item = raw if isinstance(raw, dict) else {}
        id_alarma = _txt(item.get("id"))
        try:
            if not _ID_VALIDO.fullmatch(id_alarma):
                raise ValueError("ID_ALARMA no numérico")
            fecha = parsear_fecha(_txt(item.get("createdAt")))
        except ValueError:
            rechazadas += 1
            continue
        g2, g3, g4 = _num(item.get("g2")), _num(item.get("g3")), _num(item.get("g4"))
        notificada = _txt(item.get("notificada")).strip().upper()
        municipio, departamento = _txt(item.get("municipio")), _txt(item.get("departamento"))
        cumple, motivo = check_base(g2, g3, g4, notificada)
        filas.append(
            {
                "id_alarma": id_alarma,
                "tech_2g": g2,
                "tech_3g": g3,
                "tech_4g": g4,
                # SQLite descarta la zona horaria: se guarda SIEMPRE en UTC y se lee como UTC.
                "fecha_creacion": fecha.astimezone(timezone.utc).replace(tzinfo=None),
                "fecha_original": _txt(item.get("createdRaw"))[:80],
                "municipio": municipio,
                "departamento": departamento,
                "notificada": notificada,
                "cumple_base": cumple,
                "motivo": motivo,
                "busqueda": SEP.join(_plegar(x) for x in (id_alarma, municipio, departamento)),
            }
        )

    # Una sola transacción: subir el contador, borrar el lote anterior e insertar el nuevo.
    if db.execute(update(LoteDB).where(LoteDB.id == 1).values(batch_id=LoteDB.batch_id + 1)).rowcount == 0:
        db.add(LoteDB(id=1, batch_id=1))
        db.flush()
    batch_id = int(db.get(LoteDB, 1).batch_id)
    db.query(AlarmaDB).delete()
    db.bulk_insert_mappings(AlarmaDB, filas)
    db.commit()
    return {"batchId": batch_id, "total": len(filas), "rejected": rechazadas, "stored": True}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/alarms/upload")
async def subir_lote(request: Request, db: Session = Depends(get_db)):
    """Body: {alarms: [{id, g2, g3, g4, createdAt (ISO), createdRaw, municipio, departamento, notificada}]}
    Respuesta: {batchId, total, rejected, stored}. Reemplaza el lote anterior."""
    crudo = await request.body()
    if len(crudo) > MAX_BYTES:
        raise ErrorPeticion(f"El archivo es demasiado grande (máximo {MAX_BYTES // (1024 * 1024)} MB)")
    try:
        body = await run_in_threadpool(json.loads, crudo)
    except ValueError:
        raise ErrorPeticion("JSON inválido")
    alarmas = body.get("alarms") if isinstance(body, dict) else None
    if not isinstance(alarmas, list) or len(alarmas) > MAX_ALARMAS:
        raise ErrorPeticion(f"'alarms' debe ser un arreglo de máximo {MAX_ALARMAS} elementos")
    return await run_in_threadpool(_guardar_lote, alarmas, db)


# ---------------------------------------------------------------- 4. consultar páginas


def _verificar_lote(db: Session, batch_id: int) -> None:
    actual = db.get(LoteDB, 1)
    if actual is None:
        raise ErrorLote("El servidor no tiene el archivo (se reinició). Vuelve a cargarlo.")
    if actual.batch_id != batch_id:
        raise ErrorLote("El archivo fue reemplazado por otra carga. Vuelve a cargarlo.")


def _nivel_sql(ahora: datetime):
    """Nivel calculado en SQL con la hora actual (misma regla que clasificar_alarma)."""
    corte_1h = (ahora - timedelta(hours=1)).replace(tzinfo=None)
    corte_24h = (ahora - timedelta(hours=24)).replace(tzinfo=None)
    return case(
        (and_(AlarmaDB.cumple_base, AlarmaDB.fecha_creacion < corte_24h), "CRITICO"),  # > 24 h
        (and_(AlarmaDB.cumple_base, AlarmaDB.fecha_creacion < corte_1h), "WARN"),  # > 1 h y <= 24 h
        else_="NORMAL",
    )


def _a_json(r: AlarmaDB, nivel: str, ahora: datetime) -> dict:
    """Fila para la web."""
    fecha = r.fecha_creacion.replace(tzinfo=timezone.utc)  # se guardó en UTC sin zona
    return {
        "id": r.id_alarma,
        "g2": r.tech_2g,
        "g3": r.tech_3g,
        "g4": r.tech_4g,
        "createdAt": _a_epoch_ms(fecha),
        "createdRaw": r.fecha_original or fecha.isoformat(),
        "municipio": r.municipio or "",
        "departamento": r.departamento or "",
        "notificada": r.notificada,
        "level": nivel,
        "meetsBase": r.cumple_base,
        "reason": r.motivo,
        "durationMs": max(0, _a_epoch_ms(ahora) - _a_epoch_ms(fecha)),
    }


@app.get("/api/alarms/page")
def pagina(
    batchId: int,
    level: str = "ALL",
    q: str = "",
    sort: str = "level",
    page: int = Query(1, ge=1, le=1_000_000_000),
    size: int = Query(10, ge=0, le=MAX_ALARMAS),
    db: Session = Depends(get_db),
):
    """Una página (size filas; 0 = todas, para exportar) ya clasificada, filtrada y ordenada."""
    _verificar_lote(db, batchId)
    q = q[:100]
    ahora = datetime.now(timezone.utc)
    nivel = _nivel_sql(ahora)

    counts = {"ALL": 0, "CRITICO": 0, "WARN": 0, "NORMAL": 0}
    for n, c in db.query(nivel, func.count()).group_by(nivel).all():
        counts[n] = c
        counts["ALL"] += c

    consulta = db.query(AlarmaDB, nivel)
    if level in NIVELES and level != "ALL":
        consulta = consulta.filter(nivel == level)
    if q.strip():
        patron = _plegar(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        consulta = consulta.filter(AlarmaDB.busqueda.like(f"%{patron}%", escape="\\"))
    total = consulta.order_by(None).count()

    rango = case((nivel == "CRITICO", 2), (nivel == "WARN", 1), else_=0)
    orden = {
        "level": (rango.desc(), AlarmaDB.fecha_creacion.asc()),  # Crítico → Normal; empate: mayor duración primero
        "recent": (AlarmaDB.fecha_creacion.desc(),),
        "oldest": (AlarmaDB.fecha_creacion.asc(),),
    }[sort if sort in ORDENES else "level"]
    consulta = consulta.order_by(*orden, AlarmaDB.pk)
    if size > 0:
        consulta = consulta.offset((page - 1) * size).limit(size)

    filas = [_a_json(r, n, ahora) for r, n in consulta.all()]
    _verificar_lote(db, batchId)  # si otra subida reemplazó el lote a mitad de la consulta → 409
    return {
        "classifiedAt": ahora.isoformat().replace("+00:00", "Z"),
        "total": total,
        "page": page,
        "size": size,
        "counts": counts,
        "rows": filas,
    }


# ---------------------------------------------------------------- 5. resumen del día


@app.get("/api/summary")
def resumen(batchId: int, timeZone: str = Query(..., max_length=64), db: Session = Depends(get_db)):
    """Alarmas creadas HOY (en `timeZone`) agrupadas por hora."""
    try:
        zi = zona(timeZone)
    except ValueError as e:
        raise ErrorPeticion(str(e))
    _verificar_lote(db, batchId)
    ahora = datetime.now(timezone.utc)
    inicio_local = ahora.astimezone(zi).replace(hour=0, minute=0, second=0, microsecond=0)
    desde = inicio_local.astimezone(timezone.utc).replace(tzinfo=None)
    hasta = (inicio_local + timedelta(days=1)).astimezone(timezone.utc).replace(tzinfo=None)
    filas = db.query(AlarmaDB.fecha_creacion).filter(AlarmaDB.fecha_creacion >= desde, AlarmaDB.fecha_creacion < hasta)
    return construir_resumen_hoy([f.replace(tzinfo=timezone.utc) for (f,) in filas.all()], zi, ahora)