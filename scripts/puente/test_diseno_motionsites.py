#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para la rúbrica de MotionSites (Ola 1104R §5).

Importa carga_rubrica(), preguntas_rubrica() y texto_rubrica().
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import diseno_motionsites as DM

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


class TestCargarRubrica(unittest.TestCase):
    """cargar_rubrica devuelve la rúbrica del JSON."""

    def test_carga_rubrica_del_json(self):
        """Carga las 10 preguntas del JSON con sus IDs."""
        rubrica = DM.cargar_rubrica(RAIZ)
        self.assertIsInstance(rubrica, list)
        self.assertEqual(len(rubrica), 10)
        for item in rubrica:
            self.assertIn("id", item)
            self.assertIn("pregunta", item)
            self.assertIsInstance(item["id"], str)
            self.assertIsInstance(item["pregunta"], str)

    def test_ids_unicos(self):
        """Todos los IDs de la rúbrica son únicos."""
        rubrica = DM.cargar_rubrica(RAIZ)
        ids = [r["id"] for r in rubrica]
        self.assertEqual(len(ids), len(set(ids)))

    def test_preguntas_terminan_en_interrogacion(self):
        """Todas las preguntas de la rúbrica terminan en signo de interrogación."""
        rubrica = DM.cargar_rubrica(RAIZ)
        for item in rubrica:
            self.assertTrue(
                item["pregunta"].endswith("?"),
                f"'{item['pregunta']}' no termina en ?"
            )


class TestPreguntasRubrica(unittest.TestCase):
    """preguntas_rubrica devuelve las preguntas en orden."""

    def test_devuelve_10_preguntas(self):
        """Devuelve exactamente 10 preguntas."""
        preguntas = DM.preguntas_rubrica(RAIZ)
        self.assertEqual(len(preguntas), 10)

    def test_preguntas_no_vacias(self):
        """Ninguna pregunta está vacía."""
        preguntas = DM.preguntas_rubrica(RAIZ)
        for p in preguntas:
            self.assertTrue(len(p.strip()) > 0)

    def test_orbita_de_primer_pregunta(self):
        """La primera pregunta es el "primer vistazo" del rubro."""
        preguntas = DM.preguntas_rubrica(RAIZ)
        self.assertIn("tres segundos", preguntas[0].lower())


class TestTextoRubrica(unittest.TestCase):
    """texto_rubrica formatea la rúbrica para el brief."""

    def test_formato_incluye_titulo(self):
        """El texto incluye el título de MotionSites."""
        texto = DM.texto_rubrica(RAIZ)
        self.assertIn("MotionSites", texto)

    def test_formato_incluye_numeros(self):
        """El texto incluye numeración de preguntas."""
        texto = DM.texto_rubrica(RAIZ)
        for i in range(1, 11):
            self.assertIn(f"{i}.", texto)

    def test_numeros_consistentes(self):
        """Los numeros van del 1 al 10."""
        texto = DM.texto_rubrica(RAIZ)
        self.assertIn("1.", texto)
        self.assertIn("10.", texto)


class TestFallbackSinJSON(unittest.TestCase):
    """Sin JSON, devuelve preguntas por defecto del contrato."""

    def test_carga_rubrica_vacia_sin_json(self):
        """Con ruta inexistente, cargar_rubrica devuelve lista vacía."""
        rubrica = DM.cargar_rubrica("/ruta/que/no/existe")
        self.assertEqual(rubrica, [])

    def test_preguntas_rubrica_con_ruta_invalida(self):
        """Con ruta inválida, devuelve preguntas por defecto."""
        preguntas = DM.preguntas_rubrica("/ruta/que/no/existe")
        self.assertEqual(len(preguntas), 10)
        for p in preguntas:
            self.assertTrue(len(p.strip()) > 0)

    def test_texto_rubrica_con_ruta_invalida(self):
        """El texto incluye título aunque el JSON no exista."""
        texto = DM.texto_rubrica("/ruta/que/no/existe")
        self.assertIn("MotionSites", texto)
        for i in range(1, 11):
            self.assertIn(f"{i}.", texto)


if __name__ == "__main__":
    unittest.main()