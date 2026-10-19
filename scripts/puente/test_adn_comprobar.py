#!/usr/bin/env python3
"""Pruebas para el comprobador común del ADN."""
import json, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adn_comprobar

class TestAdnComprobar(unittest.TestCase):
    def setUp(self):
        self.dna = {
            "pruebas": [
                {"id": "p1", "comprobacion": "radio 0.85rem"},
                {"id": "p2", "comprobacion": "blur 10px"},
                {"id": "p3", "comprobacion": "animacion solo transform opacity"},
                {"id": "p4", "comprobacion": "sin WebGL"},
                {"id": "p5", "comprobacion": "contraste >=4.5:1"},
                {"id": "p6", "comprobacion": "dianas >=44px"},
                {"id": "p7", "comprobacion": "prefers-reduced-motion respeta"},
                {"id": "p8", "comprobacion": "no anima dimensiones"},
            ]
        }

    def test_p1_radio_correcto(self):
        m = {"radio": 13.6}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[0], ("p1", "aprobado", "Radio 13.6px ≈ 0.85rem"))

    def test_p1_radio_incorrecto(self):
        m = {"radio": 12.0}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[0][1], "suspenso")
        self.assertIn("difiere", r[0][2])

    def test_p1_metrica_faltante(self):
        m = {}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[0][1], "manual")
        self.assertIn("Métrica de radio no encontrada", r[0][2])

    def test_p2_blur_correcto(self):
        m = {"blur": 10.0}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[1], ("p2", "aprobado", "Blur 10.0px ≈ 10.0px"))

    def test_p3_animacion_correcta(self):
        m = {"animacion_solo_transform_opacity": True}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[2], ("p3", "aprobado", "Animación solo usa transform y opacity"))

    def test_p4_sin_webgl(self):
        m = {"usa_webgl": False}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[3], ("p4", "aprobado", "No se usa WebGL"))

    def test_p5_contraste_suficiente(self):
        m = {"contraste": 5.0}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[4], ("p5", "aprobado", "Contraste 5.0 >= 4.5"))

    def test_p6_diana_suficiente(self):
        m = {"diana_min_px": 48}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[5], ("p6", "aprobado", "Diana mínima 48px >= 44px"))

    def test_p7_respeta_reduced_motion(self):
        m = {"respeta_reduced_motion": True}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[6], ("p7", "aprobado", "Respecta prefers-reduced-motion"))

    def test_p8_no_anima_dimensiones(self):
        m = {"no_anima_dimensiones": True}
        r = adn_comprobar.evaluar(self.dna, m)
        self.assertEqual(r[7], ("p8", "aprobado", "No anima dimensiones"))

    def test_prueba_desconocida(self):
        d = {"pruebas": [{"id": "p99", "comprobacion": "algo desconocido"}]}
        m = {}
        r = adn_comprobar.evaluar(d, m)
        self.assertEqual(r[0], ("p99", "manual", "Prueba p99: comprobación no reconocida"))

if __name__ == "__main__":
    unittest.main()