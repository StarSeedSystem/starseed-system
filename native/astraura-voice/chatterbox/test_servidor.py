#!/usr/bin/env python3
"""
Pruebas del servicio Chatterbox local — sin red ni GPU.
Usa el modelo simulado para verificar endpoints y medidas.
"""

import sys
sys.path.insert(0, "/home/starseed/starseed-wt/VZR1011A/native/astraura-voice/chatterbox")

import time
import pytest
from servidor import (
    detectar_dispositivo,
    cargar_modelo,
    descargar_modelos_inactivos,
    endpoint_generar,
    endpoint_generar_stream,
    PERTH_WATERMARK,
)


def test_dispositivo():
    d = detectar_dispositivo()
    assert d in ("cpu", "mps", "cuda")


def test_modelo_simulado():
    m = cargar_modelo("multilingual-v3")
    assert isinstance(m, dict)


def test_marca_agua_conservada():
    assert PERTH_WATERMARK is True


def test_generar_conserva_marca_agua():
    res = endpoint_generar("Hola, soy Aurora.", idioma="es")
    assert res["marca_agua_perth"] is True
    assert "Perth" in res["mensaje"]
    assert res["primer_audio_s"] >= 0


def test_stream_por_frases():
    respuestas = endpoint_generar_stream(
        ["Primera frase.", "Segunda frase."], idioma="es"
    )
    assert len(respuestas) == 2
    for r in respuestas:
        assert r["marca_agua_perth"] is True
        assert "frase" in r


def test_descarga_por_inactividad():
    descargar_modelos_inactivos()
    # Tras descarga simulada, el diccionario puede estar vacío o no,
    # dependiendo del tiempo transcurrido; no lanzamos excepción.
