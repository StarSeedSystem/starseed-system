"""DIR1125S: el lector de límites de Claude entiende `/usage` y declara bien."""
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lector_limites_claude as L  # noqa: E402

USAGE = """You are currently using your subscription to power your Claude Code usage

Current session: 10% used · resets Nov 25 at 9:30pm (America/Mexico_City)
Current week (all models): 58% used · resets Nov 28 at 4am (America/Mexico_City)
Current week (Fable): 100% used · resets Nov 28 at 4am (America/Mexico_City)
"""
AHORA = datetime(2026, 11, 25, 19, 40, tzinfo=ZoneInfo("America/Mexico_City"))


def test_parsea_sesion_semana_y_modelo():
    l = L.parsear_usage(USAGE, AHORA)
    assert l["sesion_pct"] == 10 and l["sesion_reinicio"].startswith("2026-11-25T21:30:00")
    assert l["semana_pct"] == 58 and l["semana_reinicio"].startswith("2026-11-28T04:00:00")
    assert l["modelo_nombre"] == "Fable" and l["modelo_pct"] == 100


def test_sin_sesion_no_hay_lectura():
    assert L.parsear_usage("Not logged in · Please run /login", AHORA) is None
    assert L.parsear_usage("", AHORA) is None


def test_el_reinicio_de_enero_visto_en_diciembre_es_del_ano_siguiente():
    dic = datetime(2026, 12, 30, 10, 0, tzinfo=ZoneInfo("America/Mexico_City"))
    t = USAGE.replace("Nov 25", "Jan 1").replace("Nov 28", "Jan 3")
    l = L.parsear_usage(t, dic)
    assert l["sesion_reinicio"].startswith("2027-01-01") and l["semana_reinicio"].startswith("2027-01-03")


def test_orden_declarar_lleva_todo():
    a = L.orden_declarar(L.parsear_usage(USAGE, AHORA))
    assert a[2] == "declarar" and "--sesion" in a and "--semana" in a and "--modelo-nombre" in a
    assert a[a.index("--fuente") + 1] == "lector"
