# -*- coding: utf-8 -*-
"""Ola 1103 · M: el atraso sale de la línea del reparto, no del primer número de la salida."""
import importlib.util
import os

_s = importlib.util.spec_from_file_location("dn1103", os.path.join(os.path.dirname(__file__), "director-nube.py"))
DN = importlib.util.module_from_spec(_s)
_s.loader.exec_module(DN)


def test_atraso_de_la_linea_del_reparto():
    salida = ("[reparto] en vuelo en la nube (colas de la última hora y cuarto): 6 tarea(s), no se reenvían\n"
              "[reparto] tanda viva de la Mac: 86 tarea(s); cedibles 35; cedidas a la nube 0 (ninguna)\n"
              "[reparto] Reparto a la nube 20261102: 0 tareas (ninguna) (simulación)\n")
    assert DN.atraso_de(salida) == 0
    assert DN.atraso_de("[reparto] Reparto a la nube 20261102: 4 tareas (A, B, C, D) (simulación)") == 4
    assert DN.atraso_de("") == 0
