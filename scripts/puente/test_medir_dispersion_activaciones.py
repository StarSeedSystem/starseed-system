#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del medidor de dispersión de activaciones. Sin torch: solo funciones puras y main con RAM insuficiente."""
from __future__ import annotations

import sys

import pytest

from scripts.puente.medir_dispersion_activaciones import (
    PROMPTS_ES,
    main,
    ram_libre_gb,
    resumir,
)

MEMINFO_RICO = """\
MemTotal:       16384000 kB
MemFree:         1230000 kB
MemAvailable:    8000000 kB
Buffers:          200000 kB
"""


def test_ram_libre_gb_lee_mem_available() -> None:
    assert ram_libre_gb(MEMINFO_RICO) == pytest.approx(8000000 / (1024 * 1024))


def test_ram_libre_gb_sin_campo_da_cero() -> None:
    assert ram_libre_gb("") == 0.0
    assert ram_libre_gb("MemFree: 5000 kB\nBuffers: 100 kB") == 0.0


def _capa(numero: int, casi: float) -> dict:
    return {"capa": numero, "cero_exacto": casi * 0.8, "casi_cero": casi}


def test_resumir_veredicto_alta() -> None:
    capas = [_capa(0, 0.75), _capa(1, 0.65), _capa(2, 0.80)]
    resumen = resumir(capas)
    assert resumen["veredicto"] == "alta: merece un predictor al estilo PowerInfer"
    assert resumen["media_casi_cero"] == pytest.approx((0.75 + 0.65 + 0.80) / 3)
    assert resumen["peor_capa"] == 1
    assert resumen["mejor_capa"] == 2


def test_resumir_veredicto_marginal() -> None:
    capas = [_capa(0, 0.40), _capa(1, 0.50)]
    resumen = resumir(capas)
    assert resumen["veredicto"] == "marginal: medir velocidad real antes"


def test_resumir_veredicto_baja() -> None:
    capas = [_capa(0, 0.10), _capa(1, 0.30)]
    resumen = resumir(capas)
    assert resumen["veredicto"] == "baja: descartar"


def test_resumir_lista_vacia_sin_datos() -> None:
    resumen = resumir([])
    assert resumen["veredicto"] == "sin datos"
    assert resumen["peor_capa"] is None


def test_prompts_es_tiene_doce_no_vacios() -> None:
    assert len(PROMPTS_ES) == 12
    assert all(isinstance(frase, str) and frase.strip() for frase in PROMPTS_ES)


def test_main_con_ram_insuficiente_devuelve_2_sin_importar_torch(capsys) -> None:
    llamado = {}

    def leer_meminfo_falsa() -> str:
        llamado["leido"] = True
        return "MemAvailable:  1048576 kB\n"  # 1 GB, muy por debajo de 6,5 GB

    codigo = main(argv=["--salida", "/tmp/no_debe_escribirse.json"], leer_meminfo=leer_meminfo_falsa)
    salido = capsys.readouterr().out
    assert llamado["leido"] is True
    assert codigo == 2
    assert "RAM libre" in salido
    assert "torch" not in sys.modules
    from pathlib import Path

    assert not Path("/tmp/no_debe_escribirse.json").exists()
