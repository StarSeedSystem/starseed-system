#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de `resolver_marcas`: unión, marcas anidadas y archivo final limpio."""

import os
import re
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from director_aprendizaje import resolver_marcas

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
MEMORIA = os.path.join(RAIZ, "memory", "aprendizaje-olas.md")
MARCA = re.compile(r"^(?:<{7}|={7}|>{7})(?:\s|$)", re.MULTILINE)


class TestResolverMarcas(unittest.TestCase):
    def test_sin_marcas(self):
        texto = "Hola\nMundo\n"
        self.assertEqual(resolver_marcas(texto), texto)

    def test_bloque_simple_sin_duplicar(self):
        texto = (
            "antes\n"
            "<<<<<<< HEAD\n"
            "uno\n"
            "dos\n"
            "=======\n"
            "dos\n"
            "tres\n"
            ">>>>>>> rama\n"
            "despues\n"
        )
        self.assertEqual(resolver_marcas(texto), "antes\nuno\ndos\ntres\ndespues\n")

    def test_conserva_lineas_en_blanco(self):
        texto = (
            "<<<<<<< HEAD\n"
            "## ola uno\n"
            "\n"
            "hecho uno\n"
            "=======\n"
            "## ola dos\n"
            "\n"
            "hecho dos\n"
            ">>>>>>> rama\n"
        )
        resuelto = resolver_marcas(texto)
        self.assertIn("## ola uno\n\nhecho uno\n", resuelto)
        self.assertIn("## ola dos\n\nhecho dos\n", resuelto)
        self.assertNotIn("<<<<<<<", resuelto)
        self.assertNotIn(">>>>>>>", resuelto)

    def test_entrada_identica_no_se_repite(self):
        texto = (
            "<<<<<<< HEAD\n"
            "## ola uno\n"
            "contenido\n"
            "=======\n"
            "## ola uno\n"
            "contenido\n"
            ">>>>>>> rama\n"
        )
        self.assertEqual(resolver_marcas(texto), "## ola uno\ncontenido\n")

    def test_marcas_anidadas(self):
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
        resuelto = resolver_marcas(texto)
        self.assertEqual(resuelto, "antes\na\nb\nc\nd\ne\ndespues\n")
        self.assertIsNone(MARCA.search(resuelto))

    def test_idempotente(self):
        texto = (
            "<<<<<<< HEAD\n"
            "uno\n"
            "=======\n"
            "dos\n"
            ">>>>>>> rama\n"
        )
        una = resolver_marcas(texto)
        self.assertEqual(resolver_marcas(una), una)

    def test_archivo_de_aprendizaje_sin_marcas(self):
        with open(MEMORIA, encoding="utf-8") as f:
            contenido = f.read()
        self.assertIn("mg-oracle-1012-1504", contenido)
        self.assertIsNone(MARCA.search(contenido))
        self.assertEqual(resolver_marcas(contenido), contenido)


if __name__ == "__main__":
    unittest.main()
