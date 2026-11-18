# -*- coding: utf-8 -*-
"""Pruebas DIR1118R: es_fallo_hermes reconoce el error de gateway de Hermes."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M


class TestFalloHermesGateway(unittest.TestCase):
    """DIR1118R: el texto 'Error: Gateway connection failed; no local fallback'
    y 'no local fallback' cuentan como fallo, no como respuesta."""

    def test_error_gateway_connection_failed_es_fallo(self):
        texto = "Error: Gateway connection failed; no local fallback"
        self.assertTrue(M.es_fallo_hermes(texto))

    def test_no_local_fallback_es_fallo(self):
        self.assertTrue(M.es_fallo_hermes("no local fallback"))

    def test_respuesta_normal_dos_lineas_no_es_fallo(self):
        respuesta = "Hola, todo bien.\n¿En qué te ayudo?"
        self.assertFalse(M.es_fallo_hermes(respuesta))

    def test_respuesta_normal_larga_no_es_fallo(self):
        respuesta = "Esta es una respuesta normal del director que tiene varias líneas\n" + "x" * 700
        self.assertFalse(M.es_fallo_hermes(respuesta))


if __name__ == "__main__":
    unittest.main()