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


#: Literal del log del 2026-10-28: 206 sesiones de Codex, todas con este 400.
SIN_MODELO = (
    '{"status":400, "message":"The \'gpt-5.6-sol\' model is not supported when '
    'using Codex with a ChatGPT account.","code":"model_not_found"}'
)


class TestSinModelo(unittest.TestCase):
    """La cuenta de ChatGPT ya no admite el modelo de Codex: no es cuota, no se
    repone en horas y hay que apartarlo por más tiempo (DEC1028C)."""

    def test_la_salida_real_del_28(self):
        self.assertTrue(C.sin_modelo_en(SIN_MODELO))

    def test_la_cuota_agotada_no_es_sin_modelo(self):
        # Dos reacciones opuestas que hoy comparten código de salida.
        self.assertTrue(C.agotado_en(REAL))
        self.assertFalse(C.sin_modelo_en(REAL))
        self.assertFalse(C.agotado_en(SIN_MODELO))

    def test_otro_fallo_de_modelo_no_cuenta(self):
        self.assertFalse(C.sin_modelo_en("ERROR: model 'gpt-9' does not exist"))

    def test_vacio_y_mayusculas(self):
        self.assertFalse(C.sin_modelo_en(""))
        self.assertFalse(C.sin_modelo_en(None))
        self.assertTrue(
            C.sin_modelo_en("MODEL_NOT_FOUND: not supported with a ChatGPT account")
        )

    def test_las_horas_saltan_de_tres_a_ventana_de_dia(self):
        self.assertEqual(C.HORAS_SIN_MODELO, 24)


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
