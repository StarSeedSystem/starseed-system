# -*- coding: utf-8 -*-
"""Pruebas DIR1118R: es_fallo_hermes reconoce el error de gateway de Hermes."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M


class TestEsFalloHermesDir1118R(unittest.TestCase):
    """DIR1118R: «Error: Gateway connection failed; no local fallback» cuenta como fallo."""

    def test_texto_exacto_del_18_noviembre(self):
        """El error que publicó el Director presidente el 18-11-2026."""
        texto = "Error: Gateway connection failed; no local fallback"
        self.assertTrue(M.es_fallo_hermes(texto))

    def test_solo_no_local_fallback(self):
        """La frase «no local fallback» por sí sola ya es fallo."""
        self.assertTrue(M.es_fallo_hermes("no local fallback"))

    def test_solo_gateway_connection_failed(self):
        """La frase «gateway connection failed» por sí sola ya es fallo."""
        self.assertTrue(M.es_fallo_hermes("gateway connection failed"))

    def test_respuesta_normal_dos_lineas_no_es_fallo(self):
        """Una respuesta normal de dos líneas no se cuenta como fallo."""
        normal = "Hola, todo bien.\n¿En qué te ayudo?"
        self.assertFalse(M.es_fallo_hermes(normal))

    def test_respuesta_larga_no_es_fallo_aunque_tenga_palabras_sueltas(self):
        """Texto largo (>600 chars) con palabras sueltas no es fallo."""
        largo = "Esto es una respuesta larga. " * 50
        self.assertFalse(M.es_fallo_hermes(largo))

    def test_fallos_previos_siguen_funcionando(self):
        """Los fallos ya existentes no se rompen."""
        self.assertTrue(M.es_fallo_hermes("kept failing over"))
        self.assertTrue(M.es_fallo_hermes("every provider in the fallback chain"))
        self.assertTrue(M.es_fallo_hermes("invalid api key"))


if __name__ == "__main__":
    unittest.main()