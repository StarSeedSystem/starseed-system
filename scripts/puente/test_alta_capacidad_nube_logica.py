#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del carril de alta capacidad en la nube (ola 1022A): puro, sin red y sin reloj."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402

import alta_capacidad_nube_logica as L  # noqa: E402

VENCE = datetime(2026, 11, 5, 1, 59, tzinfo=timezone(timedelta(hours=-6)))


def _credito(restante=250.0, dias=13.0):
    return {"total_usd": 250, "restante_usd": restante, "vence": VENCE.isoformat()}, VENCE.timestamp() - dias * 86400.0


def test_cupo_con_credito_vencido():
    cred, _ = _credito()
    se_lanza, motivo, presupuesto = L.cupo_nube(cred, VENCE.timestamp() + 7200.0, 0)
    assert se_lanza is False and presupuesto == 0.0
    assert "venció" in motivo


def test_cupo_sin_vence_legible():
    se_lanza, motivo, _ = L.cupo_nube({"restante_usd": 250.0}, 1763769600.0, 0)
    assert se_lanza is False and "vencimiento" in motivo


def test_cupo_sin_saldo_declarado():
    """Un crédito sin `restante_usd` no es crédito: no se gasta ni por error."""
    se_lanza, motivo, presupuesto = L.cupo_nube({"vence": VENCE.isoformat()}, 1763769600.0, 0)
    assert se_lanza is False and presupuesto == 0.0
    assert "saldo" in motivo


def test_cupo_por_debajo_de_la_reserva():
    cred, ahora = _credito(restante=10.0)
    se_lanza, motivo, _ = L.cupo_nube(cred, ahora, 0)
    assert se_lanza is False and "reserva" in motivo


def test_cupo_tope_de_sesiones_vivas():
    cred, ahora = _credito()
    assert L.cupo_nube(cred, ahora, 3)[0] is False
    assert L.cupo_nube(cred, ahora, 3, max_vivas=3)[1].startswith("ya hay 3")
    se_lanza, _, _ = L.cupo_nube(cred, ahora, 2)
    assert se_lanza is True


def test_presupuesto_de_hoy_con_13_dias():
    cred, ahora = _credito(restante=250.0, dias=13.0)
    se_lanza, _, presupuesto = L.cupo_nube(cred, ahora, 0)
    assert se_lanza is True
    assert abs(presupuesto - (250.0 - 10.0) / 13.0) < 1e-9


def test_presupuesto_de_hoy_con_medio_dia_no_pierde_la_reserva():
    cred, ahora = _credito(restante=250.0, dias=0.5)
    _, _, presupuesto = L.cupo_nube(cred, ahora, 0)
    assert abs(presupuesto - 240.0) < 1e-9


def test_rama_pedida_sigue_el_formato_de_traer_nube():
    assert L.rama_pedida("ALT1022A", "20261022") == "nube/cc-20261022/ola/ALT1022A"


def test_orden_cli_en_ese_orden():
    assert L.orden_cli("claude-opus-5-5", "carril 1022A") == ["claude", "--model", "claude-opus-5-5", "--cloud", "carril 1022A"]


def test_orden_cli_sin_descripcion_rechaza():
    with pytest.raises(ValueError):
        L.orden_cli("claude-opus-5-5", "")
    with pytest.raises(ValueError):
        L.orden_cli("claude-opus-5-5", "   ")


def test_modelo_que_empieza_por_guion_rechazado():
    with pytest.raises(ValueError):
        L.orden_cli("-cloud", "algo")


TAREA = {"id": "ALT1022A", "titulo": "Carril en la nube", "archivos": ["x.ts", "y.py"],
         "prompt": "Haz {ID} con {FECHA} y la llave {PROMPT} sin tocar nada más"}


PLANTILLA = """Ola: {ID} · {TITULO}
Fecha: {FECHA}
Archivos: {ARCHIVOS}

{PROMPT}"""


def test_brief_sustituye_los_marcadores():
    salida = L.brief(PLANTILLA, TAREA, "20261022")
    assert salida.startswith("Ola: ALT1022A · Carril en la nube")
    assert "Fecha: 20261022" in salida
    assert "Archivos: x.ts, y.py" in salida


def test_brief_no_toca_las_llaves_del_prompt():
    salida = L.brief(PLANTILLA, TAREA, "20261022")
    cuerpo = "Haz {ID} con {FECHA} y la llave {PROMPT} sin tocar nada más"
    assert cuerpo in salida and salida.endswith(cuerpo)


def test_brief_con_archivos_escritos_como_texto():
    tarea = dict(TAREA, archivos="uno.ts, dos.py")
    assert "uno.ts, dos.py" in L.brief(PLANTILLA, tarea, "20261022")


