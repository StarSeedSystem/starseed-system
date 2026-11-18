# -*- coding: utf-8 -*-
"""Pruebas de motores_director.py: es_fallo_hermes (pura)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M


class TestEsFalloHermes(unittest.TestCase):
    """Pruebas de la función pura es_fallo_hermes."""

    def test_error_gateway_connection_failed(self):
        """El texto 'Error: Gateway connection failed; no local fallback' cuenta como fallo."""
        texto = "Error: Gateway connection failed; no local fallback"
        self.assertTrue(M.es_fallo_hermes(texto))

    def test_solo_no_local_fallback(self):
        """El texto 'no local fallback' cuenta como fallo."""
        texto = "no local fallback"
        self.assertTrue(M.es_fallo_hermes(texto))

    def test_respuesta_normal_dos_lineas(self):
        """Una respuesta normal de dos líneas no cuenta como fallo."""
        texto = "Línea uno de respuesta.\nLínea dos de respuesta."
        self.assertFalse(M.es_fallo_hermes(texto))

    def test_fallos_existentes_siguen_funcionando(self):
        """Los fallos preexistentes siguen detectándose."""
        self.assertTrue(M.es_fallo_hermes("kept failing over"))
        self.assertTrue(M.es_fallo_hermes("every provider in the fallback chain"))
        self.assertTrue(M.es_fallo_hermes("invalid api key"))

    def test_texto_largo_no_es_fallo(self):
        """Un texto largo (>600 chars) con palabras de fallo no cuenta como fallo."""
        texto = "gateway connection failed " + "x" * 600
        self.assertFalse(M.es_fallo_hermes(texto))

    def test_mayusculas_y_minusculas(self):
        """La detección es case-insensitive."""
        self.assertTrue(M.es_fallo_hermes("GATEWAY CONNECTION FAILED"))
        self.assertTrue(M.es_fallo_hermes("No Local Fallback"))
        self.assertTrue(M.es_fallo_hermes("Kept Failing Over"))


if __name__ == "__main__":
    unittest.main()