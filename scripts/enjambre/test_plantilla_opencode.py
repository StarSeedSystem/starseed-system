# -*- coding: utf-8 -*-
"""Tests puros de `refrescar_bloque_opencode` (2026-09-13, Ola 316 · p316O).

Nunca se toca el ~/.config/opencode/opencode.json real: la función recibe un cfg dict y
devuelve (cfg_nuevo, cambiado). Se cubren los tres casos: bloque ausente, bloque ya igual
y bloque con un baseURL viejo (la pasarela cambió en ~/.starseed/env, causa raíz del
«sin cambios en 3 s» de apinex: 405 por falta de /v1). Los valores de clave solo pueden
ser la sintaxis literal {env:VARIABLE}, jamás un valor real.
"""

import importlib.util
import json
import os
import sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


APINEX = {
    "apinex": {
        "url": "https://apinex.bond/v1/chat/completions",
        "key": "CLAVE_FALSA_DE_PRUEBA",
        "var": "STARSEED_PASARELA_APINEX_KEY",
        "modelos": ["modelo-x"],
        "rpm": 30,
    }
}

BLOQUE_VIEJO = {
    "npm": "@ai-sdk/openai-compatible",
    "name": "apinex (pasarela)",
    "options": {
        "baseURL": "https://apinex.bond",
        "apiKey": "{env:STARSEED_PASARELA_APINEX_KEY}",
    },
    "models": {"modelo-x": {"name": "modelo-x"}},
}


@pytest.fixture
def apinex_en_v1(monkeypatch):
    monkeypatch.setattr(enjambre, "PASARELAS", dict(APINEX))


def test_bloque_ausente_no_cambia(apinex_en_v1):
    cfg = {"provider": {}}
    nuevo, cambiado = enjambre.refrescar_bloque_opencode(cfg, "apinex")
    assert cambiado is False
    assert nuevo is cfg


def test_bloque_igual_no_cambia(apinex_en_v1):
    cfg = {
        "provider": {
            "apinex": json.loads(json.dumps(enjambre.plantilla_opencode("apinex")))
        }
    }
    nuevo, cambiado = enjambre.refrescar_bloque_opencode(cfg, "apinex")
    assert cambiado is False
    assert nuevo is cfg


def test_bloque_con_base_viejo_se_actualiza(apinex_en_v1):
    cfg = {"provider": {"apinex": json.loads(json.dumps(BLOQUE_VIEJO))}}
    nuevo, cambiado = enjambre.refrescar_bloque_opencode(cfg, "apinex")
    assert cambiado is True
    assert nuevo["provider"]["apinex"]["options"]["baseURL"] == "https://apinex.bond/v1"
    # Solo sintaxis literal de entorno, jamás el valor de una clave.
    assert (
        nuevo["provider"]["apinex"]["options"]["apiKey"]
        == "{env:STARSEED_PASARELA_APINEX_KEY}"
    )
    # El dict original no se muta.
    assert cfg["provider"]["apinex"]["options"]["baseURL"] == "https://apinex.bond"
    # Lo demás del bloque (models incluidos) se conserva.
    assert nuevo["provider"]["apinex"]["models"] == {"modelo-x": {"name": "modelo-x"}}
