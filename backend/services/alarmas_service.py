"""Lógica de negocio: condiciones base, clasificación por duración y resumen del día.

Condiciones base, en orden:
  1. NOTIFICADA = 'N'.
  2. Las TRES tecnologías (2G/3G/4G) >= 0; un negativo o vacío ya no cumple.
  3. AL MENOS UNA vale exactamente 100.
Si cumple: > 24 h → CRITICO, > 1 h y <= 24 h → WARN. Lo demás → NORMAL.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

NivelAlarma = Literal["NORMAL", "WARN", "CRITICO"]
COLOMBIA_TZ = ZoneInfo("America/Bogota")  # zona por defecto para fechas sin zona

HORA = timedelta(hours=1)
DIA = timedelta(hours=24)

# Oracle: "09-OCT-26 10.12.56.000000000 PM" (meses en inglés o español)
_ORACLE = re.compile(
    r"^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})(?:\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:[.,]\d+)?(?:\s*([AaPp])\.?\s?[Mm]\.?)?)?$"
)
_MESES = {
    "JAN": 1, "ENE": 1, "FEB": 2, "MAR": 3, "APR": 4, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7,
    "AUG": 8, "AGO": 8, "SEP": 9, "SET": 9, "OCT": 10, "NOV": 11, "DEC": 12, "DIC": 12,
}
# "YYYY-MM-DD HH:MM[:SS]" ya lo resuelve fromisoformat; aquí solo los formatos dd/mm/aaaa.
_FORMATOS = [
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y %I:%M:%S %p",
    "%d/%m/%Y %I:%M %p",
]


def zona(tz: str) -> ZoneInfo:
    """ZoneInfo válida o ValueError."""
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError, OSError) as e:
        raise ValueError(f"Zona horaria inválida: {str(tz)[:64]}") from e


def parsear_fecha(valor: str | datetime) -> datetime:
    """Fecha con zona. Acepta ISO (lo que envía la web), 24h, 12h y formato Oracle."""
    if isinstance(valor, datetime):
        return valor if valor.tzinfo else valor.replace(tzinfo=COLOMBIA_TZ)

    texto = str(valor).strip()
    dt: Optional[datetime] = None
    try:
        dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        m = _ORACLE.match(texto)
        if m:
            d, mes, y, h, mi, s, ap = m.groups()
            if mes.upper() not in _MESES:
                raise ValueError(f"Mes no reconocido: {mes}")
            anio = int(y) if len(y) == 4 else (2000 if int(y) < 50 else 1900) + int(y)
            hora = int(h or 0)
            if ap:
                if not 1 <= hora <= 12:  # "13.00.00 PM" no existe
                    raise ValueError(f"Hora inválida con AM/PM: {texto}")
                hora = hora % 12 + (12 if ap.upper() == "P" else 0)
            dt = datetime(anio, _MESES[mes.upper()], int(d), hora, int(mi or 0), int(s or 0))
        else:
            # "p. m." / "a. m." (formato regional) → PM / AM para strptime.
            normal = re.sub(r"\s*([ap])\.?\s?m\.?$", lambda x: " " + x.group(1).upper() + "M", texto, flags=re.I)
            for fmt in _FORMATOS:
                try:
                    dt = datetime.strptime(normal, fmt)
                    break
                except ValueError:
                    continue
    if dt is None:
        raise ValueError(f"Formato de fecha no reconocido: {texto}")
    dt = dt if dt.tzinfo else dt.replace(tzinfo=COLOMBIA_TZ)
    try:
        # Fechas extremas (año 1 / 9999) desbordan al convertir: se rechazan aquí.
        for horas in (0, 14, -14):
            dt.astimezone(timezone(timedelta(hours=horas)))
    except OverflowError as e:
        raise ValueError(f"Fecha fuera de rango: {texto}") from e
    return dt


def check_base(
    tech_2g: Optional[float],
    tech_3g: Optional[float],
    tech_4g: Optional[float],
    notificada: str,
) -> tuple[bool, str]:
    """Condiciones base, en el orden de la regla de negocio. Devuelve (cumple, motivo)."""
    # 1. Estado de notificación: NOTIFICADA = 'N'
    notificada = str(notificada or "").strip().upper()
    if notificada != "N":
        return False, f"Ya notificada (NOTIFICADA = '{notificada or 'vacío'}')"

    tecnologias = (tech_2g, tech_3g, tech_4g)

    # 2. Disponibilidad: las TRES >= 0. Un negativo o vacío ya no cumple.
    if not all(t is not None and t >= 0 for t in tecnologias):
        return False, "Alguna tecnología con valor negativo o vacío"

    # 3. Capacidad al límite: AL MENOS UNA == 100
    if not any(t == 100 for t in tecnologias):
        return False, "Ninguna tecnología está al 100"

    return True, "Cumple condición base"


def clasificar_alarma(
    tech_2g: Optional[float],
    tech_3g: Optional[float],
    tech_4g: Optional[float],
    notificada: str,
    fecha_creacion: datetime,
    ahora: Optional[datetime] = None,
) -> dict:
    """{level, meetsBase, reason, durationMs}. Lo que no entra en CRITICO ni WARN → NORMAL."""
    ahora = ahora or datetime.now(timezone.utc)
    duracion = max(timedelta(0), ahora - parsear_fecha(fecha_creacion))
    cumple, motivo = check_base(tech_2g, tech_3g, tech_4g, notificada)

    nivel: NivelAlarma = "NORMAL"
    if cumple and duracion > DIA:
        nivel = "CRITICO"
    elif cumple and duracion > HORA:
        nivel = "WARN"

    return {
        "level": nivel,
        "meetsBase": cumple,
        "reason": motivo,
        "durationMs": int(duracion.total_seconds() * 1000),
    }


def construir_resumen_hoy(fechas: list[datetime], tz: str | ZoneInfo, ahora: Optional[datetime] = None) -> dict:
    """Alarmas creadas HOY (en la zona `tz`) agrupadas por hora."""
    zi = tz if isinstance(tz, ZoneInfo) else zona(tz)
    ahora = ahora or datetime.now(timezone.utc)
    hoy = ahora.astimezone(zi).date()
    horas = [{"hour": h, "count": 0} for h in range(24)]
    total = 0
    for f in fechas:
        try:
            local = f.astimezone(zi)
        except OverflowError:
            continue
        if local.date() != hoy:
            continue
        horas[local.hour]["count"] += 1
        total += 1
    return {
        "date": hoy.isoformat(),
        "timeZone": zi.key,
        "total": total,
        "hours": horas,
        "generatedAt": ahora.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

