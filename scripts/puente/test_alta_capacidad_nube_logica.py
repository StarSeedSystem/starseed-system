# -*- coding: utf-8 -*-
"""Pruebas de alta_capacidad_nube_logica.py (Ola 1022C, ALT1022A): todo puro, sin red ni reloj."""
import os
import sys
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alta_capacidad_nube_logica as L  # noqa: E402

AHORA = datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc).timestamp()
DIA = 86400.0


def credito(restante=250, vence="2026-11-04T12:00:00+00:00"):
    return {"total_usd": 250, "restante_usd": restante, "vence": vence}


PRESTADA = {"estado": "reasignada", "medio": "claude-nube"}


# ── cupo_nube ──
def test_cupo_credito_vencido():
    ok, motivo, hoy = L.cupo_nube(credito(vence="2026-10-21T00:00:00-06:00"), AHORA, 0)
    assert not ok and "venció" in motivo and hoy == 0


def test_cupo_sin_vence_no_lanza():
    ok, motivo, _ = L.cupo_nube({"restante_usd": 200}, AHORA, 0)
    assert not ok and "vence" in motivo


def test_cupo_por_debajo_de_la_reserva():
    ok, motivo, _ = L.cupo_nube(credito(restante=10), AHORA, 0)
    assert not ok and "reserva" in motivo


def test_cupo_tope_de_vivas():
    ok, motivo, hoy = L.cupo_nube(credito(), AHORA, 3, max_vivas=3)
    assert not ok and "vivas" in motivo and hoy > 0


def test_presupuesto_con_13_dias():
    ok, _, hoy = L.cupo_nube(credito(restante=140), AHORA, 0)
    assert ok and hoy == pytest.approx((140 - 10) / 13, abs=0.01)


def test_presupuesto_con_medio_dia_cuenta_uno():
    vence = datetime.fromtimestamp(AHORA + DIA / 2, timezone.utc).isoformat()
    ok, _, hoy = L.cupo_nube(credito(restante=50, vence=vence), AHORA, 0)
    assert ok and hoy == pytest.approx(40.0)


# ── rama, orden y brief ──
def test_rama_pedida():
    assert L.rama_pedida("ALT1022A", "20261022") == "nube/cc-20261022/ola/ALT1022A"


def test_orden_cli_en_su_orden():
    assert L.orden_cli("sonnet", "Haz X") == ["claude", "--model", "sonnet", "--cloud", "Haz X"]


def test_orden_cli_rechaza_vacia_y_modelo_opcion():
    with pytest.raises(ValueError):
        L.orden_cli("sonnet", "  ")
    with pytest.raises(ValueError):
        L.orden_cli("--cloud", "Haz X")


def test_brief_no_toca_llaves_del_prompt():
    plantilla = "{ID} · {TITULO} · {FECHA}\n{ARCHIVOS}\n{PROMPT}"
    tarea = {"id": "T1", "titulo": "Título", "archivos": ["a.py", "b.py"],
             "prompt": "usa {ID} y {\"x\": 1} literal"}
    assert L.brief(plantilla, tarea, "20261022") == (
        "T1 · Título · 20261022\na.py, b.py\nusa {ID} y {\"x\": 1} literal")


# ── sesion_de_salida ──
def test_sesion_de_salida_real_con_ansi():
    texto = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
             "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")
    assert L.sesion_de_salida(texto) == {
        "sesion": "session_01HW1xkHMRPYXUF5bjHiWxyd",
        "url": "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd",
        "titulo": "Canal P2P"}


def test_sesion_de_salida_sin_view():
    assert L.sesion_de_salida("Error: --cloud requires an interactive terminal") is None


# ── seguir y vivas ──
def _registro(*tareas, t=AHORA - 3600):
    return {"sesiones": [{"tarea": x, "sesion": "session_" + x, "url": "u/" + x,
                          "rama_pedida": L.rama_pedida(x, "20261022"), "t": t} for x in tareas]}


def test_seguir_trae_con_rama():
    reg = _registro("A")
    assert L.seguir(reg, {L.rama_pedida("A", "20261022")}, {"A": PRESTADA}, AHORA) == {"A": "traer"}


def test_seguir_espera_sin_rama_dentro_de_la_gracia():
    assert L.seguir(_registro("A"), set(), {"A": PRESTADA}, AHORA) == {"A": "esperar"}


