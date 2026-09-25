# -*- coding: utf-8 -*-
"""Director de consumo: decide las alertas con números medidos (sin red)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_consumo as V


class Evaluar(unittest.TestCase):
    def test_lo_del_25_09_salta(self):
        # Lo que se midió el día del bloqueo: el Mando pidiendo el bus sin parar.
        filas = [{"ruta": "/rest/v1/relevo_eventos", "ua": "node", "st": "402", "n": 2750, "pesadas": 900}]
        a = V.evaluar(filas, {})
        self.assertTrue(any(x.startswith("CRÍTICO") for x in a))
        self.assertTrue(any("node" in x and "2750" in x for x in a))
        self.assertTrue(any("pesadas" in x for x in a))

    def test_trafico_normal_no_alerta(self):
        filas = [
            {"ruta": "/rest/v1/astraura_state", "ua": "curl/8.21.0", "st": "200", "n": 41, "pesadas": 0},
            {"ruta": "/rest/v1/relevo_eventos", "ua": "node", "st": "200", "n": 80, "pesadas": 1},
        ]
        self.assertEqual(V.evaluar(filas, {"coste_hoy": 0.0002, "techo_dia": 0.2, "saldo": 9.5}), [])

    def test_sin_medir_no_inventa(self):
        self.assertEqual(V.evaluar(None, {}), [])

    def test_jev_cerca_del_techo_y_saldo_bajo(self):
        a = V.evaluar([], {"coste_hoy": 0.18, "techo_dia": 0.2, "saldo": 1.2})
        self.assertEqual(len(a), 2)
        self.assertIn("Jev", a[0])
        self.assertIn("OpenRouter", a[1])

    def test_resumen_legible(self):
        texto = V.resumen({"supabase": {"peticiones_hora": 120}, "alertas": []})
        self.assertEqual(texto, "Supabase 120 pet/h · alertas: ninguna")


if __name__ == "__main__":
    unittest.main()
