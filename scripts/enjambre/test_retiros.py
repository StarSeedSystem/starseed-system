# -*- coding: utf-8 -*-
"""Tests de retiros confirmados y dependencias bloqueantes (2026-09-07, Ola 261).

Sin red: `debe_retirar` se prueba pasándole el catálogo explícito (la función es pura y
nunca consulta ella misma) y `dependencias_ok` se prueba con un PROG simulado. El módulo
se importa como en test_alcance.py (el nombre lleva guiones); el arranque vive bajo
`if __name__ == "__main__"`.
"""
import importlib.util
import os
import sys
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class DebeRetirarTest(unittest.TestCase):
    """La pista «does not exist» de la salida de una HERRAMIENTA no retira nada (Ola 264, G3)."""

    def test_pista_de_herramienta_con_catalogo_vivo_no_retira(self):
        ok, motivo = enjambre.debe_retirar(
            "nvidia/x", "fatal: path a does not exist in 'main'", catalogo={"x"})
        self.assertFalse(ok); self.assertIn("sigue en el catálogo", motivo)

    def test_catalogo_sin_el_modelo_si_retira(self):
        ok, motivo = enjambre.debe_retirar(
            "nvidia/x", "AI_APICallError: model does not exist", catalogo={"otro"})
        self.assertTrue(ok); self.assertIn("catálogo", motivo)

    def test_sin_catalogo_linea_de_error_api_retira(self):
        salida = "haciendo cosas\nError: model not found\nfin"
        ok, _ = enjambre.debe_retirar("tokenrouter/y", salida, catalogo=None)
        self.assertTrue(ok)

    def test_sin_catalogo_pista_en_salida_de_herramienta_no_retira(self):
        # La misma pista, pero dentro de la salida de `ls` que ejecutó el agente:
        # no es una línea de error de la API.
        salida = "$ ls docs\nls: docs/viejo: model not found\n$ continuar"
        ok, motivo = enjambre.debe_retirar("tokenrouter/y", salida, catalogo=None)
        self.assertFalse(ok); self.assertIn("herramienta", motivo)

    def test_sin_pista_no_retira(self):
        ok, _ = enjambre.debe_retirar("nvidia/x", "todo bien", catalogo=set())
        self.assertFalse(ok)


class DependenciasOkTest(unittest.TestCase):
    """dependencias_ok mira PROG y solo acepta dependencias integradas (commit)."""

    def setUp(self):
        self._prog_orig = enjambre.PROG

    def tearDown(self):
        enjambre.PROG = self._prog_orig

    def test_dependencia_no_integrada_bloquea(self):
        enjambre.PROG = {"J1": {"estado": "sin_cambios"}}
        ok, malas = enjambre.dependencias_ok({"depende": ["J1"]})
        self.assertFalse(ok); self.assertEqual(malas, ["J1 (sin_cambios)"])

    def test_dependencia_integrada_pasa(self):
        enjambre.PROG = {"J1": {"estado": "commit"}}
        ok, malas = enjambre.dependencias_ok({"depende": ["J1"]})
        self.assertTrue(ok); self.assertEqual(malas, [])

    def test_dependencia_sinin_estado_aun_no_bloquea(self):
        # Sin estado = no ha terminado todavía: el planificador la espera, no se bloquea aquí.
        enjambre.PROG = {"J1": {}}
        ok, _ = enjambre.dependencias_ok({"depende": ["J1"]})
        self.assertTrue(ok)

    def test_opcional_nunca_bloquea(self):
        enjambre.PROG = {"Z9": {"estado": "fallo"}}
        ok, _ = enjambre.dependencias_ok({"depende_opcional": ["Z9"]})
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
