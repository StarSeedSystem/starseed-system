# -*- coding: utf-8 -*-
"""Pruebas de colibri_nodo (CLB1027E): qué cabe en cada neurona y el plan de instalación sin ejecutar.

Casos de la tarea: el A1 (12 GB, 18,5 GB libres) solo deja Laya y GLiNER2.5-Decide, y Qwen3-Coder
no; la Mac (8 GB con presión) no deja a ninguno. Sin red, sin descargas, sin tocar el disco.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import colibri_nodo as C  # noqa: E402


class PruebaCaben(unittest.TestCase):
    def setUp(self):
        self.entradas = C.entradas()

    def test_catalogo(self):
        ids = {e["id"] for e in self.entradas}
        self.assertEqual(len(self.entradas), 9)
        self.assertIn("colibri-laya", ids)
        self.assertIn("colibri-gliner-decide", ids)
        self.assertIn("colibri-qwen3-coder-30b", ids)

    def test_a1(self):
        filas = C.caben(self.entradas, 12, 18.5)
        self.assertEqual([f["id"] for f in filas if f["veredicto"] == "cabe"],
                         ["colibri-laya", "colibri-gliner-decide"])

    def test_a1_qwen3_coder_no_lo_frena_el_disco(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 12, 18.5)}
        qwen = filas["colibri-qwen3-coder-30b"]
        self.assertEqual(qwen["veredicto"], "no cabe")
        self.assertIn("disco", qwen["porque"])

    def test_a1_olmoe_no_por_margen(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 12, 18.5)}
        self.assertEqual(filas["colibri-olmoe-7b"]["veredicto"], "no cabe")
        self.assertIn("sin margen", filas["colibri-olmoe-7b"]["porque"])

    def test_mac_con_presion_ninguno(self):
        filas = C.caben(self.entradas, 8, 5, presion_alta=True)
        self.assertEqual({f["veredicto"] for f in filas}, {"no cabe"})
        self.assertTrue(all("presión" in f["porque"] for f in filas))

    def test_orden_completo_y_porques(self):
        filas = C.caben(self.entradas, 12, 18.5)
        self.assertEqual([f["id"] for f in filas], [e["id"] for e in self.entradas])
        self.assertTrue(all(f["porque"] and f["capa"] for f in filas))
        laya = filas[0]
        self.assertEqual(laya["veredicto"], "cabe")
        self.assertEqual(laya["capa"], "juicio")

    def test_streaming_en_neurona_grande(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 20, 200)}
        reap = filas["colibri-deepseek-v4-flash-reap"]
        self.assertEqual(reap["veredicto"], "cabe en streaming (disco rápido)")
        self.assertIn("expertos del disco", reap["porque"])
        qwen38 = filas["colibri-qwen38-flash-next"]
        self.assertEqual(qwen38["veredicto"], "no cabe")
        self.assertIn("RAM insuficiente", qwen38["porque"])

    def test_neurona_dedicada_sin_margen(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 60, 100, margen_gb=0)}
        self.assertEqual(filas["colibri-deepseek-v4-flash-reap"]["veredicto"], "cabe")
        self.assertEqual(filas["colibri-clef"]["veredicto"], "cabe")


class PruebaPlan(unittest.TestCase):
    def test_plan_laya_tres_ordenes_como_listas(self):
        plan = C.plan_instalacion("colibri-laya", "/srv/colibri")
        self.assertEqual(len(plan), 3)
        clon, prepara, sirve = (paso["args"] for paso in plan)
        self.assertEqual(clon[0], "git")
        self.assertIn("--branch", clon)
        self.assertIn("v2.0.0", clon)
        self.assertIn("https://github.com/JustVugg/colibri", clon)
        self.assertIn("/srv/colibri", clon[-1])
        self.assertEqual(prepara, ["./start-here.sh", "--model", "colibri-laya",
                                   "--dir", "/srv/colibri", "--yes", "--no-gpu"])
        self.assertEqual(sirve[sirve.index("--host") + 1], "127.0.0.1")
        self.assertEqual(sirve[sirve.index("--port") + 1], "4480")

    def test_id_desconocido(self):
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-no-existe", "/srv")


if __name__ == "__main__":
    unittest.main()
