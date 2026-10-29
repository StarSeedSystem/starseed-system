#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la herramienta de dispersión de BitNet. Sin torch: solo funciones puras y
la puerta de RAM, que debe cortar antes de importar nada pesado."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import medir_dispersion_activaciones as M  # noqa: E402

MEMINFO = """MemTotal:       16384000 kB
MemFree:          500000 kB
MemAvailable:    8388608 kB
SwapTotal:       2048000 kB
"""


def test_ram_libre_gb_lee_memavailable():
    assert M.ram_libre_gb(MEMINFO) == 8.0


def test_ram_libre_gb_sin_datos_devuelve_cero():
    assert M.ram_libre_gb("") == 0.0
    assert M.ram_libre_gb("MemTotal: 16384000 kB\n") == 0.0


def test_resumir_tramo_alto():
    resumen = M.resumir([{"capa": 0, "cero_exacto": 0.90, "casi_cero": 0.80}])
    assert resumen["media_casi_cero"] == 0.80
    assert resumen["veredicto"].startswith("alta")


def test_resumir_tramo_marginal_y_peor_mejor():
    capas = [{"capa": 3, "cero_exacto": 0.45, "casi_cero": 0.20},
             {"capa": 7, "cero_exacto": 0.65, "casi_cero": 0.90}]
    resumen = M.resumir(capas)
    assert round(resumen["media_casi_cero"], 2) == 0.55
    assert resumen["veredicto"].startswith("marginal")
    assert (resumen["peor_capa"], resumen["mejor_capa"]) == (3, 7)


def test_resumir_tramo_bajo():
    resumen = M.resumir([{"capa": 0, "cero_exacto": 0.10, "casi_cero": 0.20}])
    assert resumen["veredicto"].startswith("baja")


def test_resumir_lista_vacia_no_lanza():
    resumen = M.resumir([])
    assert resumen["veredicto"] == "sin datos"
    assert resumen["peor_capa"] is None
    assert resumen["mejor_capa"] is None


def test_prompts_es_son_doce_no_vacios():
    assert len(M.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in M.PROMPTS_ES)


def test_main_bajo_umbral_corta_sin_importar_torch(monkeypatch):
    def no_medir(*_args, **_kwargs):
        raise AssertionError("no debe cargar el modelo con la RAM bajo el umbral")

    monkeypatch.setattr(M, "medir", no_medir)
    monkeypatch.delitem(sys.modules, "torch", raising=False)
    codigo = M.main(["--salida", "/tmp/no-debe-escribirse.json"],
                    leer_meminfo=lambda: "MemAvailable: 1048576 kB\n")
    assert codigo == 2
    assert "torch" not in sys.modules
