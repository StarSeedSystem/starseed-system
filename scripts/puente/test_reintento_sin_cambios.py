#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Casos de reintento_sin_cambios: quién merece un segundo proveedor y quién no."""

import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reconciliar_progreso import en_main
from reintento_sin_cambios import candidatas, marcar, NOTA_REINTENTO

MODELOS = ["apinex/free/gemini-3.8-flash", "apinex/free/muse-spark-1.3"]


def prog(tid, **kw):
    return {
        tid: {"estado": "sin_cambios", "modelo": "apinex/free/muse-spark-1.3", **kw}
    }


class ReintentoSinCambios(unittest.TestCase):
    def test_sin_rastro_en_main_es_candidata(self):
        c = candidatas(prog("p316E"), ["ola zzz: otra cosa"], MODELOS)
        self.assertEqual(c, [("p316E", "apinex/free/gemini-3.8-flash")])

    def test_en_main_no_se_reintenta(self):
        c = candidatas(prog("p316E"), ["p316E integra el módulo"], MODELOS)
        self.assertEqual(c, [])

    def test_ya_reintentada_no_se_reintenta(self):
        c = candidatas(prog("p316E", reintentos=1), [], MODELOS)
        self.assertEqual(c, [])

    def test_evita_el_mismo_modelo(self):
        c = candidatas(prog("p316E"), [], ["apinex/free/muse-spark-1.3"])
        self.assertEqual(c, [])

    def test_lista_vacia(self):
        self.assertEqual(candidatas({}, [], MODELOS), [])
        self.assertEqual(candidatas(prog("p316E"), [], []), [])

    def test_marcar_devuelve_copia(self):
        p = prog("p316E")
        nuevo = marcar(p, "p316E", "apinex/free/gemini-3.8-flash")
        e = nuevo["p316E"]
        self.assertEqual(e["estado"], "pendiente")
        self.assertEqual(e["reintentos"], 1)
        self.assertEqual(e["nota"], NOTA_REINTENTO % "apinex/free/gemini-3.8-flash")
        self.assertEqual(p["p316E"]["estado"], "sin_cambios")  # el original intacto


if __name__ == "__main__":
    unittest.main()
