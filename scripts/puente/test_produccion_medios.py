# -*- coding: utf-8 -*-
"""Tests de funciones puras del director de producción (PRD1005C).
Solo funciones puras exportadas; sin red, sin disco real, sin procesos lanzados.
No se usa vi.mock ni se importa route.ts (esto es Python, no TypeScript).
"""
import unittest
from scripts.puente import produccion_medios_impl as imp
from scripts.puente import produccion_medios as pm


class TestProduccionMediosPuro(unittest.TestCase):
    def test_web_publicar_seco(self):
        detalle, ok = imp.web_publicar({"sha": "abc123"}, lambda *a, **k: None, seco=True)
        self.assertTrue(ok)
        self.assertIn("seco", detalle)

    def test_web_confirmar_sin_sha(self):
        ok, detalle = imp.web_confirmar({})
        self.assertFalse(ok)
        self.assertIn("sin sha", detalle)

    def test_web_confirmar_con_sha(self):
        ok, detalle = imp.web_confirmar({"sha": "abc"})
        self.assertTrue(ok)
        self.assertIn("abc", detalle)

    def test_astraura_publicar_en_pausa(self):
        detalle, ok = pm.AstrauraProduccion().publicar({})
        self.assertFalse(ok)
        self.assertIn("en pausa", detalle)


if __name__ == "__main__":
    unittest.main()
