# -*- coding: utf-8 -*-
"""Pruebas de espera_de_dependencias.py, con el caso real del 16/09."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import espera_de_dependencias as E


class TestCumplida(unittest.TestCase):
    def test_commit_cuenta(self):
        self.assertTrue(E.cumplida("commit"))

    def test_sin_cambios_no_cuenta(self):
        # Ola 264: G3 corrió con J1 en «sin_cambios» y buscó un archivo que
        # nunca llegó a main. Terminada no es integrada.
        self.assertFalse(E.cumplida("sin_cambios"))

    def test_nada_no_cuenta(self):
        self.assertFalse(E.cumplida(None))
        self.assertFalse(E.cumplida(""))


class TestVeredicto(unittest.TestCase):
    def test_todas_integradas_arranca(self):
        self.assertEqual(E.veredicto(["commit", "commit"]), "sigue")

    def test_el_caso_de_esta_noche(self):
        # SA3 esperaba a SA1 y SA2. Cuando estaban «fallo_tests» la daban por
        # muerta; ahora espera, y cuando pasan a commit arranca sola.
        self.assertEqual(E.veredicto(["fallo_tests", "fallo_tests"]), "espera")
        self.assertEqual(E.veredicto(["commit", "commit"]), "sigue")

    def test_dependencia_en_curso_es_espera(self):
        self.assertEqual(E.veredicto(["en_curso"]), "espera")

    def test_dependencia_rechazada_es_bloqueo(self):
        self.assertEqual(E.veredicto(["rechazada"]), "bloqueo")

    def test_una_muerta_entre_varias_manda(self):
        self.assertEqual(E.veredicto(["commit", "bloqueante", "en_curso"]), "bloqueo")

    def test_sin_nadie_trabajando_la_espera_se_cierra(self):
        # Si no queda nadie escribiendo, esperar es esperar a nadie.
        self.assertEqual(E.veredicto(["en_curso"], hay_alguien_trabajando=False), "bloqueo")

    def test_sin_dependencias_siempre_arranca(self):
        self.assertEqual(E.veredicto([]), "sigue")
        self.assertEqual(E.veredicto([], hay_alguien_trabajando=False), "sigue")


class TestMotivo(unittest.TestCase):
    def test_esperar_se_dice_como_esperar(self):
        f = E.motivo(["SA1", "SA2"], ["commit", "en_curso"], "espera")
        self.assertIn("esperando", f)
        self.assertIn("SA2 (en_curso)", f)
        self.assertNotIn("SA1", f)      # la cumplida no se nombra

    def test_bloquear_se_dice_como_bloquear(self):
        f = E.motivo(["CU1"], ["rechazada"], "bloqueo")
        self.assertIn("dependencia no integrada", f)
        self.assertIn("CU1 (rechazada)", f)

    def test_sin_malas_no_hay_frase(self):
        self.assertEqual(E.motivo(["A"], ["commit"], "sigue"), "")


if __name__ == "__main__":
    unittest.main()
