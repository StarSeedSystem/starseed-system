# -*- coding: utf-8 -*-
"""Pruebas puras de la herramienta de dispersión, sin torch ni transformers."""
import sys

import pytest

import medir_dispersion_activaciones as M


def test_ram_libre_lee_memavailable_en_gb():
    meminfo = "MemTotal: 16000000 kB\nMemFree: 1000 kB\nMemAvailable: 8000000 kB\n"
    assert M.ram_libre_gb(meminfo) == pytest.approx(8000000 / (1024 * 1024))


def test_ram_libre_sin_texto_devuelve_cero():
    assert M.ram_libre_gb("") == 0.0
    assert M.ram_libre_gb("MemTotal: 16000000 kB\n") == 0.0


def _capa(casi_cero: float, cero_exacto: float = 0.10, capa: int = 0) -> dict:
    return {"capa": capa, "cero_exacto": cero_exacto, "casi_cero": casi_cero}


def test_resumir_tramo_alta():
    r = M.resumir([_capa(0.80, capa=0), _capa(0.90, capa=1)])
    assert r["media_casi_cero"] == pytest.approx(0.85)
    assert r["veredicto"].startswith("alta")
    assert r["mejor_capa"] == 1
    assert r["peor_capa"] == 0


def test_resumir_tramo_marginal():
    r = M.resumir([_capa(0.40), _capa(0.60)])
    assert r["media_casi_cero"] == pytest.approx(0.50)
    assert r["veredicto"].startswith("marginal")


def test_resumir_tramo_baja():
    r = M.resumir([_capa(0.10), _capa(0.30)])
    assert r["media_casi_cero"] == pytest.approx(0.20)
    assert r["veredicto"].startswith("baja")


def test_resumir_lista_vacia_no_lanza():
    assert M.resumir([])["veredicto"] == "sin datos"


def test_prompts_es_tiene_doce_frases_no_vacias():
    assert len(M.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in M.PROMPTS_ES)


def test_main_con_ram_baja_devuelve_dos_y_no_importa_torch():
    resultado = M.main([], leer_meminfo=lambda: "MemAvailable: 1048576 kB\n")
    assert resultado == 2
    assert "torch" not in sys.modules
    assert "transformers" not in sys.modules
