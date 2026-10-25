#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la medida de dispersión de activaciones. No importan torch."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medir_dispersion_activaciones as medir_mod

MEMINFO_EJEMPLO = """MemTotal:       16384000 kB
MemFree:         2097152 kB
MemAvailable:    8388608 kB
Buffers:          102400 kB
"""


def test_ram_libre_gb_lee_memavailable():
    assert medir_mod.ram_libre_gb(MEMINFO_EJEMPLO) == 8.0


def test_ram_libre_gb_texto_vacio():
    assert medir_mod.ram_libre_gb("") == 0.0


def test_ram_libre_gb_sin_memavailable():
    assert medir_mod.ram_libre_gb("MemTotal: 1024 kB\n") == 0.0


def test_resumir_sin_datos():
    resultado = medir_mod.resumir([])
    assert resultado["veredicto"] == "sin datos"
    assert resultado["media_cero_exacto"] == 0.0
    assert resultado["media_casi_cero"] == 0.0
    assert resultado["peor_capa"] is None
    assert resultado["mejor_capa"] is None


def test_resumir_tramo_alto():
    capas = [
        {"capa": 0, "cero_exacto": 0.8, "casi_cero": 0.9},
        {"capa": 1, "cero_exacto": 0.6, "casi_cero": 0.75},
    ]
    resultado = medir_mod.resumir(capas)
    assert resultado["veredicto"].startswith("alta")
    assert abs(resultado["media_casi_cero"] - 0.825) < 1e-9
    assert resultado["mejor_capa"]["capa"] == 0
    assert resultado["peor_capa"]["capa"] == 1


def test_resumir_tramo_marginal():
    capas = [{"capa": 0, "cero_exacto": 0.5, "casi_cero": 0.55}]
    assert medir_mod.resumir(capas)["veredicto"].startswith("marginal")


def test_resumir_tramo_bajo():
    capas = [{"capa": 0, "cero_exacto": 0.2, "casi_cero": 0.2}]
    assert medir_mod.resumir(capas)["veredicto"].startswith("baja")


def test_prompts_es_son_doce_y_no_vacios():
    assert len(medir_mod.PROMPTS_ES) == 12
    assert all(isinstance(prompt, str) and prompt.strip() for prompt in medir_mod.PROMPTS_ES)


def test_main_sin_ram_no_importa_torch(tmp_path):
    assert "torch" not in sys.modules
    assert "transformers" not in sys.modules
    salida = tmp_path / "medida.json"
    codigo = medir_mod.main(
        ["--salida", str(salida)],
        leer_meminfo=lambda: "MemAvailable: 1048576 kB\n",
    )
    assert codigo == 2
    assert "torch" not in sys.modules
    assert "transformers" not in sys.modules
    assert not salida.exists()
