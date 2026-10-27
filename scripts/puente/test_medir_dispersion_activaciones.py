#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del medidor de dispersión de activaciones (sin torch)."""
from __future__ import annotations

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import pytest

import medir_dispersion_activaciones as mod

MEMINFO = """MemTotal:       16000000 kB
MemFree:          500000 kB
MemAvailable:    8000000 kB
Buffers:          200000 kB
"""

MEMINFO_JUSTO = "MemAvailable:      7283336 kB\n"


def test_ram_libre_gb_le_meminfo():
    assert mod.ram_libre_gb(MEMINFO) == pytest.approx(8000000 / 1048576)


def test_ram_libre_gb_texto_vacio():
    assert mod.ram_libre_gb("") == 0.0


def test_ram_libre_gb_sin_memavailable():
    assert mod.ram_libre_gb("MemTotal: 1 kB\n") == 0.0


def test_ram_libre_gb_usa_meminfo_justo_del_cli():
    # 7283336 kB ≈ 6,945 GB: por encima del umbral 6,5 GB
    assert mod.ram_libre_gb(MEMINFO_JUSTO) > 6.5


def _capa(n: int, cero: float, casi: float):
    return {"capa": n, "cero_exacto": cero, "casi_cero": casi}


def test_resumir_tramo_alto():
    r = mod.resumir([_capa(0, 0.9, 0.8), _capa(1, 0.8, 0.6)])
    assert r["veredicto"].startswith("alta")
    assert r["media_casi_cero"] == pytest.approx(0.7)
    assert r["mejor_capa"]["capa"] == 0
    assert r["peor_capa"]["capa"] == 1


def test_resumir_tramo_marginal():
    r = mod.resumir([_capa(0, 0.2, 0.4), _capa(1, 0.2, 0.4)])
    assert r["veredicto"].startswith("marginal")


def test_resumir_tramo_bajo():
    r = mod.resumir([_capa(0, 0.1, 0.1)])
    assert r["veredicto"].startswith("baja")


def test_resumir_lista_vacia():
    r = mod.resumir([])
    assert r["veredicto"] == "sin datos"
    assert r["peor_capa"] is None and r["mejor_capa"] is None


def test_prompts_es_doce_no_vacios():
    assert len(mod.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in mod.PROMPTS_ES)


def test_main_bajo_umbral_devuelve_2_sin_torch():
    # main con RAM falsa insuficiente: devuelve 2 y nunca llega a importar torch
    codigo = mod.main(["--salida", "/tmp/no-existe.json"], leer_meminfo=lambda: "MemAvailable: 100000 kB\n")
    assert codigo == 2
    assert "torch" not in sys.modules  # solo válido si no se importó antes; main no lo toca


def test_main_undershoot_mensaje_con_error():
    import io, contextlib
    salida = io.StringIO()
    with contextlib.redirect_stdout(salida):
        codigo = mod.main(["--salida", "x.json"], leer_meminfo=lambda: "MemAvailable: 0 kB\n")
    assert codigo == 2
    assert "insuficiente" in salida.getvalue()

