# -*- coding: utf-8 -*-
"""Tests unitarios de jev_reservadas (unittest puro)."""

import unittest

from jev_reservadas import RESERVADAS, exige_humano, solo_puede_vetar


class TestReservadas(unittest.TestCase):
    def test_todas_las_reservadas_devuelven_true(self):
        for dominio in RESERVADAS:
            with self.subTest(dominio=dominio):
                self.assertTrue(exige_humano(dominio))
                self.assertTrue(solo_puede_vetar(dominio))

    def test_dominio_normal_devuelve_false(self):
        self.assertFalse(exige_humano("escribir-codigo"))
        self.assertFalse(exige_humano("revisar-pr"))
        self.assertFalse(solo_puede_vetar("escribir-codigo"))
        self.assertFalse(solo_puede_vetar("revisar-pr"))

    def test_normalizacion_mayusculas_guiones_espacios(self):
        # Mayúsculas
        self.assertTrue(exige_humano("INTEGRAR-MAIN"))
        self.assertTrue(exige_humano("Publicar"))
        self.assertTrue(exige_humano("PUSH"))
        # Guiones y espacios mezclados
        self.assertTrue(exige_humano("integrar main"))
        self.assertTrue(exige_humano("integrar_main"))
        self.assertTrue(exige_humano("borrar datos"))
        self.assertTrue(exige_humano("BORRAR-DATOS"))
        self.assertTrue(exige_humano("  integrar-main  "))

    def test_desconocido_devuelve_false(self):
        self.assertFalse(exige_humano("dominio-inexistente"))
        self.assertFalse(exige_humano(""))
        self.assertFalse(exige_humano(None))
        self.assertFalse(solo_puede_vetar("dominio-inexistente"))
        self.assertFalse(solo_puede_vetar(""))
        self.assertFalse(solo_puede_vetar(None))

    def test_lista_sin_duplicados(self):
        self.assertEqual(len(RESERVADAS), len(set(RESERVADAS)))

    def test_solo_puede_vetar_es_alias_y_dice_por_que(self):
        for dominio in RESERVADAS:
            with self.subTest(dominio=dominio):
                resultado = solo_puede_vetar(dominio)
                self.assertTrue(resultado)


if __name__ == "__main__":
    unittest.main()