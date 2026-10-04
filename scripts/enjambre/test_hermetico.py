# -*- coding: utf-8 -*-
"""Pruebas herméticas: el registro real no se ensucia al correr pytest."""
import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

RUTA = Path(__file__).parent / "starseed-enjambre.py"


def cargar_modulo(nombre: str):
    espec = importlib.util.spec_from_file_location(nombre, RUTA)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nombre] = mod
    espec.loader.exec_module(mod)
    return mod


# Carga a nivel de módulo (antes del fixture autouse) para capturar EVENTOS real.
MODULO_HERMETICO = cargar_modulo("enjambre_hermetico")
# Ruta real del archivo de eventos del orquestador (constante, no cambia con parcheo).
EVENTOS_REAL = str(Path("starseed_memory_root/olas/eventos.jsonl").resolve()) if Path("starseed_memory_root/olas/eventos.jsonl").exists() else str(MODULO_HERMETICO.EVENTOS)


@pytest.fixture()
def modulo_hermetico():
    # Usa el módulo cargado a nivel de módulo (ya parcheado por autouse).
    return MODULO_HERMETICO


def test_registro_real_no_crece(modulo_hermetico, tmp_path):
    # Llama a evento con datos de prueba; el archivo real no debe crecer.
    ruta_real = EVENTOS_REAL
    tamano_antes = os.path.getsize(ruta_real) if os.path.exists(ruta_real) else 0
    modulo_hermetico.evento("aviso", None, "prueba hermética")
    # El archivo real (capturado antes del fixture) no debe crecer.
    assert os.path.exists(ruta_real)
    assert os.path.getsize(ruta_real) == tamano_antes
    # El archivo parcheado (en tmp_path del fixture) debe contener la línea.
    eventos_falso = Path(str(modulo_hermetico.EVENTOS))
    contenido = eventos_falso.read_text(encoding="utf-8")
    assert "prueba hermética" in contenido


def test_anon_vacio(modulo_hermetico):
    # El fixture debe haber parcheado ANON a cadena vacía.
    assert getattr(modulo_hermetico, "ANON", None) == ""
