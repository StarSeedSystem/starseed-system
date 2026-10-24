#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de `resolver_marcas`: marcas anidadas y archivo sin marcas."""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from director_aprendizaje import resolver_marcas


class TestResolverMarcas(unittest.TestCase):
    def test_sin_marcas(self):
        texto = "Hola\nMundo\n"
        self.assertEqual(resolver_marcas(texto), texto)

    def test_un_bloque_simple(self):
        texto = "a\n<<<<<<< HEAD\nline1\nline2\n=======\nline2\nline3\n>>>>>>> ref\nb"
        resultado = resolver_marcas(texto)
        self.assertNotIn("<<<<<<<", resultado)
        self.assertNotIn("=======", resultado)
        self.assertNotIn(">>>>>>>", resultado)
        # La unión conserva orden sin duplicar líneas idénticas.
        self.assertIn("line1", resultado)
        self.assertIn("line2", resultado)
        self.assertIn("line3", resultado)

    def test_anidado(self):
        # Dos bloques internos; el más profundo debe resolverse primero.
        texto = (
            "antes\n"
            "<<<<<<< HEAD\n"
            "a\n"
            "<<<<<<< HEAD\n"
            "b\n"
            "=======\n"
            "c\n"
            ">>>>>>> r1\n"
            "d\n"
            "=======\n"
            "e\n"
            ">>>>>>> r2\n"
            "despues"
        )
        resultado = resolver_marcas(texto)
        self.assertNotIn("<<<<<<<", resultado)
        self.assertNotIn("=======", resultado)
        # En el archivo final no debe quedar ninguna marca de cierre suelta.
        for linea in resultado.splitlines():
            self.assertNotIn(">>>>>>>", linea)
        # Las líneas únicas deben conservarse.
        self.assertIn("a", resultado)
        self.assertIn("b", resultado)
        self.assertIn("c", resultado)
        self.assertIn("d", resultado)
        self.assertIn("e", resultado)

    def test_archivo_sin_marcas_final(self):
        # Simula la lectura de un archivo real y verifica que no quedan marcas.
        ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "memory", "aprendizaje-olas.md")
        with open(ruta, encoding="utf-8") as f:
            contenido = f.read()
        contenido_limpio = resolver_marcas(contenido)
        self.assertNotIn("<<<<<<<", contenido_limpio)
        self.assertNotIn("=======", contenido_limpio)
        for linea in contenido_limpio.splitlines():
            self.assertNotIn(">>>>>>>", linea)


if __name__ == "__main__":
    unittest.main()
