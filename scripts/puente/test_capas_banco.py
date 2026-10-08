#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import capas_banco as cb

class TestCapasBanco(unittest.TestCase):
    def test_evaluar_latencia_no_cero(self):
        def fake_http(url, payload):
            return {"usage": {"total_tokens": 100}, "score": 0.9}
        res = cb.evaluar("modelo-x", {"id": "t1"}, fake_http)
        self.assertGreaterEqual(res["latencia"], 0.0)
        self.assertGreater(res["tok_s"], 0)

    def test_promover_gana(self):
        nuevo = {"acierto": 0.9, "latencia": 1.0}
        actual = {"acierto": 0.8, "latencia": 2.0}
        dec = cb.promover(nuevo, actual)
        self.assertEqual(dec["accion"], "promover")
        self.assertIn("respaldo_hasta", dec)

    def test_promover_empate_menos_coste(self):
        nuevo = {"acierto": 0.8, "latencia": 0.5}
        actual = {"acierto": 0.8, "latencia": 1.0}
        dec = cb.promover(nuevo, actual)
        self.assertEqual(dec["accion"], "promover")

    def test_promover_no_gana(self):
        nuevo = {"acierto": 0.7, "latencia": 0.5}
        actual = {"acierto": 0.8, "latencia": 1.0}
        dec = cb.promover(nuevo, actual)
        self.assertEqual(dec["accion"], "mantener")

    def test_juez_inyectable(self):
        estado = {"acierto": 0.9}
        def juez(estado):
            return 0.95
        p = cb.decidir_consultar(estado, juez)
        self.assertAlmostEqual(p, 0.95)

if __name__ == "__main__":
    unittest.main()
