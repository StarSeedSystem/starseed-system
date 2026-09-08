# -*- coding: utf-8 -*-
"""Tests de las pasarelas como ESCRITORAS y de FreeTheAi (2026-09-08, Ola 286 · G1).

Sin red: se parchean `PASARELAS` y el entorno (`ENV` / `os.environ`) con pytest y se
ejercitan `plantilla_opencode`, `escritores_de_pasarelas` y la condición de FreeTheAi.
Regla dura del proyecto: en ningún JSON generado puede aparecer el VALOR de una clave,
solo la sintaxis literal `{env:VARIABLE}`. El módulo se importa con importlib porque el
nombre del archivo lleva guiones (igual que en test_revisores.py); el import es seguro
porque el arranque vive bajo `if __name__ == "__main__"`.
"""
import importlib.util
import json
import os
import sys
import unittest

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


@pytest.fixture
def sin_freetheai(monkeypatch):
    """Garantiza que no hay clave de FreeTheAi ni en el entorno ni en ENV."""
    monkeypatch.delenv("FREETHEAI_API_KEY", raising=False)
    monkeypatch.setattr(enjambre, "ENV", {})


GROQ = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "base": "https://api.groq.com/openai/v1",
        "key": "CLAVE_FALSA_DE_PRUEBA",
        "var": "STARSEED_PASARELA_GROQ_KEY",
        "modelos": ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
        "rpm": 30,
    }
}


class PlantillaOpencodeTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch):
        monkeypatch.setattr(enjambre, "PASARELAS", dict(GROQ))

    def test_groq_construye_con_base_y_env(self):
        bloque = enjambre.plantilla_opencode("groq")
        self.assertIsNotNone(bloque)
        self.assertEqual(bloque["options"]["baseURL"], "https://api.groq.com/openai/v1")
        self.assertEqual(bloque["options"]["apiKey"], "{env:STARSEED_PASARELA_GROQ_KEY}")

    def test_groq_nunca_expone_el_valor(self):
        bloque = enjambre.plantilla_opencode("groq")
        serializado = json.dumps(bloque)
        self.assertNotIn(GROQ["groq"]["key"], serializado)
        self.assertNotIn("CLAVE_FALSA", serializado)

    def test_llm7_sigue_siendo_fija(self):
        bloque = enjambre.plantilla_opencode("llm7")
        self.assertEqual(bloque["name"], "LLM7 (sin clave)")
        self.assertEqual(bloque["options"]["apiKey"], "sin-clave")

    def test_tokenrouter_env_literal(self):
        bloque = enjambre.plantilla_opencode("tokenrouter")
        self.assertEqual(bloque["options"]["apiKey"], "{env:TOKENROUTER_API_KEY}")

    def test_inventado_es_none(self):
        self.assertIsNone(enjambre.plantilla_opencode("inventado"))

    def test_pasarela_sin_clave_es_literal_sin_clave(self):
        sin_clave = dict(GROQ)
        sin_clave["groq"] = dict(GROQ["groq"], key="sin-clave")
        enjambre.PASARELAS = sin_clave
        bloque = enjambre.plantilla_opencode("groq")
        self.assertEqual(bloque["options"]["apiKey"], "sin-clave")


class EscritoresPasarelasTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch, sin_freetheai):
        monkeypatch.setattr(enjambre, "PASARELAS", dict(GROQ))

    def test_devuelve_los_modelos_de_la_pasarela(self):
        self.assertEqual(
            enjambre.escritores_de_pasarelas(),
            ["groq/openai/gpt-oss-120b", "groq/qwen/qwen3.8-27b"],
        )

    def test_rotacion_apende_al_final(self):
        rotacion = enjambre.modelos_para("X1")
        self.assertEqual(rotacion[-2:], ["groq/openai/gpt-oss-120b", "groq/qwen/qwen3.8-27b"])
        self.assertNotIn("groq/", rotacion[:-(len(enjambre.escritores_de_pasarelas()))])


class FreeTheAiTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch):
        monkeypatch.setattr(enjambre, "PASARELAS", {})

    def test_sin_clave_no_aparece_en_las_listas(self):
        os.environ.pop("FREETHEAI_API_KEY", None)
        enjambre.ENV = {}
        self.assertEqual(enjambre.freetheai_revisores(), [])
        self.assertFalse(any(x.startswith("freetheai/") for x in enjambre.escritores_de_pasarelas()))
        revisores = [p for p, _ in enjambre.REVISORES]
        self.assertNotIn("freetheai", revisores)

    def test_con_clave_si_aparece(self):
        os.environ["FREETHEAI_API_KEY"] = "CLAVE_FALSA_FREETHEAI"
        enjambre.ENV = {"FREETHEAI_API_KEY": "CLAVE_FALSA_FREETHEAI"}
        try:
            self.assertTrue(enjambre._freetheai_activo())
            revisores = enjambre.freetheai_revisores()
            self.assertEqual(len(revisores), len(enjambre.FREETHEAI_MODELOS["revisores"]))
            self.assertTrue(all(p == "freetheai" for p, _ in revisores))
            escritores = enjambre.escritores_de_pasarelas()
            self.assertTrue(any(x.startswith("freetheai/") for x in escritores))
        finally:
            os.environ.pop("FREETHEAI_API_KEY", None)
            enjambre.ENV = {}

    def test_con_clave_la_plantilla_no_expone_el_valor(self):
        os.environ["FREETHEAI_API_KEY"] = "CLAVE_FALSA_FREETHEAI"
        enjambre.ENV = {"FREETHEAI_API_KEY": "CLAVE_FALSA_FREETHEAI"}
        try:
            bloque = enjambre.plantilla_opencode("freetheai")
            self.assertEqual(bloque["options"]["apiKey"], "{env:FREETHEAI_API_KEY}")
            serializado = json.dumps(bloque)
            self.assertNotIn("CLAVE_FALSA", serializado)
            self.assertNotIn("FREETHEAI_API_KEY=", serializado)
        finally:
            os.environ.pop("FREETHEAI_API_KEY", None)
            enjambre.ENV = {}


if __name__ == "__main__":
    unittest.main()