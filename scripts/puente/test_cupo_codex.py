# -*- coding: utf-8 -*-
"""Pruebas de cupo_codex.py, con la salida real del 17/09."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cupo_codex as C

#: Literal del log de CU3b, RS3b, RS1p y las dos del Dream.
REAL = ("ERROR: You've hit your usage limit. Upgrade to Pro "
        "(https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage")

AHORA = 1_700_000_000.0


class TestDeteccion(unittest.TestCase):
    def test_la_salida_real_de_hoy(self):
        self.assertTrue(C.agotado_en(REAL))

    def test_no_confunde_otros_errores(self):
        # Mismo código de salida, reacción opuesta: aquí hay que cambiar de
        # modelo, no esperar tres horas.
        self.assertFalse(C.agotado_en("ERROR: model 'gpt-9' does not exist"))
        self.assertFalse(C.agotado_en("error: the argument '--sandbox' cannot be used"))

    def test_vacio_no_es_agotamiento(self):
        self.assertFalse(C.agotado_en(""))
        self.assertFalse(C.agotado_en(None))

    def test_da_igual_como_lo_escriban(self):
        for t in ("Usage limit reached for your plan", "QUOTA EXCEEDED", "Upgrade to Pro"):
            self.assertTrue(C.agotado_en(t), t)


class TestVigencia(unittest.TestCase):
    def test_recien_anotado_sigue_agotado(self):
        marca = {"hasta": C.hasta_cuando(AHORA)}
        self.assertTrue(C.sigue_agotado(marca, AHORA))

    def test_pasadas_las_horas_vuelve(self):
        marca = {"hasta": C.hasta_cuando(AHORA)}
        self.assertFalse(C.sigue_agotado(marca, AHORA + C.HORAS * 3600 + 1))

    def test_marca_ilegible_deja_intentar(self):
        # Ante la duda se intenta: perder un turno es más barato que renunciar a
        # la suscripción entera por un archivo corrupto.
        for mala in ({}, None, {"hasta": "ayer"}, {"otra": 1}, "texto"):
            self.assertFalse(C.sigue_agotado(mala, AHORA))

    def test_los_minutos_se_pueden_decir_sin_mentir(self):
        marca = {"hasta": AHORA + 90 * 60}
        self.assertEqual(C.minutos_restantes(marca, AHORA), 90)
        self.assertEqual(C.minutos_restantes({}, AHORA), 0)


class TestVentana(unittest.TestCase):
    def test_tres_horas_por_defecto(self):
        self.assertAlmostEqual(C.hasta_cuando(AHORA) - AHORA, 3 * 3600, places=3)

    def test_se_puede_ajustar(self):
        self.assertAlmostEqual(C.hasta_cuando(AHORA, horas=0.5) - AHORA, 1800, places=3)


class TestDisco(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, "codex-cupo.json")

    def test_ida_y_vuelta(self):
        self.assertTrue(C.puede_escribir(self.ruta))          # sin archivo: adelante
        C.anotar("prueba", ruta=self.ruta)
        self.assertFalse(C.puede_escribir(self.ruta))         # anotado: se aparta
        self.assertTrue(C.puede_escribir(self.ruta, ahora=__import__("time").time() + 4 * 3600))

    def test_anotar_dice_cuanto(self):
        self.assertGreater(C.anotar("prueba", ruta=self.ruta), 100)

    def test_archivo_roto_no_revienta(self):
        with open(self.ruta, "w", encoding="utf-8") as f:
            f.write("{ esto no es json")
        self.assertEqual(C.leer(self.ruta), {})
        self.assertTrue(C.puede_escribir(self.ruta))


if __name__ == "__main__":
    unittest.main()
