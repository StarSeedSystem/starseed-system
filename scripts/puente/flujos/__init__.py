"""Núcleo público de los Flujos de Genesis."""

from .modelo import (Conexion, Ejecucion, Flujo, Nodo, cargar_flujo,
                      guardar_flujo, orden_topologico, validar_flujo)
from .motor import REGISTRO, ejecutar, reanudar

# Importar nodos y registrar los ejecutores en el REGISTRO global
from . import nodos
nodos.registrar(REGISTRO)

__all__ = [
    "Conexion", "Ejecucion", "Flujo", "Nodo", "REGISTRO",
    "cargar_flujo", "ejecutar", "guardar_flujo", "orden_topologico",
    "reanudar", "validar_flujo",
]
