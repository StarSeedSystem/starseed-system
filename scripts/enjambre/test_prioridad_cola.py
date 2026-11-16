"""Pruebas de prioridad de tareas (PRI01): prioridad_de_tarea y ordenar_pendientes.

Validan las dos funciones PURAS añadidas a starseed-enjambre.py sin interrumpir
ningún proceso en curso.
"""
import importlib.util
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("starseed_enjambre", RUTA)
starseed = importlib.util.module_from_spec(ESPEC)
sys.modules["starseed_enjambre"] = starseed
ESPEC.loader.exec_module(starseed)

prioridad_de_tarea = starseed.prioridad_de_tarea
ordenar_pendientes = starseed.ordenar_pendientes


def test_sin_prioridades_orden_no_cambia():
    """Sin prioridades el orden no cambia (todos 0)."""
    tareas = [
        {"id": "a", "titulo": "Tarea A"},
        {"id": "b", "titulo": "Tarea B"},
        {"id": "c", "titulo": "Tarea C"},
    ]
    resultado = ordenar_pendientes(tareas)
    assert resultado == tareas


def test_prioridad_50_pasa_delante_de_0():
    """Una tarea con prioridad 50 pasa delante de las de 0."""
    tareas = [
        {"id": "a", "titulo": "Tarea A", "prioridad": 0},
        {"id": "b", "titulo": "Tarea B", "prioridad": 50},
        {"id": "c", "titulo": "Tarea C", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["id"] for t in resultado]
    assert ids == ["b", "a", "c"]


def test_urgente_true_vale_100():
    """urgente: true vale 100, pasa delante de prioridad 0."""
    tareas = [
        {"id": "a", "titulo": "Tarea A", "urgente": True},
        {"id": "b", "titulo": "Tarea B", "prioridad": 50},
        {"id": "c", "titulo": "Tarea C"},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["id"] for t in resultado]
    assert ids == ["a", "b", "c"]


def test_titulo_URGENTE_vale_100_sin_prioridad():
    """Título URGENTE vale 100 cuando NO hay prioridad numérica."""
    tareas = [
        {"id": "a", "titulo": "URGENTE: arreglar error"},  # sin prioridad
        {"id": "b", "titulo": "Tarea normal", "prioridad": 50},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["id"] for t in resultado]
    assert ids == ["a", "b"]  # URGENTE (100) pasa delante de prioridad 50


def test_a_igualdad_se_conserva_orden_llegada():
    """A igualdad de prioridad, se conserva el orden de llegada (orden estable)."""
    tareas = [
        {"id": "c", "titulo": "Tarea C", "prioridad": 0},
        {"id": "a", "titulo": "Tarea A", "prioridad": 0},
        {"id": "b", "titulo": "Tarea B", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["id"] for t in resultado]
    assert ids == ["c", "a", "b"]


def test_valores_raros_valen_0_y_no_lanzan():
    """None, texto y lista como prioridad valen 0 y no lanzan excepción."""
    tareas = [
        {"id": "a", "titulo": "A", "prioridad": None},
        {"id": "b", "titulo": "B", "prioridad": "texto"},
        {"id": "c", "titulo": "C", "prioridad": [1, 2]},
        {"id": "d", "titulo": "D"},  # sin clave prioridad -> 0.0
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["id"] for t in resultado]
    # Todos valen 0.0, orden estable: el que viene primero en la lista original mantiene posición relativa
    assert ids == ["a", "b", "c", "d"]  # orden estable, todos iguales


def test_lista_devuelta_tiene_mismos_elementos():
    """La lista devuelta tiene los mismos elementos (misma cantidad, mismos ids)."""
    tareas = [
        {"id": "x", "titulo": "X", "prioridad": 10},
        {"id": "y", "titulo": "Y", "prioridad": 20},
        {"id": "z", "titulo": "Z", "prioridad": 5},
    ]
    resultado = ordenar_pendientes(tareas)
    assert len(resultado) == len(tareas)
    ids = {t["id"] for t in resultado}
    assert ids == {"x", "y", "z"}


def test_prioridad_de_tarea_numerica():
    """prioridad_de_tarea devuelve el número cuando existe y es número."""
    assert prioridad_de_tarea({"prioridad": 42}) == 42.0
    assert prioridad_de_tarea({"prioridad": 3.14}) == 3.14


def test_prioridad_de_tarea_urgente():
    """prioridad_de_tarea devuelve 100 cuando urgente es true."""
    assert prioridad_de_tarea({"urgente": True, "titulo": "normal"}) == 100.0


def test_prioridad_de_tarea_titulo_urgente_sin_prioridad():
    """prioridad_de_tarea devuelve 100 cuando título empieza por 'URGENTE' y no hay prioridad numérica."""
    assert prioridad_de_tarea({"titulo": "URGENTE: arreglar"}) == 100.0


def test_prioridad_de_tarea_prioridad_sobre_urgente():
    """prioridad_numérica tiene precedencia sobre URGENTE en el título."""
    assert prioridad_de_tarea({"prioridad": 0, "titulo": "URGENTE: arreglar"}) == 0.0


def test_prioridad_de_tarea_sin_prioridad():
    """prioridad_de_tarea devuelve 0 cuando no hay prioridad ni urgente."""
    assert prioridad_de_tarea({"titulo": "normal"}) == 0.0
    assert prioridad_de_tarea({}) == 0.0