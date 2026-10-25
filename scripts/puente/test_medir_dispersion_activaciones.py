#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la herramienta de dispersión; no importan torch ni descargan nada."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medir_dispersion_activaciones as m

MEMINFO = """MemTotal:       16384000 kB
MemFree:         2000000 kB
MemAvailable:    8388608 kB
Buffers:          100000 kB
"""


def test_ram_libre_gb_lee_disponible():
    assert m.ram_libre_gb(MEMINFO) == pytest.approx(8.0)


def test_ram_libre_gb_sin_campo():
    assert m.ram_libre_gb("") == 0.0
    assert m.ram_libre_gb("MemTotal: 1024 kB") == 0.0


def test_resumir_tramo_alto():
    capas = [
        {"capa": 0, "cero_exacto": 0.70, "casi_cero": 0.80},
        {"capa": 1, "cero_exacto": 0.60, "casi_cero": 0.75},
    ]
    r = m.resumir(capas)
    assert r["media_cero_exacto"] == pytest.approx(0.65)
    assert r["media_casi_cero"] == pytest.approx(0.775)
    assert r["veredicto"].startswith("alta")
    assert r["peor_capa"] == 1
    assert r["mejor_capa"] == 0


def test_resumir_tramo_marginal():
    r = m.resumir([{"capa": 3, "cero_exacto": 0.20, "casi_cero": 0.50}])
    assert r["veredicto"].startswith("marginal")
    assert r["peor_capa"] == r["mejor_capa"] == 3


def test_resumir_tramo_bajo():
    r = m.resumir([{"capa": 0, "cero_exacto": 0.10, "casi_cero": 0.20}])
    assert r["veredicto"].startswith("baja")


def test_resumir_sin_datos():
    r = m.resumir([])
    assert r["veredicto"] == "sin datos"
    assert r["media_cero_exacto"] == 0.0
    assert r["media_casi_cero"] == 0.0
    assert r["peor_capa"] is None
    assert r["mejor_capa"] is None


def test_prompts_es_son_doce_y_no_vacios():
    assert len(m.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in m.PROMPTS_ES)


def test_main_sin_ram_devuelve_dos_sin_importar_torch():
    sys.modules.pop("torch", None)
    codigo = m.main([], leer_meminfo=lambda: "MemAvailable: 1048576 kB")
    assert codigo == 2
    assert "torch" not in sys.modules
