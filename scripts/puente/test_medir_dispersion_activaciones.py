#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la herramienta de dispersión; no importan torch."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import medir_dispersion_activaciones as m

MEMINFO_EJEMPLO = """MemTotal:       16384000 kB
MemFree:         2097152 kB
MemAvailable:    8388608 kB
"""
MEMINFO_BAJA = "MemTotal: 16384000 kB\nMemAvailable: 1048576 kB\n"


def test_ram_libre_gb_lee_memavailable():
    assert m.ram_libre_gb(MEMINFO_EJEMPLO) == 8.0


def test_ram_libre_gb_texto_vacio_o_sin_campo():
    assert m.ram_libre_gb("") == 0.0
    assert m.ram_libre_gb("MemTotal: 100 kB\n") == 0.0


def test_resumir_alta():
    capas = [{"capa": 0, "cero_exacto": 0.4, "casi_cero": 0.8},
             {"capa": 1, "cero_exacto": 0.3, "casi_cero": 0.75}]
    r = m.resumir(capas)
    assert r["veredicto"].startswith("alta")
    assert r["mejor_capa"] == 0
    assert r["peor_capa"] == 1
    assert abs(r["media_casi_cero"] - 0.775) < 1e-9


def test_resumir_marginal():
    r = m.resumir([{"capa": 0, "cero_exacto": 0.1, "casi_cero": 0.5},
                   {"capa": 1, "cero_exacto": 0.1, "casi_cero": 0.6}])
    assert r["veredicto"].startswith("marginal")


def test_resumir_baja():
    r = m.resumir([{"capa": 0, "cero_exacto": 0.1, "casi_cero": 0.1},
                   {"capa": 1, "cero_exacto": 0.1, "casi_cero": 0.2}])
    assert r["veredicto"].startswith("baja")


def test_resumir_lista_vacia_no_lanza():
    r = m.resumir([])
    assert r["veredicto"] == "sin datos"
    assert r["peor_capa"] is None and r["mejor_capa"] is None


def test_prompts_es_doce_no_vacios():
    assert len(m.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in m.PROMPTS_ES)


def test_main_sin_ram_devuelve_2_y_no_importa_torch():
    sys.modules.pop("torch", None)
    assert m.main([], leer_meminfo=lambda: MEMINFO_BAJA) == 2
    assert "torch" not in sys.modules
