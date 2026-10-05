# -*- coding: utf-8 -*-
"""Tests puros de produccion_rutas (unittest, sin red ni disco)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from produccion_rutas import (
    PRESUPUESTO_LCP_ESCRITORIO_MS,
    PRESUPUESTO_LCP_MOVIL_MS,
    RUTAS_NUCLEO,
    comparar,
    presupuesto_lcp_ms,
    rutas_del_lote,
)


class TestRutasDelLote(unittest.TestCase):
    def test_siempre_incluye_nucleo(self):
        self.assertEqual(rutas_del_lote([]), list(RUTAS_NUCLEO))
        self.assertEqual(rutas_del_lote(None), list(RUTAS_NUCLEO))

    def test_tocadas_primero_y_nucleo_despues(self):
        rutas = rutas_del_lote(["src/app/(app)/mando/page.tsx"])
        self.assertEqual(rutas[0], "/mando")
        self.assertEqual(rutas[1:], list(RUTAS_NUCLEO))

    def test_sin_duplicados_con_nucleo(self):
        rutas = rutas_del_lote(["src/app/(app)/nexus/page.tsx"])
        self.assertEqual(rutas.count("/nexus"), 1)

    def test_archivo_sin_ruta_solo_nucleo(self):
        self.assertEqual(rutas_del_lote(["src/lib/mando/colas.ts"]), list(RUTAS_NUCLEO))


class TestPresupuestoLcp(unittest.TestCase):
    def test_movil(self):
        self.assertEqual(presupuesto_lcp_ms(360), PRESUPUESTO_LCP_MOVIL_MS)
        self.assertEqual(presupuesto_lcp_ms(430), PRESUPUESTO_LCP_MOVIL_MS)

    def test_escritorio(self):
        self.assertEqual(presupuesto_lcp_ms(768), PRESUPUESTO_LCP_ESCRITORIO_MS)
        self.assertEqual(presupuesto_lcp_ms(1920), PRESUPUESTO_LCP_ESCRITORIO_MS)

    def test_valores_raros_dan_escritorio(self):
        self.assertEqual(presupuesto_lcp_ms(None), PRESUPUESTO_LCP_ESCRITORIO_MS)
        self.assertEqual(presupuesto_lcp_ms("x"), PRESUPUESTO_LCP_ESCRITORIO_MS)


def _punto(estado=200, ttfb=100, lcp=1000):
    return {"estado": estado, "ttfb_ms": ttfb, "lcp_ms": lcp}


class TestComparar(unittest.TestCase):
    def test_sin_cambios_sin_nada(self):
        buena = {"/": _punto()}
        self.assertEqual(comparar({"/": _punto()}, buena), {"bloqueos": [], "avisos": []})

    def test_bloquea_ruta_que_deja_de_dar_400(self):
        buena = {"/nexus": _punto(200)}
        actual = {"/nexus": _punto(500)}
        resultado = comparar(actual, buena)
        self.assertEqual(len(resultado["bloqueos"]), 1)
        self.assertIn("/nexus", resultado["bloqueos"][0])
        self.assertEqual(resultado["avisos"], [])

    def test_no_bloquea_si_antes_ya_fallaba(self):
        buena = {"/nexus": _punto(404)}
        actual = {"/nexus": _punto(500)}
        self.assertEqual(comparar(actual, buena), {"bloqueos": [], "avisos": []})

    def test_avisa_mas_de_15_veces_lcp(self):
        buena = {"/": _punto(lcp=1000)}
        actual = {"/": _punto(lcp=1600)}
        resultado = comparar(actual, buena)
        self.assertEqual(resultado["bloqueos"], [])
        self.assertEqual(len(resultado["avisos"]), 1)
        self.assertIn("lcp_ms", resultado["avisos"][0])

    def test_no_avisa_justo_en_15(self):
        buena = {"/": _punto(ttfb=100)}
        actual = {"/": _punto(ttfb=150)}
        self.assertEqual(comparar(actual, buena)["avisos"], [])

    def test_ruta_nueva_sin_historial_no_dice_nada(self):
        self.assertEqual(comparar({"/nueva": _punto()}, {}), {"bloqueos": [], "avisos": []})

    def test_datos_raros_no_revientan(self):
        self.assertEqual(comparar(None, None), {"bloqueos": [], "avisos": []})
        self.assertEqual(comparar({"/": None}, {"/": {"estado": 200}}),
                         {"bloqueos": [], "avisos": []})


if __name__ == "__main__":
    unittest.main()
