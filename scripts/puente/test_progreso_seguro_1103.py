# -*- coding: utf-8 -*-
"""Ola 1103 · N: el director de orquestación escribe solo lo que cambió, sobre la versión de ahora."""
import contextlib
import importlib.util
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_s = importlib.util.spec_from_file_location("do1103", os.path.join(os.path.dirname(__file__), "director-orquestacion.py"))
DO = importlib.util.module_from_spec(_s)
_s.loader.exec_module(DO)


def test_solo_lo_cambiado_y_sin_pisar_a_otros(tmp_path):
    ruta = tmp_path / "progreso.json"
    antes = {"A": {"estado": "en_curso"}, "B": {"estado": "pendiente"}}
    despues = {"A": {"estado": "pendiente"}, "B": {"estado": "pendiente"}}
    # Otro proceso escribió C y cambió B entre la lectura y la escritura del director.
    ruta.write_text(json.dumps({"A": {"estado": "en_curso"}, "B": {"estado": "commit"}, "C": {"estado": "pendiente"}}))
    n = DO.guardar_cambios_progreso(str(ruta), antes, despues, cerrojo=contextlib.nullcontext)
    assert n == 1
    assert json.loads(ruta.read_text()) == {"A": {"estado": "pendiente"}, "B": {"estado": "commit"}, "C": {"estado": "pendiente"}}
    assert not [p for p in os.listdir(tmp_path) if ".tmp-" in p]
    assert DO.guardar_cambios_progreso(str(ruta), despues, despues, cerrojo=contextlib.nullcontext) == 0
