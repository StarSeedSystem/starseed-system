#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para la prioridad de tareas en la cola (PRI01)."""

import importlib.util
import os
import sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

prioridad_de_tarea = enjambre.prioridad_de_tarea
ordenar_pendientes = enjambre.ordenar_pendientes


def test_sin_prioridades_el_orden_no_cambia():
    """Sin prioridades el orden no cambia."""
    tareas = [
        {"id": "A", "titulo": "Tarea A"},
        {"id": "B", "titulo": "Tarea B"},
        {"id": "C", "titulo": "Tarea C"},
    ]
    resultado = ordenar_pendientes(tareas)
    assert [t["id"] for t in resultado] == ["A", "B", "C"]


def test_prioridad_numerica_pasa_delante():
    """Una tarea con prioridad 50 pasa delante de las de 0."""
    tareas = [
        {"id": "A", "titulo": "Tarea A", "prioridad": 0},
        {"id": "B", "titulo": "Tarea B", "prioridad": 50},
        {"id": "C", "titulo": "Tarea C", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    assert [t["id"] for t in resultado] == ["B", "A", "C"]


def test_urgente_true_vale_100():
    """urgente: true vale 100."""
    tareas = [
        {"id": "A", "titulo": "Tarea A", "prioridad": 0},
        {"id": "B", "titulo": "Tarea B", "urgente": True},
        {"id": "C", "titulo": "Tarea C", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    assert [t["id"] for t in resultado] == ["B", "A", "C"]


def test_titulo_urgente_vale_100():
    """Título que empieza por 'URGENTE' vale 100."""
    tareas = [
        {"id": "A", "titulo": "Tarea A", "prioridad": 0},
        {"id": "B", "titulo": "URGENTE: arreglar compilación"},
        {"id": "C", "titulo": "Tarea C", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    assert [t["id"] for t in resultado] == ["B", "A", "C"]


def test_igualdad_conserva_orden_llegada():
    """A igualdad se conserva el orden de llegada."""
    tareas = [
        {"id": "A", "titulo": "Tarea A", "prioridad": 10},
        {"id": "B", "titulo": "Tarea B", "prioridad": 10},
        {"id": "C", "titulo": "Tarea C", "prioridad": 5},
    ]
    resultado = ordenar_pendientes(tareas)
    assert [t["id"] for t in resultado] == ["A", "B", "C"]


def test_valores_raros_no_lanzan_y_valen_0():
    """Valores raros (None, texto, lista) valen 0 y no lanzan."""
    tareas = [
        {"id": "A", "titulo": "Tarea A", "prioridad": None},
        {"id": "B", "titulo": "Tarea B", "prioridad": "alta"},
        {"id": "C", "titulo": "Tarea C", "prioridad": [1, 2, 3]},
        {"id": "D", "titulo": "Tarea D", "prioridad": 10},
    ]
    resultado = ordenar_pendientes(tareas)
    assert [t["id"] for t in resultado] == ["D", "A", "B", "C"]


def test_lista_devuelta_tiene_mismos_elementos():
    """La lista devuelta tiene los mismos elementos (ni más ni menos)."""
    tareas = [
        {"id": "A", "titulo": "Tarea A"},
        {"id": "B", "titulo": "Tarea B", "prioridad": 5},
    ]
    resultado = ordenar_pendientes(tareas)
    assert len(resultado) == 2
    ids = {t["id"] for t in resultado}
    assert ids == {"A", "B"}


def test_prioridad_de_tarea_devuelve_float():
    """prioridad_de_tarea devuelve float."""
    assert prioridad_de_tarea({"prioridad": 50}) == 50.0
    assert prioridad_de_tarea({"urgente": True}) == 100.0
    assert prioridad_de_tarea({"titulo": "URGENTE: algo"}) == 100.0
    assert prioridad_de_tarea({}) == 0.0
    assert prioridad_de_tarea({"prioridad": None}) == 0.0
    assert prioridad_de_tarea({"prioridad": "texto"}) == 0.0
    assert prioridad_de_tarea({"prioridad": [1, 2]}) == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])