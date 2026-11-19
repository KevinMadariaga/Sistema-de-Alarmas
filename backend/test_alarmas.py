"""Chequeo mínimo de la regla de negocio. Ejecutar: .venv/bin/python test_alarmas.py"""
from datetime import datetime, timedelta, timezone

from services.alarmas_service import clasificar_alarma, construir_resumen_hoy, parsear_fecha

ahora = datetime(2026, 11, 18, 17, 0, tzinfo=timezone.utc)
nivel = lambda h, g=(100, 100, 100), n="N": clasificar_alarma(*g, n, ahora - timedelta(hours=h), ahora)["level"]

assert nivel(1) == "NORMAL"                      # justo 1 h → todavía NORMAL
assert nivel(1.01) == "WARN"
assert nivel(24) == "WARN"                       # justo 24 h → todavía WARN
assert nivel(24.01) == "CRITICO"
assert nivel(48, n="S") == "NORMAL"              # ya notificada
assert nivel(48, g=(100, -1, 100)) == "NORMAL"   # un negativo
assert nivel(48, g=(100, None, 100)) == "NORMAL" # un vacío
assert nivel(48, g=(100, 50, 0)) == "CRITICO"    # basta una al 100
assert nivel(48, g=(99, 50, 0)) == "NORMAL"      # ninguna al 100

assert parsear_fecha("09-OCT-26 10.12.56.000000000 PM").hour == 22

r = construir_resumen_hoy(
    [datetime(2026, 11, 18, 13, 10, tzinfo=timezone.utc), datetime(2026, 11, 18, 4, 0, tzinfo=timezone.utc)],
    "America/Bogota",
    ahora,
)
assert r["total"] == 1 and r["hours"][8]["count"] == 1  # 04:00Z = 23:00 del día anterior en Bogotá → fuera
print("OK")