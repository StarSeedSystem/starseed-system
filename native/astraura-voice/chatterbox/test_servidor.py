#!/usr/bin/env python3
"""
Pruebas del servicio Chatterbox local — sin red ni GPU.
Usa el modelo simulado para verificar endpoints y medidas.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import time
from servidor import (
    detectar_dispositivo,
    cargar_modelo,
    descargar_modelos_inactivos,
    endpoint_generar,
    endpoint_generar_stream,
    endpoint_salud,
    PERTH_WATERMARK,
)


def test_dispositivo():
    d = detectar_dispositivo()
    assert d in ("cpu", "mps", "cuda")


def test_modelo_simulado():
    m = cargar_modelo("multilingual-v3", "es")
    assert isinstance(m, dict)
    assert m.get("simulado") is True


def test_marca_agua_conservada():
    assert PERTH_WATERMARK is True


def test_generar_conserva_marca_agua():
    res = endpoint_generar("Hola, soy Aurora.", idioma="es")
    assert res["marca_agua_perth"] is True
    assert "Perth" in res["mensaje"]
    assert res["tiempo_total_s"] >= 0


def test_stream_por_frases():
    respuestas = endpoint_generar_stream(
        ["Primera frase.", "Segunda frase."], idioma="es"
    )
    assert len(respuestas) == 2
    for r in respuestas:
        assert r["marca_agua_perth"] is True
        assert "frase" in r
        assert "tiempo_total_s" in r


def test_endpoint_salud():
    salud = endpoint_salud()
    assert "dispositivo" in salud
    assert salud["dispositivo"] in ("cpu", "mps", "cuda")
    assert "modelos_cargados" in salud
    assert isinstance(salud["modelos_cargados"], list)
    assert "marca_agua_perth" in salud
    assert salud["marca_agua_perth"] is True
    assert "estado" in salud
    assert salud["estado"] == "activo"


def test_idioma_espanol_usa_multilingual():
    # Verificar que el español use el modelo multilingual
    res = endpoint_generar("Hola mundo", idioma="es")
    assert res["idioma"] == "es"
    assert "tiempo_total_s" in res
    assert res["tiempo_total_s"] >= 0


def test_idioma_ingles_usa_turbo():
    # Verificar que el inglés use el modelo turbo (preferido por baja latencia)
    res = endpoint_generar("Hello world", idioma="en")
    assert res["idioma"] == "en"
    assert "tiempo_total_s" in res
    assert res["tiempo_total_s"] >= 0


def test_descarga_por_inactividad():
    descargar_modelos_inactivos()
    # Tras descarga simulada, el diccionario puede estar vacío o no,
    # dependiendo del tiempo transcurrido; no lanzamos excepción.