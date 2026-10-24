#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de `resolver_marcas`: unión sin duplicados, anidadas y a medias."""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from director_aprendizaje import resolver_marcas

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
MEMORIA = os.path.join(RAIZ, "memory", "aprendizaje-olas.md")


class TestResolverMarcas(unittest.TestCase):
    def test_sin_marcas_no_se_toca(self):
        texto = "Hola\nMundo\n"
        self.assertEqual(resolver_marcas(texto), texto)

    def test_union_simple(self):
        texto = (
            "a\n"
            "<<<<<<< HEAD\n"
            "linea1\n"
            "linea2\n"
            "=======\n"
            "linea2\n"
            "linea3\n"
            ">>>>>>> ref\n"
            "b"
        )
        esperado = "a\nlinea1\nlinea2\nlinea3\nb"
        self.assertEqual(resolver_marcas(texto), esperado)

    def test_parte_otra_vacia(self):
        texto = "x\n<<<<<<< HEAD\nentrada\n=======\n>>>>>>> r\ny"
        self.assertEqual(resolver_marcas(texto), "x\nentrada\ny")

    def test_no_duplica_el_lado_otro(self):
        texto = (
            "p\n"
            "<<<<<<< HEAD\n"
            "entrada\n"
            "bla1\n"
            "bla2\n"
            "=======\n"
            "entrada\n"
            "- causa 1\n"
            "\n"
            "- causa 2\n"
            ">>>>>>> r\n"
            "q"
        )
        esperado = "p\nentrada\nbla1\nbla2\n- causa 1\n\n- causa 2\nq"
        self.assertEqual(resolver_marcas(texto), esperado)

    def test_vacio_y_none_seguros(self):
        self.assertEqual(resolver_marcas(""), "")
        self.assertEqual(resolver_marcas(None), None)

    def test_anidado(self):
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
            "despues\n"
        )
        esperado = "antes\na\nb\nc\nd\ne\ndespues\n"
        self.assertEqual(resolver_marcas(texto), esperado)

    def test_anidado_revueltas_a_medias(self):
        # Fusión partida: bloque interior sin separador y dos cierres sueltos.
        texto = (
            "antes\n"
            "<<<<<<< HEAD\n"
            "entrada1\n"
            "=======\n"
            "<<<<<<< HEAD\n"
            ">>>>>>> r1\n"
            "=======\n"
            "entrada2\n"
            ">>>>>>> r2\n"
            ">>>>>>> r3\n"
            "despues\n"
        )
        esperado = "antes\nentrada1\nentrada2\ndespues\n"
        self.assertEqual(resolver_marcas(texto), esperado)

    def test_blanco_conservado_en_el_lado_otro(self):
        texto = (
            "<<<<<<< HEAD\n"
            "x\n"
            "=======\n"
            "\n"
            "y\n"
            "\n"
            "z\n"
            ">>>>>>> r\n"
        )
        esperado = "x\n\ny\n\nz\n"
        self.assertEqual(resolver_marcas(texto), esperado)

    def test_archivo_real_sin_marcas(self):
        with open(MEMORIA, encoding="utf-8") as f:
            contenido = f.read()
        self.assertNotIn("<<<<<<<", contenido)
        self.assertNotIn(">>>>>>>", contenido)
        self.assertNotIn("=======", contenido)
        # Idempotencia: resolver lo ya resuelto no cambia nada.
        self.assertEqual(resolver_marcas(contenido), contenido)


if __name__ == "__main__":
    unittest.main()
