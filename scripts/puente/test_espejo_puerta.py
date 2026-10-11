# -*- coding: utf-8 -*-
"""Pruebas del espejo de lo publicado de Astraura en la puerta de datos (PDA1012)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from espejo_puerta import decidir_espejo, espejar  # noqa: E402


class PuertaFalsa:
    def __init__(self, configurada=True, via="puerta", error=None):
        self._configurada = configurada
        self.via = via
        self.error = error
        self.puestas = []

    def configurada(self):
        return self._configurada

    def astraura_poner(self, clave, data, respaldo=None):
        self.puestas.append((clave, data))
        r = {"via": self.via}
        if self.error:
            r["error"] = self.error
        return r


class TestDecidir(unittest.TestCase):
    def test_primera_vez_copia(self):
        self.assertEqual(decidir_espejo("https://a.trycloudflare.com", {}, 100)[0], True)

    def test_sin_cambios_no_copia(self):
        previo = {"puerta_url": "https://a.trycloudflare.com", "puerta_t": 100}
        self.assertEqual(decidir_espejo("https://a.trycloudflare.com", previo, 200), (False, "sin cambios"))

    def test_cambio_y_latido(self):
        previo = {"puerta_url": "https://a.trycloudflare.com", "puerta_t": 100}
        self.assertEqual(decidir_espejo("https://b.trycloudflare.com", previo, 200)[1], "cambió")
        self.assertEqual(decidir_espejo("https://a.trycloudflare.com", previo, 100 + 30 * 60)[1], "latido")

    def test_retirada_es_un_cambio(self):
        previo = {"puerta_url": "https://a.sslip.io", "puerta_t": 100}
        self.assertEqual(decidir_espejo(None, previo, 200)[1], "cambió")


class TestEspejar(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, "espejo.json")

    def test_copia_y_recuerda(self):
        p = PuertaFalsa()
        self.assertEqual(espejar("tunel_publico", "https://a.trycloudflare.com", self.ruta, "mac", puerta=p, ahora=1000), "puerta")
        self.assertEqual(p.puestas[0][0], "tunel_publico")
        self.assertEqual(p.puestas[0][1]["url"], "https://a.trycloudflare.com")
        with open(self.ruta, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["puerta_url"], "https://a.trycloudflare.com")
        # Segunda vuelta sin cambios: no vuelve a pedir a la puerta.
        self.assertEqual(espejar("tunel_publico", "https://a.trycloudflare.com", self.ruta, "mac", puerta=p, ahora=1060), "sin-cambios")
        self.assertEqual(len(p.puestas), 1)

    def test_sin_puerta_no_hace_nada(self):
        p = PuertaFalsa(configurada=False)
        self.assertEqual(espejar("destino_fijo", "https://x.sslip.io", self.ruta, puerta=p, ahora=1), "sin-puerta")
        self.assertFalse(os.path.exists(self.ruta))

    def test_fallo_de_la_puerta_no_marca(self):
        p = PuertaFalsa(via="supabase")
        self.assertEqual(espejar("destino_fijo", "https://x.sslip.io", self.ruta, puerta=p, ahora=1), "fallo")
        self.assertFalse(os.path.exists(self.ruta))

    def test_retirada_viaja_como_null(self):
        p = PuertaFalsa()
        espejar("destino_fijo", None, self.ruta, puerta=p, ahora=5)
        self.assertIsNone(p.puestas[0][1]["url"])


if __name__ == "__main__":
    unittest.main()
