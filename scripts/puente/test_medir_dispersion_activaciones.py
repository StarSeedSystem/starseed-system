#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la herramienta de medida de dispersión, sin torch instalado."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import medir_dispersion_activaciones as m

MEMINFO_EJEMPLO = "MemTotal: 8589934592 kB\nMemAvailable: 8388608 kB\n"


def test_ram_libre_lee_memavailable():
    assert m.ram_libre_gb(MEMINFO_EJEMPLO) == 8.0


def test_ram_libre_sin_dato_devuelve_cero():
    assert m.ram_libre_gb("") == 0.0
    assert m.ram_libre_gb("MemTotal: 1024 kB\n") == 0.0


def test_resumir_tramo_alto():
    capas = [{"capa": 0, "cero_exacto": 0.5, "casi_cero": 0.75},
             {"capa": 1, "cero_exacto": 0.6, "casi_cero": 0.85}]
    resumen = m.resumir(capas)
    assert resumen["veredicto"].startswith("alta")
    assert resumen["media_casi_cero"] == 0.8
    assert resumen["peor_capa"] == 0
    assert resumen["mejor_capa"] == 1


def test_resumir_tramo_marginal():
    resumen = m.resumir([{"capa": 0, "cero_exacto": 0.2, "casi_cero": 0.5}])
    assert resumen["veredicto"].startswith("marginal")


def test_resumir_tramo_bajo():
    resumen = m.resumir([{"capa": 0, "cero_exacto": 0.1, "casi_cero": 0.2}])
    assert resumen["veredicto"].startswith("baja")


def test_resumir_lista_vacia_no_lanza():
    resumen = m.resumir([])
    assert resumen["veredicto"] == "sin datos"
    assert resumen["peor_capa"] is None
    assert resumen["mejor_capa"] is None
    assert resumen["media_casi_cero"] == 0.0


def test_prompts_son_doce_y_no_vacios():
    assert len(m.PROMPTS_ES) == 12
    assert all(p.strip() for p in m.PROMPTS_ES)


def test_main_ram_baja_devuelve_2_sin_cargar_torch(tmp_path):
    meminfo = "MemTotal: 8589934592 kB\nMemAvailable: 1048576 kB\n"
    salida = tmp_path / "dispersion.json"
    codigo = m.main(["--salida", str(salida)], leer_meminfo=lambda: meminfo)
    assert codigo == 2
    assert "torch" not in sys.modules
    assert not salida.exists()
