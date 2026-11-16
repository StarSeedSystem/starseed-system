# -*- coding: utf-8 -*-
"""PRI01: prioridad de las tareas pendientes de una cola, sin interrumpir las activas."""

import importlib.util
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(AQUI, "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_pri01", RUTA)
assert ESPEC is not None and ESPEC.loader is not None
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_pri01"] = enjambre
ESPEC.loader.exec_module(enjambre)


def test_sin_prioridades_no_cambia_el_orden():
    tareas = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert [t["id"] for t in enjambre.ordenar_pendientes(tareas)] == ["a", "b", "c"]


def test_prioridad_explicita_pasa_delante():
    tareas = [{"id": "normal"}, {"id": "compilacion", "prioridad": 50}]
    orden = enjambre.ordenar_pendientes(tareas)
    assert enjambre.prioridad_de_tarea(tareas[1]) == 50.0
    assert [t["id"] for t in orden] == ["compilacion", "normal"]


def test_urgente_explicita_vale_cien():
    assert enjambre.prioridad_de_tarea({"id": "a", "urgente": True}) == 100.0


def test_titulo_urgente_vale_cien():
    tarea = {"id": "a", "titulo": "URGENTE · compila el proyecto"}
    assert enjambre.prioridad_de_tarea(tarea) == 100.0


def test_igual_prioridad_conserva_el_orden_de_llegada():
    tareas = [{"id": "primera"}, {"id": "segunda"}, {"id": "tercera"}]
    orden = enjambre.ordenar_pendientes(tareas)
    assert [t["id"] for t in orden] == ["primera", "segunda", "tercera"]


def test_valores_raros_valen_cero_y_no_lanzan():
    for valor in (None, "mucha", [50]):
        tarea = {"id": "a", "prioridad": valor}
        assert enjambre.prioridad_de_tarea(tarea) == 0.0
    assert enjambre.prioridad_de_tarea(None) == 0.0


def test_la_lista_devuelta_tiene_los_mismos_elementos():
    tareas = [{"id": "a"}, {"id": "b", "prioridad": 50}]
    orden = enjambre.ordenar_pendientes(tareas)
    assert len(orden) == len(tareas)
    assert {t["id"] for t in orden} == {"a", "b"}
    assert all(any(devuelta is original for devuelta in orden) for original in tareas)
