"""Configuración de pytest para scripts/puente (COL1012Md-d1).

POR QUÉ existe: esta carpeta tiene `__init__.py`, así que pytest (modo de importación «prepend») sube
hasta la primera carpeta SIN `__init__.py` y mete en `sys.path` `scripts/`, no `scripts/puente/`. Los
módulos del puente se importan unos a otros por nombre simple (`import produccion_puentes`), y con
`python3 -m unittest discover -s scripts/puente` eso funciona porque unittest sí añade la carpeta de
inicio. Con pytest, cada prueba que no hiciera su propio `sys.path.insert` moría en la recogida con
`ModuleNotFoundError` (medido el 2026-10-20: 29 de los 188 `test_*.py`).

Eso importa más de lo que parece: `traer_nube._puertas` corre `python -m pytest` sobre la prueba
hermana de cada `.py` que toca una rama de la nube, así que un fallo de RECOGIDA (no de una aserción)
hacía caer la puerta de tareas correctas y las dejaba «bloqueadas» sin que nadie hubiera roto nada.

Aquí se hace lo que unittest hace solo: la carpeta de este archivo pasa a `sys.path`, una sola vez y
sin duplicar. No cambia ninguna prueba que ya hacía su `sys.path.insert` (el lugar nuevo queda detrás de
los suyos, o delante con el mismo valor: da igual, es la misma carpeta).
"""
import os
import sys

_CARPETA = os.path.dirname(os.path.abspath(__file__))

if _CARPETA not in sys.path:
    sys.path.insert(0, _CARPETA)
