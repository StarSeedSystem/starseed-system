#!/usr/bin/env python3
"""Pruebas para el comprobador común del ADN."""
import json, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adn_comprobar

class TestAdnComprobar(unittest.TestCase):
    def setUp(self):
        self.dna = {
            "pruebas": [
                {"id": "p1", "comprobacion": "acento 20–30 %"},
                {"id": "p2", "comprobacion": "máximo 3 tamaños"},
                {"id": "p3", "comprobacion": "titular/cuerpo ≥ 6"},
                {"id": "p4", "comprobacion": "texto ≥ 28 px"},
                {"id": "p5", "comprobacion": "cuerpo ≤ 65 caracteres"},
                {"id": "p6", "comprobacion": "jugada rara 1 vez"},
                {"id": "p7", "comprobacion": "contraste ≥4.5:1"},
                {"id": "p8", "comprobacion": "dianas ≥44px"},
            ]
        }

    def test_p1_acento_dentro_rango(self):
        m = {"acento_porcentaje": 25}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[0], ("p1", "aprobado", "Porcentaje de acento 25% dentro de [20%,30%]"))

    def test_p1_acento_fuera_rango(self):
        m = {"acento_porcentaje": 15}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[0][1], "suspenso")
        self.assertIn("fuera de", r[0][2])

    def test_p1_metrica_faltante(self):
        m = {}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[0][1], "manual")
        self.assertIn("Métrica de porcentaje de acento no encontrada", r[0][2])

    def test_p2_numero_tamanos_dentro_limite(self):
        m = {"numero_tamanos": 3}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[1], ("p2", "aprobado", "Número de tamaños 3 ≤ 3"))

    def test_p2_numero_tamanos_fuera_limite(self):
        m = {"numero_tamanos": 5}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[1][1], "suspenso")
        self.assertIn("> 3", r[1][2])

    def test_p3_ratio_suficiente(self):
        m = {"ratio_titular_cuerpo": 6}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[2], ("p3", "aprobado", "Ratio titular/cuerpo 6 ≥ 6"))

    def test_p3_ratio_insuficiente(self):
        m = {"ratio_titular_cuerpo": 5}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[2][1], "suspenso")
        self.assertIn("< 6", r[2][2])

    def test_p4_tamanio_minimo_suficiente(self):
        m = {"tamanio_minimo_texto": 28}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[3], ("p4", "aprobado", "Tamaño mínimo de texto 28px ≥ 28px"))

    def test_p4_tamanio_minimo_insuficiente(self):
        m = {"tamanio_minimo_texto": 27}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[3][1], "suspenso")
        self.assertIn("< 28px", r[3][2])

    def test_p5_longitud_maxima_suficiente(self):
        m = {"longitud_maxima_linea": 65}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[4], ("p5", "aprobado", "Longitud máxima de línea 65 ≤ 65 caracteres"))

    def test_p5_longitud_maxima_insuficiente(self):
        m = {"longitud_maxima_linea": 66}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[4][1], "suspenso")
        self.assertIn("> 65 caracteres", r[4][2])

    def test_p6_jugada_rara_una_vez(self):
        m = {"jugada_rara_veces": 1}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[5], ("p6", "aprobado", "Jugada rara aparece 1 vez(es) como se esperaba"))

    def test_p6_jugada_rara_dos_veces(self):
        m = {"jugada_rara_veces": 2}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[5][1], "suspenso")
        self.assertIn("se esperaba 1", r[5][2])

    def test_p7_contraste_suficiente(self):
        m = {"contraste": 5.0}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[6], ("p7", "aprobado", "Contraste 5.0 ≥ 4.5"))

    def test_p7_contraste_insuficiente(self):
        m = {"contraste": 4.0}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[6][1], "suspenso")
        self.assertIn("< 4.5", r[6][2])

    def test_p8_diana_suficiente(self):
        m = {"tamanio_minimo_diana": 44}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[7], ("p8", "aprobado", "Tamaño mínimo de diana 44px ≥ 44px"))

    def test_p8_diana_insuficiente(self):
        m = {"tamanio_minimo_diana": 40}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[7][1], "suspenso")
        self.assertIn("< 44px", r[7][2])

    def test_prueba_desconocida(self):
        d = {"pruebas": [{"id": "p99", "comprobacion": "algo desconocido"}]}
        m = {}
        r = adn_comprobar.evaluar(d, m)
        self.assertEqual(r[0], ("p99", "manual", "Prueba p99: comprobación no reconocida"))

if __name__ == "__main__":
    unittest.main()