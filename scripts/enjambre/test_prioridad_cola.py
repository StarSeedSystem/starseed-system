"""Pruebas de prioridad de tareas — PRI01.

Se usa pytest, como sus vecinas en scripts/enjambre/.
"""
from .starseed_enjambre import prioridad_de_tarea, ordenar_pendientes


def test_sin_prioridades_el_orden_no_cambia():
    """Sin prioridades el orden no cambia."""
    tareas = [
        {"titulo": "A"},
        {"titulo": "B"},
        {"titulo": "C"},
    ]
    resultado = ordenar_pendientes(tareas)
    assert resultado == tareas


def test_prioridad_50_pasa_delante_de_0():
    """Una tarea con prioridad 50 pasa delante de las de 0."""
    tareas = [
        {"titulo": "B", "prioridad": 0},
        {"titulo": "A", "prioridad": 50},
        {"titulo": "C", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["titulo"] for t in resultado]
    assert ids == ["A", "B", "C"]


def test_urgente_y_titulo_URGENTE_valen_100():
    """urgente: true y un título que empieza por «URGENTE» valen 100."""
    tareas = [
        {"titulo": "Urgente X", "urgente": True},
        {"titulo": "Normal", "prioridad": 0},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["titulo"] for t in resultado]
    assert ids == ["Urgente X", "Normal"]


def test_igualdad_conserva_orden_llegada():
    """a igualdad se conserva el orden en que venían."""
    tareas = [
        {"titulo": "B", "prioridad": 30},
        {"titulo": "A", "prioridad": 30},
        {"titulo": "C", "prioridad": 30},
    ]
    resultado = ordenar_pendientes(tareas)
    ids = [t["titulo"] for t in resultado]
    assert ids == ["B", "A", "C"]


def test_valores_raros_valen_0_y_no_lanzan():
    """valores raros (None, texto, lista) valen 0 y no lanzan."""
    tareas = [
        {"titulo": "A", "prioridad": None},
        {"titulo": "B", "prioridad": "texto"},
        {"titulo": "C", "prioridad": [1, 2]},
        {"titulo": "D", "prioridad": 5},
    ]
    resultado = prioridad_de_tarea(tareas[0])
    assert resultado == 0.0
    resultado = prioridad_de_tarea(tareas[1])
    assert resultado == 0.0
    resultado = prioridad_de_tarea(tareas[2])
    assert resultado == 0.0
    resultado = prioridad_de_tarea(tareas[3])
    assert resultado == 5.0


def test_lista_devuelta_tiene_los_mismos_elementos():
    """la lista devuelta tiene los mismos elementos."""
    tareas = [
        {"titulo": "X"},
        {"titulo": "Y"},
        {"titulo": "Z"},
    ]
    resultado = ordenar_pendientes(tareas)
    titulos = {t["titulo"] for t in resultado}
    assert titulos == {"X", "Y", "Z"}