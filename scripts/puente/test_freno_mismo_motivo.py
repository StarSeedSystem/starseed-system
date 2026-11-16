# -*- coding: utf-8 -*-
"""Pruebas del freno por el mismo motivo (freno_mismo_motivo.py)."""
import unittest
import freno_mismo_motivo as F


class TestFrenoMismoMotivo(unittest.TestCase):
    def test_motivo_de_normalizacion(self):
        self.assertEqual(
            F.motivo_de("La nube dijo «sin_cambios» en la tarea T123 con ruta src/foo.py."),
            "sin_cambios"
        )
        self.assertEqual(
            F.motivo_de("   FALLO al compilar TSC en src/bar.ts (id 42)   "),
            "fallo al compilar tsc en"
        )
        self.assertEqual(F.motivo_de(""), "")
        self.assertEqual(F.motivo_de(None), "")

    def test_frenar_por_mismo_motivo_suficientes(self):
        entradas = [
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 10},
            {"estado": "hecho", "nota": "ok", "fin": 11},
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 12},
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 13},
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 14},
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 15},
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 16},
            {"estado": "sin_cambios", "nota": "la nube dijo «sin_cambios»", "fin": 17},
            {"estado": "integrada", "nota": "ok", "fin": 18},
            {"estado": "ok", "nota": "ok", "fin": 19},
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(frena)
        self.assertIn("7", frase)
        self.assertIn("10", frase)
        self.assertIn("sin_cambios", frase)
        self.assertIn("añadir escritores no lo arregla", frase)

    def test_frenar_motivos_distintos(self):
        entradas = [
            {"estado": "sin_cambios", "nota": "motivo A", "fin": 10},
            {"estado": "fallo", "nota": "motivo B", "fin": 11},
            {"estado": "sin_cambios", "nota": "motivo C", "fin": 12},
            {"estado": "fallo_tsc", "nota": "motivo D", "fin": 13},
            {"estado": "fallo_tests", "nota": "motivo E", "fin": 14},
            {"estado": "rechazada", "nota": "motivo F", "fin": 15},
            {"estado": "sin_cambios", "nota": "motivo G", "fin": 16},
        ]
        frena, _ = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertFalse(frena)

    def test_minimo_no_alcanzado(self):
        entradas = [
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": 10},
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": 11},
        ]
        frena, _ = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertFalse(frena)

    def test_todas_bien(self):
        entradas = [{"estado": "hecho", "nota": "ok", "fin": i} for i in range(10)]
        frena, _ = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertFalse(frena)

    def test_orden_por_fin(self):
        entradas = [
            {"estado": "sin_cambios", "nota": "mismo", "fin": 5},
            {"estado": "sin_cambios", "nota": "mismo", "fin": 1},
            {"estado": "sin_cambios", "nota": "mismo", "fin": 2},
            {"estado": "sin_cambios", "nota": "mismo", "fin": 3},
            {"estado": "sin_cambios", "nota": "mismo", "fin": 4},
            {"estado": "sin_cambios", "nota": "mismo", "fin": 6},
            {"estado": "sin_cambios", "nota": "mismo", "fin": 7},
            {"estado": "hecho", "nota": "ok", "fin": 8},
            {"estado": "hecho", "nota": "ok", "fin": 9},
            {"estado": "hecho", "nota": "ok", "fin": 10},
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=5, minimo=3, umbral=0.6)
        self.assertTrue(frena)

    def test_entradas_raras(self):
        self.assertFalse(F.frenar_por_mismo_motivo(None))
        self.assertFalse(F.frenar_por_mismo_motivo([None, "no-dict", {"estado": 123}]))
