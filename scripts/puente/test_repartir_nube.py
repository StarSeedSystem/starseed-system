#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puertas de repartir_nube: qué se va a la nube y qué se queda en la Mac."""

import os, sys, unittest

sys.path.insert(0, os.path.dirname(__file__))
from repartir_nube import elegir, marcar, MODELO_NUBE

COLAS = [
    (
        "cola-200.json",
        [
            {"id": "A1", "ola": "200"},
            {"id": "A2", "ola": "200"},
            {"id": "A1", "ola": "200"},
        ],
    ),
    ("cola-317.json", [{"id": "B1", "ola": "317"}]),
]
MAIN = ["Ola 200 · A2: ya integrada"]
PROG = {"A1": {"estado": "fallo_tests"}, "A2": {"estado": "fallo"}}


class Elegir(unittest.TestCase):
    def test_candidata_es_la_que_fallo_y_no_esta_en_main_ni_en_la_ola_actual(self):
        r = elegir(COLAS, PROG, MAIN, ola_actual="317")
        self.assertEqual([t["id"] for t in r], ["A1"])
        self.assertEqual(r[0]["modelo"], MODELO_NUBE)

    def test_ola_actual_nunca_se_reparte(self):
        r = elegir(COLAS, {"B1": {}}, [], ola_actual="317")
        self.assertEqual(r, [])

    def test_estados_vivos_o_cerrados_no_se_reparten(self):
        prog = {"A1": {"estado": "pendiente"}, "B1": {"estado": "en_curso"}}
        r = elegir(COLAS, prog, [], ola_actual="999")
        self.assertEqual(r, [])

    def test_tope_recorta(self):
        colas = [("cola-1.json", [{"id": "T%d" % i, "ola": "1"} for i in range(5)])]
        self.assertEqual(len(elegir(colas, {}, [], "999", tope=3)), 3)


class Marcar(unittest.TestCase):
    def test_marca_reasignada_nube_con_fecha(self):
        p = marcar(PROG, ["A1"], "2026-09-13")
        self.assertEqual(p["A1"]["estado"], "reasignada")
        self.assertEqual(p["A1"]["medio"], "nube")
        self.assertIn("2026-09-13", p["A1"]["nota"])
        self.assertEqual(PROG["A1"]["estado"], "fallo_tests")


if __name__ == "__main__":
    unittest.main()
