# -*- coding: utf-8 -*-
"""Pruebas de jev_reservadas: lo que Jev y Laya nunca aprueban solos (JLA1116A).

Contrato: architecture/jev-entrena-laya.md §7. Todo puro: sin red, sin disco, sin reloj.
"""

import unittest

import jev_reservadas


class TestExigeHumano(unittest.TestCase):
    def test_cada_reservada_exige_humano(self):
        for dominio in jev_reservadas.RESERVADAS:
            with self.subTest(dominio=dominio):
                self.assertTrue(jev_reservadas.exige_humano(dominio))

    def test_dominio_normal_devuelve_false(self):
        self.assertFalse(jev_reservadas.exige_humano("triaje-de-suenos"))
        self.assertFalse(jev_reservadas.exige_humano("elegir-escritor"))

    def test_desconocido_y_vacio_devuelven_false(self):
        self.assertFalse(jev_reservadas.exige_humano("dominio-inexistente"))
        self.assertFalse(jev_reservadas.exige_humano(""))
        self.assertFalse(jev_reservadas.exige_humano("   "))


class TestNormalizacion(unittest.TestCase):
    def test_mayusculas_espacios_y_guiones_repetidos(self):
        self.assertTrue(jev_reservadas.exige_humano("Integrar Main"))
        self.assertTrue(jev_reservadas.exige_humano("  INTEGRAR--MAIN  "))
        self.assertTrue(jev_reservadas.exige_humano("PUBLICAR"))

    def test_subrayados_y_mayusculas(self):
        self.assertTrue(jev_reservadas.exige_humano("borrar_datos"))
        self.assertTrue(jev_reservadas.exige_humano("Gasto_Sobre Techo"))


class TestLista(unittest.TestCase):
    def test_sin_duplicados(self):
        self.assertEqual(
            len(jev_reservadas.RESERVADAS),
            len(set(jev_reservadas.RESERVADAS)),
        )

    def test_sin_vacios(self):
        for dominio in jev_reservadas.RESERVADAS:
            with self.subTest(dominio=dominio):
                self.assertEqual(dominio, jev_reservadas.normalizar_dominio(dominio))


class TestSoloPuedeVetar(unittest.TestCase):
    def test_cada_reservada_puede_vetar_y_dice_por_que(self):
        for dominio in jev_reservadas.RESERVADAS:
            with self.subTest(dominio=dominio):
                veta, motivo = jev_reservadas.solo_puede_vetar(dominio)
                self.assertTrue(veta)
                self.assertTrue(motivo.strip())

    def test_dominio_normal_no_veta_y_no_dice_nada(self):
        veta, motivo = jev_reservadas.solo_puede_vetar("Desconocido Total")
        self.assertFalse(veta)
        self.assertEqual(motivo, "")


if __name__ == "__main__":
    unittest.main()
