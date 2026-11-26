"""DIR1125V: la pausa de producción del MCP de la dirección y la del autopublicador son la misma."""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mcp_director as M  # noqa: E402


def _escribir(datos):
    d = tempfile.mkdtemp()
    ruta = os.path.join(d, "pausada.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    return ruta


def test_un_archivo_reanudado_con_pausada_false_no_es_pausa():
    assert M.pausa_activa(_escribir({"pausada": False, "reanudada": "2026-11-15"})) is False


def test_sin_archivo_no_hay_pausa_y_un_archivo_antiguo_sin_campo_si():
    assert M.pausa_activa("/no/existe/pausada.json") is False
    assert M.pausa_activa(_escribir({"desde": "x", "quien": "jev", "motivo": "m"})) is True
    assert M.pausa_activa(_escribir({"pausada": True})) is True


def test_pausar_escribe_el_campo_que_lee_el_autopublicador(monkeypatch):
    ruta = os.path.join(tempfile.mkdtemp(), "pausada.json")
    monkeypatch.setenv("STARSEED_PRODUCCION_PAUSA", ruta)
    M._escribir_pausa("director-presidente", "prueba")
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    assert datos["pausada"] is True and datos["quien"] == "director-presidente"
