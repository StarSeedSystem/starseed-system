# -*- coding: utf-8 -*-
"""El cambio pedido desde el Puente tiene que llegar al agente (2026-09-23).

`cambio_pedido` se escribía en progreso.json y nadie lo leía: el reintento salía con el
mismo prompt, y una bloqueada por una dependencia muerta se volvía a bloquear sola.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cambio_pedido import MARCA, aplicar_a_todas, aplicar_cambio_pedido  # noqa: E402

TAREA = {"id": "CU3br", "prompt": "Haz X.", "depende": ["CU3r", "OK1"]}


def test_sin_cambio_la_tarea_no_se_toca():
    assert aplicar_cambio_pedido(TAREA, {"estado": "pendiente"}) is TAREA
    assert aplicar_cambio_pedido(TAREA, None) is TAREA


def test_el_cambio_se_anade_al_prompt_marcado():
    t = aplicar_cambio_pedido(TAREA, {"cambio_pedido": "Hazla sin CU3r."})
    assert t["prompt"].startswith("Haz X.")
    assert MARCA in t["prompt"]
    assert t["prompt"].rstrip().endswith("Hazla sin CU3r.")


def test_el_cambio_no_se_duplica_si_ya_esta():
    una = aplicar_cambio_pedido(TAREA, {"cambio_pedido": "A"})
    dos = aplicar_cambio_pedido(una, {"cambio_pedido": "A"})
    assert dos["prompt"].count(MARCA) == 1


def test_las_dependencias_muertas_salen_y_las_vivas_se_quedan():
    t = aplicar_cambio_pedido(TAREA, {"cambio_pedido": "x", "quitar_dependencias": ["CU3r"]})
    assert t["depende"] == ["OK1"]


def test_la_original_no_se_modifica():
    aplicar_cambio_pedido(TAREA, {"cambio_pedido": "x", "quitar_dependencias": ["CU3r"]})
    assert TAREA["depende"] == ["CU3r", "OK1"]
    assert TAREA["prompt"] == "Haz X."


def test_aplicar_a_todas_usa_la_entrada_de_cada_una():
    tareas = [TAREA, {"id": "B", "prompt": "Y"}]
    fuera = aplicar_a_todas(tareas, {"CU3br": {"quitar_dependencias": ["CU3r", "OK1"]}})
    assert fuera[0]["depende"] == []
    assert fuera[1] is tareas[1]
