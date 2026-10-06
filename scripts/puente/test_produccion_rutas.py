# -*- coding: utf-8 -*-
"""Tests puros de produccion_rutas (unittest, sin red ni disco)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from produccion_rutas import (
    RUTAS_NUCLEO,
    PRESUPUESTO_LCP_ESCRITORIO_MS,
    PRESUPUESTO_LCP_MOVIL_MS,
    carpeta_capturas_segura,
    comparar,
    presupuestos,
    rutas_del_lote,
)


class TestRutasDelLote(unittest.TestCase):
    def test_none_devuelve_solo_nucleo(self):
        self.assertEqual(rutas_del_lote(None), list(RUTAS_NUCLEO))

    def test_vacio_devuelve_solo_nucleo(self):
        self.assertEqual(rutas_del_lote([]), list(RUTAS_NUCLEO))

    def test_tocadas_primero_luego_nucleo(self):
        archivos = ["src/app/(main)/red/page.tsx"]
        self.assertEqual(rutas_del_lote(archivos), ["/red"] + list(RUTAS_NUCLEO))

    def test_sin_duplicados_con_nucleo(self):
        archivos = ["src/app/(app)/login/page.tsx", "src/app/login/page.tsx"]
        self.assertEqual(rutas_del_lote(archivos), ["/login", "/", "/escritorios", "/nexus"])

    def test_archivo_que_no_da_ruta(self):
        self.assertEqual(rutas_del_lote(["src/lib/x.ts"]), list(RUTAS_NUCLEO))


class TestPresupuestos(unittest.TestCase):
    def test_movil(self):
        self.assertEqual(presupuestos(430), {"ttfb_ms": 800, "lcp_ms": 4000})

    def test_escritorio(self):
        self.assertEqual(presupuestos(1920), {"ttfb_ms": 800, "lcp_ms": 2500})

    def test_limite_tablet(self):
        self.assertEqual(presupuestos(768), {"ttfb_ms": 800, "lcp_ms": 2500})


class TestCarpetaCapturasSegura(unittest.TestCase):
    def test_sha_normal(self):
        self.assertEqual(
            carpeta_capturas_segura("/tmp/base", "Ab12C"),
            os.path.join("/tmp/base", "ab12c"),
        )

    def test_sha_con_travesia_se_sanea(self):
        carpeta = carpeta_capturas_segura("/tmp/base", "../../evil")
        self.assertTrue(carpeta.startswith(os.path.abspath("/tmp/base")))

    def test_sha_vacio_o_none(self):
        self.assertTrue(carpeta_capturas_segura("/tmp/base", None).endswith("sin-sha"))


class TestComparar(unittest.TestCase):
    def setUp(self):
        self.buena = {
            "/": {"status": 200, "ttfb_ms": 300, "lcp_ms": 1800},
            "/login": {"status": 200, "ttfb_ms": 250, "lcp_ms": 1500},
            "/rota": {"status": 500, "ttfb_ms": 100, "lcp_ms": 900},
        }

    def test_sin_cambios_no_avisa(self):
        actual = {
            "/": {"status": 200, "ttfb_ms": 320, "lcp_ms": 1850},
            "/login": {"status": 200, "ttfb_ms": 260, "lcp_ms": 1520},
        }
        self.assertEqual(comparar(actual, self.buena), {"bloqueos": [], "avisos": []})

    def test_bloqueo_por_status(self):
        actual = {"/": {"status": 500, "ttfb_ms": 300, "lcp_ms": 1800}}
        resultado = comparar(actual, self.buena)
        self.assertEqual(len(resultado["bloqueos"]), 2)
        self.assertEqual(resultado["bloqueos"][0]["ruta"], "/")
        self.assertEqual(resultado["bloqueos"][1]["ruta"], "/login")

    def test_bloqueo_por_ruta_ausente(self):
        resultado = comparar({}, self.buena)
        self.assertEqual([b["ruta"] for b in resultado["bloqueos"]], ["/", "/login"])

    def test_aviso_por_lentitud(self):
        actual = {"/": {"status": 200, "ttfb_ms": 500, "lcp_ms": 1800}}
        resultado = comparar(actual, self.buena)
        self.assertEqual(len(resultado["avisos"]), 1)
        self.assertEqual(resultado["avisos"][0]["metrica"], "ttfb_ms")

    def test_lo_que_ya_estaba_roto_no_bloquea(self):
        actual = {
            "/": {"status": 200, "ttfb_ms": 300, "lcp_ms": 1800},
            "/login": {"status": 200, "ttfb_ms": 250, "lcp_ms": 1500},
            "/rota": {"status": 404, "ttfb_ms": 100, "lcp_ms": 900},
        }
        self.assertEqual(comparar(actual, self.buena), {"bloqueos": [], "avisos": []})

    def test_none_no_explota(self):
        self.assertEqual(comparar(None, None), {"bloqueos": [], "avisos": []})


if __name__ == "__main__":
    import sys
    unittest.main()