def test_seguir_devuelve_pasada_la_gracia():
    reg = _registro("A", t=AHORA - 9 * 3600)
    assert L.seguir(reg, set(), {"A": PRESTADA}, AHORA, gracia_h=8) == {"A": "devolver"}


def test_seguir_gracia_exacta_aun_espera():
    # Límite exacto de la gracia (8 h con la por defecto): no se juzga aún, se espera.
    reg = _registro("A", t=AHORA - 8 * 3600)
    assert L.seguir(reg, set(), {"A": PRESTADA}, AHORA) == {"A": "esperar"}


def test_seguir_olvida_lo_que_ya_no_esta_prestada():
    reg = _registro("A")
    assert L.seguir(reg, {L.rama_pedida("A", "20261022")}, {"A": {"estado": "commit"}}, AHORA) == {"A": "olvidar"}


def test_seguir_olvida_aunque_pase_la_gracia():
    # «olvidar» manda sobre «devolver»: una sesión vieja (20 h) de una tarea ya no prestada no se devuelve.
    reg = _registro("A", t=AHORA - 20 * 3600)
    assert L.seguir(reg, set(), {"A": {"estado": "commit"}}, AHORA) == {"A": "olvidar"}


def test_seguir_ignora_las_ya_cerradas():
    reg = _registro("A")
    reg["sesiones"][0]["final"] = "traida"
    assert L.seguir(reg, set(), {}, AHORA) == {}


def test_sesiones_vivas():
    prog = {"A": PRESTADA, "B": {"estado": "reasignada", "medio": "a1"}}
    assert L.sesiones_vivas(_registro("A", "B", "C"), prog) == 1


# ── modelo_para ──
def test_modelo_para_alta_capacidad():
    assert L.modelo_para({"id": "X", "alta_capacidad": True}) == "claude-opus-5-5"


def test_modelo_para_tres_archivos():
    assert L.modelo_para({"id": "X", "archivos": ["a", "b", "c"]}) == "claude-opus-5-5"


def test_modelo_para_ya_fallo():
    assert L.modelo_para({"id": "X", "archivos": ["a"]}, {"intentos_auto": 2}) == "claude-opus-5-5"
    assert L.modelo_para({"id": "X", "modelos_fallidos": ["nim/kimi"]}) == "claude-opus-5-5"


def test_modelo_para_sencilla_va_a_sonnet():
    assert L.modelo_para({"id": "X", "archivos": ["a", "b"]}) == "sonnet"
    assert L.coste_estimado("sonnet") == 1.0 and L.coste_estimado("claude-opus-5-5") == 3.0


# ── candidatas y elegir_auto ──
def test_candidatas_filtra_y_ordena():
    colas = [("cola-2.json", [
        {"id": "VIEJA", "archivos": ["a"]},
        {"id": "DEP", "archivos": ["a"], "depende": ["NO"]},
        {"id": "PRIV", "archivos": ["a"], "privada": True},
        {"id": "FALLO", "archivos": ["a"], "intentos_auto": 3},
        {"id": "GRANDE", "archivos": ["a", "b", "c"]},
        {"id": "ALTA", "archivos": ["a"], "alta_capacidad": True, "depende": ["SI"]},
        {"id": "HECHA", "archivos": ["a"]},
        {"id": "REG", "archivos": ["a"]},
    ]), ("cola-1.json", [{"id": "VIEJA", "archivos": ["x", "y", "z"]}])]
    progreso = {"SI": {"estado": "integrada"}, "NO": {"estado": "pendiente"}, "HECHA": {"estado": "commit"}}
    ids = [t["id"] for t, _ in L.candidatas(colas, progreso, _registro("REG"))]
    assert ids == ["ALTA", "GRANDE", "FALLO", "VIEJA"]


def test_elegir_auto_respeta_huecos_y_presupuesto():
    cands = [({"id": "A", "alta_capacidad": True}, "c"), ({"id": "B"}, "c"), ({"id": "C"}, "c")]
    elegidas = L.elegir_auto(cands, vivas=1, max_vivas=4, presupuesto_hoy=4.5, gastado=0)
    assert [(t["id"], m) for t, _, m, _ in elegidas] == [("A", "claude-opus-5-5"), ("B", "sonnet")]
    assert L.elegir_auto(cands, vivas=4, max_vivas=4, presupuesto_hoy=99, gastado=0) == []
    assert len(L.elegir_auto(cands, vivas=0, max_vivas=4, presupuesto_hoy=99, gastado=0, maximo=1)) == 1
