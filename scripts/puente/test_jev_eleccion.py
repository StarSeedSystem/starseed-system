# -*- coding: utf-8 -*-
from __future__ import annotations
import unittest
import os
from scripts.puente.jev_eleccion import medio_final, activo_por_entorno

class TestJevEleccion(unittest.TestCase):
    def test_activo_por_entorno(self):
        self.assertTrue(activo_por_entorno({"STARSEED_JEV_ELIGE_MEDIO": "1"}))
        self.assertTrue(activo_por_entorno({"STARSEED_JEV_ELIGE_MEDIO": "si"}))
        self.assertFalse(activo_por_entorno({}))
        self.assertFalse(activo_por_entorno({"STARSEED_JEV_ELIGE_MEDIO": "0"}))

    def test_medio_final_inactivo(self):
        plan = "medio_a"
        eleccion = "medio_b"
        medio, motivo = medio_final(plan, eleccion, ["medio_b"], {}, "cola_1", activo=False)
        self.assertEqual(medio, plan)
        self.assertEqual(motivo, "plan")

    def test_medio_final_activo_valido(self):
        plan = "medio_a"
        eleccion = "medio_b"
        sanos = ["medio_b"]
        cola_de = {"medio_b": "cola_1"}
        medio, motivo = medio_final(plan, eleccion, sanos, cola_de, "cola_1", activo=True)
        self.assertEqual(medio, "medio_b")
        self.assertEqual(motivo, "Jev")

    def test_medio_final_no_libre(self):
        plan = "medio_a"
        eleccion = "medio_b"
        sanos = ["medio_c"]
        medio, motivo = medio_final(plan, eleccion, sanos, {}, "cola_1", activo=True)
        self.assertEqual(medio, plan)
        self.assertIn("no está libre/sano", motivo)

if __name__ == "__main__":
    unittest.main()
