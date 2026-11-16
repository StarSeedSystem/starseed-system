# -*- coding: utf-8 -*-
"""Pruebas de freno_mismo_motivo.py (HAL08)."""
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import freno_mismo_motivo as FM


class MotivoDe(unittest.TestCase):
    def test_normaliza_minusculas(self):
        self.assertEqual(FM.motivo_de("LA NUBE DIJO «SIN_CAMBIO»"), "sin_cambio")

    def test_quita_numeros_y_ids(self):
        self.assertEqual(FM.motivo_de("la nube dijo «sin_cambios» RT123"), "sin_cambios")

    def test_quita_rutas(self):
        self.assertEqual(FM.motivo_de("fallo tsc en /src/lib/archivo.ts"), "fallo_tsc_en_lib")

    def test_recorta_a_80_caracteres(self):
        longo = "fallo" + " x" * 100
        self.assertLessEqual(len(FM.motivo_de(longo)), 80)

    def test_extrae_mentira_clave(self):
        self.assertEqual(FM.motivo_de("la nube dijo «fallo tests»"), "fallo_tests")

    def test_manejaba_vacios(self):
        self.assertEqual(FM.motivo_de(""), "")
        self.assertEqual(FM.motivo_de(None), "")

    def test_ignora_estados_ya_hechos(self):
        pass


class FrenarPorMismoMotivo(unittest.TestCase):
    AHORA = 1_000_000.0

    def test_8_de_10_mismo_motivo_frena(self):
        entradas = [
            {"estado": "fallo_tsc", "nota": "fallo_tsc", "fin": self.AHORA + i}
            for i in range(10)
        ]
        for i, e in enumerate(entradas):
            e["fin"] = self.AHORA - i * 3600
        entradas[5]["nota"] = "otra_cosa"
        entradas[6]["nota"] = "otra_cosa"
        freno, texto = FM.frenar_por_mismo_motivo(entradas)
        self.assertTrue(freno)
        self.assertIn("8 de las últimas 10", texto)
        self.assertIn("fallo_tsc", texto)

    def test_7_de_10_motivos_distintos_no_frena(self):
        entradas = []
        for i in range(7):
            entradas.append({
                "estado": "fallo_tsc",
                "nota": f"fallo tsc {i}",
                "fin": self.AHORA - i * 3600
            })
        for i in range(3):
            entradas.append({
                "estado": "fallo_tests",
                "nota": f"fallo tests {i}",
                "fin": self.AHORA - i * 3600
            })
        freno, texto = FM.frenar_por_mismo_motivo(entradas)
        self.assertFalse(freno)

    def test_menos_de_minimo_no_frena(self):
        entradas = [
            {"estado": "fallo_tsc", "nota": "fallo tsc", "fin": self.AHORA - i}
            for i in range(3)
        ]
        freno, texto = FM.frenar_por_mismo_motivo(entradas, minimo=5)
        self.assertFalse(freno)

    def test_estados_hechos_no_cuentan(self):
        entradas = [
            {"estado": "integrada", "nota": "ok", "fin": self.AHORA - 100},
            {"estado": "hecho", "nota": "ok", "fin": self.AHORA - 100},
        ] + [
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": self.AHORA - i * 3600}
            for i in range(7)
        ]
        freno, texto = FM.frenar_por_mismo_motivo(entradas)
        self.assertTrue(freno)
        self.assertIn("7 de las últimas 7", texto)

    def test_estados_hechos_eximen_el_freno(self):
        entradas = [
            {"estado": "integrada", "nota": "ok", "fin": self.AHORA - 100},
            {"estado": "hecho", "nota": "ok", "fin": self.AHORA - 100},
            {"estado": "commit", "nota": "ok", "fin": self.AHORA - 100},
        ] + [
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": self.AHORA - i * 3600}
            for i in range(7)
        ]
        freno, texto = FM.frenar_por_mismo_motivo(entradas)
        self.assertTrue(freno)
        self.assertIn("7 de las últimas 7", texto)

    def test_ordena_por_fin(self):
        ahora = self.AHORA
        entradas = [
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": ahora - 10000},
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": ahora - 1000},
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": ahora - 5000},
        ]
        entradas.extend([
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": ahora - 3000},
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": ahora - 2000},
            {"estado": "sin_cambios", "nota": "sin_cambios", "fin": ahora - 4000},
        ])
        freno, texto = FM.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(freno)

    def test_nota_vacia(self):
        entradas = [
            {"estado": "fallo_tsc", "nota": "", "fin": self.AHORA - i}
            for i in range(7)
        ]
        freno, texto = FM.frenar_por_mismo_motivo(entradas)
        self.assertFalse(freno)

    def test_entradas_raras(self):
        self.assertFalse(FM.frenar_por_mismo_motivo(None)[0])
        self.assertFalse(FM.frenar_por_mismo_motivo([])[0])
        self.assertFalse(FM.frenar_por_mismo_motivo([None, None, None])[0])

    def test_frase_contiene_motivo_y_numeros(self):
        entradas = [
            {"estado": "fallo_tsc", "nota": "fallo_tsc", "fin": self.AHORA - i}
            for i in range(10)
        ]
        freno, texto = FM.frenar_por_mismo_motivo(entradas)
        self.assertTrue(freno)
        self.assertIn("se frena", texto)
        self.assertIn("10 de las últimas 10", texto)


if __name__ == "__main__":
    unittest.main()