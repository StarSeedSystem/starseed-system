#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la herramienta de medida de dispersión, sin torch ni transformers."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import medir_dispersion_activaciones as m


def _capa(n: int, exacto: float, casi: float) -> dict:
    return {"capa": n, "cero_exacto": exacto, "casi_cero": casi}


def test_ram_libre_gb_lee_memavailable():
    texto = "MemTotal: 16384000 kB\nMemAvailable: 8388608 kB\n"
    assert m.ram_libre_gb(texto) == pytest.approx(8.0)


def test_ram_libre_gb_sin_datos():
    assert m.ram_libre_gb("") == 0.0
    assert m.ram_libre_gb("MemTotal: 100 kB\n") == 0.0
    assert m.ram_libre_gb("MemAvailable: no-numero kB\n") == 0.0


def test_resumir_alta():
    r = m.resumir([_capa(0, 0.50, 0.80), _capa(1, 0.40, 0.90)])
    assert r["media_casi_cero"] == pytest.approx(0.85)
    assert r["media_cero_exacto"] == pytest.approx(0.45)
    assert "alta" in r["veredicto"]
    assert r["peor_capa"]["capa"] == 0
    assert r["mejor_capa"]["capa"] == 1


def test_resumir_marginal():
    r = m.resumir([_capa(0, 0.20, 0.55)])
    assert "marginal" in r["veredicto"]


def test_resumir_baja():
    r = m.resumir([_capa(0, 0.10, 0.20), _capa(1, 0.15, 0.30)])
    assert "baja" in r["veredicto"]


def test_resumir_vacio():
    r = m.resumir([])
    assert r["veredicto"] == "sin datos"
    assert r["peor_capa"] is None
    assert r["mejor_capa"] is None
    assert r["media_cero_exacto"] == 0.0
    assert r["media_casi_cero"] == 0.0


def test_prompts_es_son_doce():
    assert len(m.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in m.PROMPTS_ES)


def test_main_sin_ram_no_importa_torch(capsys):
    sys.modules.pop("torch", None)
    codigo = m.main(["--modelo", "modelo-x"],
                    leer_meminfo=lambda: "MemAvailable: 1048576 kB\n")
    assert codigo == 2
    assert "torch" not in sys.modules
    assert "RAM libre" in capsys.readouterr().out
