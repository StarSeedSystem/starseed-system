# -*- coding: utf-8 -*-
"""Pruebas de `trabajadores_para` y sus pies (DEC1028B, oracle_a1.py)."""
import calendar
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_a1 as A  # noqa: E402


def t_utc(hh, mm, dia=28):
    """Época de un momento UTC del 2026-10-28."""
    return calendar.timegm((2026, 10, dia, hh, mm, 0, 0, 0, 0))


class FranjaNocturna(unittest.TestCase):
    def test_la_franja_es_de_00_40_a_05_40_utc(self):
        self.assertFalse(A.en_franja_nocturna(t_utc(0, 39)))
        self.assertTrue(A.en_franja_nocturna(t_utc(0, 40)))
        self.assertTrue(A.en_franja_nocturna(t_utc(3, 40)))
        self.assertTrue(A.en_franja_nocturna(t_utc(5, 39)))
        self.assertFalse(A.en_franja_nocturna(t_utc(5, 40)))
        self.assertFalse(A.en_franja_nocturna(t_utc(12, 0)))


class CapaDeLaEntrada(unittest.TestCase):
    def test_capas_encendidas_en_los_dos_formatos(self):
        self.assertTrue(A.capas_encendidas_entrada({"capas": {"juicio": True, "palabra": False}}))
        self.assertTrue(A.capas_encendidas_entrada({"capas": {"juicio": {"encendida": True}}}))
        self.assertTrue(A.capas_encendidas_entrada({"juicio": {"encendida": 1}}))
        self.assertFalse(A.capas_encendidas_entrada({"capas": {"juicio": False}}))
        self.assertFalse(A.capas_encendidas_entrada({}))
        self.assertFalse(A.capas_encendidas_entrada(None))


class TrabajadoresPara(unittest.TestCase):
    def test_a_las_02_00_con_colibri_y_automejora_queda_el_minimo(self):
        self.assertEqual(A.trabajadores_para(3, t_utc(2, 0), True, True), 1)

    def test_a_las_02_00_solo_con_colibri(self):
        self.assertEqual(A.trabajadores_para(3, t_utc(2, 0), True, False), 2)

    def test_a_las_02_00_solo_con_automejora(self):
        self.assertEqual(A.trabajadores_para(3, t_utc(2, 0), False, True), 2)

    def test_a_las_02_00_sola_la_maquina_no_resta(self):
        self.assertEqual(A.trabajadores_para(3, t_utc(2, 0), False, False), 3)

    def test_a_las_12_00_solo_cuenta_colibri_automejora_fuera_de_franja(self):
        self.assertEqual(A.trabajadores_para(3, t_utc(12, 0), True, True), 2)
        self.assertEqual(A.trabajadores_para(3, t_utc(12, 0), False, True), 3)

    def test_nunca_menos_de_uno(self):
        self.assertEqual(A.trabajadores_para(1, t_utc(2, 0), True, True), 1)
        self.assertEqual(A.trabajadores_para(2, t_utc(2, 0), True, True), 1)
        self.assertEqual(A.trabajadores_para(0, t_utc(2, 0), False, False), 1)


if __name__ == "__main__":
    unittest.main()
