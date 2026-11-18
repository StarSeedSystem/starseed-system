# -*- coding: utf-8 -*-
"""Tests para es_fallo_hermes (DIR1118R)."""

import unittest
from scripts.puente.motores_director import es_fallo_hermes


class TestEsFalloHermes(unittest.TestCase):
    """Pruebas de la función es_fallo_hermes."""

    def test_gateway_connection_failed(self):
        """Debe devolver True para el error 'Gateway connection failed; no local fallback'."""
        texto = "Error: Gateway connection failed; no local fallback"
        self.assertTrue(es_fallo_hermes(texto))

    def test_no_local_fallback_alone(self):
        """Debe devolver True para 'no local fallback' solo."""
        texto = "no local fallback"
        self.assertTrue(es_fallo_hermes(texto))

    def test_normal_response_two_lines(self):
        """Debe devolver False para una respuesta normal de dos líneas."""
        texto = "Primera línea de respuesta.\nSegunda línea de respuesta."
        self.assertFalse(es_fallo_hermes(texto))

    def test_existing_fallback_chain(self):
        """Debe seguir detectando los fallos anteriores."""
        texto = "kept failing over every provider in the fallback chain"
        self.assertTrue(es_fallo_hermes(texto))

    def test_invalid_api_key(self):
        """Debe seguir detectando 'invalid api key'."""
        texto = "invalid api key"
        self.assertTrue(es_fallo_hermes(texto))

    def test_empty_text(self):
        """Texto vacío no es un fallo conocido (longitud < 600 pero sin marcadores)."""
        self.assertFalse(es_fallo_hermes(""))

    def test_long_text_not_fallo(self):
        """Texto largo (> 600 chars) no se considera fallo aunque contenga marcador."""
        texto = "x" * 700 + " gateway connection failed"
        self.assertFalse(es_fallo_hermes(texto))


if __name__ == "__main__":
    unittest.main()