def test_brief_con_la_plantilla_real_del_carril():
    """La plantilla de `scripts/puente/plantillas/` y el módulo no pueden separarse."""
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plantillas", "alta-capacidad-nube.md")
    with open(ruta, encoding="utf-8") as f:
        plantilla = f.read()
    tarea = {"id": "ALT1022A", "titulo": "Carril en la nube",
             "archivos": ["scripts/puente/alta_capacidad_nube_logica.py"],
             "prompt": "Escribe el módulo. {ID} es el identificador y {FECHA} la fecha."}
    salida = L.brief(plantilla, tarea, "20261022")
    # Los marcadores de la PLANTILLA se sustituyen todos…
    cabeza = salida.split(tarea["prompt"])[0]
    for marcador in ("{ID}", "{TITULO}", "{FECHA}", "{ARCHIVOS}", "{PROMPT}"):
        assert marcador not in cabeza, "quedó el marcador %s sin sustituir" % marcador
    # …y las llaves del PROMPT se quedan como estaban.
    assert tarea["prompt"] in salida
    assert "La tarea ALT1022A" in salida
    assert "Título: Carril en la nube" in salida
    assert "scripts/puente/alta_capacidad_nube_logica.py" in salida
    # La rama que la plantilla manda empujar es la que `rama_pedida` construye.
    assert L.rama_pedida("ALT1022A", "20261022") in salida


SALIDA_REAL = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
               "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")


def test_sesion_de_salida_real_con_ansi():
    dato = L.sesion_de_salida(SALIDA_REAL)
    assert dato == {"sesion": "session_01HW1xkHMRPYXUF5bjHiWxyd",
                    "url": "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd",
                    "titulo": "Canal P2P"}


def test_sesion_de_salida_sin_view_devuelve_none():
    assert L.sesion_de_salida("\x1b[>4m sin nada útil\r\notra línea") is None
    assert L.sesion_de_salida("") is None


def test_sesion_de_salida_entre_ruido_de_terminal():
    """El CLI escupe OSC y CSI antes de la sesión: se limpian sin comerse el enlace."""
    ruido = ("\x1b]0;claude\x07\x1b[?25l\x1b[1mCreated cloud session: Canal P2P\x1b[0m\r\n"
             "  View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0\r\n")
    dato = L.sesion_de_salida(ruido)
    assert dato["sesion"] == "session_01HW1xkHMRPYXUF5bjHiWxyd"
    assert dato["url"] == "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd"
    assert dato["titulo"] == "Canal P2P"


def _registro(t=0.0, rama="nube/cc-20261022/ola/zN9", tarea="zN9"):
    return {"sesiones": [{"tarea": tarea, "sesion": "session_01HW", "url": "https://claude.ai/code/session_01HW",
                          "rama_pedida": rama, "modelo": "claude-opus-5-5", "t": t}]}


PROGRESO = {"zN9": {"estado": "reasignada", "medio": "claude-nube"},
            "cero": {"estado": "pendiente"},
            "otro": {"estado": "reasignada", "medio": "oracle"}}


def _ahora(horas):
    return datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc).timestamp() + horas * 3600.0


def test_seg_traer():
    """La rama ya está remota e integrada: tráela con traer_nube tras pasarla a pendiente."""
    res = L.seguir(_registro(), {"nube/cc-20261022/ola/zN9"}, PROGRESO, _ahora(0))
    assert res["zN9"] == "traer"


def test_seg_devolver_tras_la_gracia():
    res = L.seguir(_registro(t=_ahora(0) - 9 * 3600.0), set(), PROGRESO, _ahora(0), gracia_h=8.0)
    assert res["zN9"] == "devolver"


def test_seg_gracia_exacta_aun_espera():
    res = L.seguir(_registro(t=_ahora(0) - 8 * 3600.0), set(), PROGRESO, _ahora(0))
    assert res["zN9"] == "esperar"


def test_seg_esperar_con_entrada_reciente():
    res = L.seguir(_registro(t=_ahora(0) - 30 * 60.0), set(), PROGRESO, _ahora(0))
    assert res["zN9"] == "esperar"


def test_seg_olvidar_la_tarea_que_dejo_de_estar_prestada():
    res = L.seguir(_registro(t=_ahora(0) - 20 * 3600.0, rama="", tarea="zero"), set(), PROGRESO, _ahora(0))
    assert res["zero"] == "olvidar"


def test_seg_olvidar_aunque_la_rama_este_remota():
    """«traer» exige las DOS cosas: rama remota Y tarea aún prestada al carril."""
    reg = _registro(t=_ahora(0), tarea="zero")
    res = L.seguir(reg, {"nube/cc-20261022/ola/zN9"}, PROGRESO, _ahora(0))
    assert res["zero"] == "olvidar"


def test_seg_olvidar_lo_que_no_es_del_carril():
    """Una tarea reasignada a otro medio no es de este carril: se olvida."""
    reg = _registro(t=_ahora(0), tarea="otro")
    assert L.seguir(reg, set(), PROGRESO, _ahora(0))["otro"] == "olvidar"


def test_seg_con_fecha_ilegible_no_se_juzga_devolver():
    reg = _registro()
    reg["sesiones"][0]["t"] = "ayer sin formato"
    assert L.seguir(reg, set(), PROGRESO, _ahora(0))["zN9"] == "esperar"


def test_sesiones_vivas_por_medio():
    reg = {**_registro(), "sesiones": [
        {"tarea": "zN9", "t": 0.0, "rama_pedida": ""},
        {"tarea": "cero", "t": 0.0, "rama_pedida": ""},
        {"tarea": "otro", "t": 0.0, "rama_pedida": ""},
        {"tarea": "no_esta", "t": 0.0, "rama_pedida": ""}]}
    vivas = L.sesiones_vivas(reg, PROGRESO)
    assert vivas == 1
    assert L.sesiones_vivas({}, PROGRESO) == 0
