#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de `resolver_marcas`: unión sin duplicados, anidación y memoria limpia.

Solo lógica pura: sin red y sin escribir en disco (la memoria real se lee, no
se escribe).
"""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from director_aprendizaje import resolver_marcas

MEMORIA = os.path.join(DIRECTORIO, "..", "..", "memory", "aprendizaje-olas.md")

# Las entradas de la zona que tuvo las 11 marcas de conflicto (2026-10-12 →
# 2026-10-20). Cada una debe seguir presente tras resolver: la unión no pierde
# contenido.
ENTRADAS_UNION = [
    "mg-oracle-1012-1504",
    "mg-oracle-1012-1741",
    "mg-oracle-1012-2102",
    "mg-oracle-1013-0708",
    "mg-oracle-1013-1344",
    "mg-oracle-1014-0552",
    "mg-oracle-1014-1253",
    "mg-oracle-1014-1639",
    "mg-oracle-1019-0800",
    "mg-oracle-1019-0915",
    "mg-oracle-1019-1149",
    "mg-oracle-1019-1251",
    "mg-oracle-1019-1732",
    "mg-oracle-1020-0219",
    "mg-oracle-1020-0802",
]


class TestResolverMarcas(unittest.TestCase):
    def test_sin_marcas_es_identico(self):
        texto = "Hola\nMundo\n"
        self.assertEqual(resolver_marcas(texto), texto)

    def test_un_bloque_simple_se_une_en_orden_sin_duplicados(self):
        texto = "a\n<<<<<<< HEAD\nline1\nline2\n=======\nline2\nline3\n>>>>>>> ref\nb"
        self.assertEqual(resolver_marcas(texto), "a\nline1\nline2\nline3\nb")

    def test_bloque_anidado_conserva_todas_las_lineas(self):
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
        self.assertEqual(resolver_marcas(texto), "antes\na\nb\nc\nd\ne\ndespues")

    def test_marcas_suelas_de_fusiones_apiladas_se_quitan(self):
        texto = (
            "cabecera\n"
            "<<<<<<< HEAD\n"
            "uno\n"
            "=======\n"
            "=======\n"
            "dos\n"
            "pie previo\n"
            ">>>>>>> primera\n"
            ">>>>>>> segunda\n"
            "pie"
        )
        self.assertEqual(
            resolver_marcas(texto), "cabecera\nuno\ndos\npie previo\npie"
        )

    def test_idempotente(self):
        limpio = resolver_marcas("<<<<<<< HEAD\none\n=======\ntwo\n>>>>>>> r\n")
        self.assertEqual(resolver_marcas(limpio), limpio)


class TestArchivoReal(unittest.TestCase):
    def test_la_memoria_no_tiene_ninguna_marca(self):
        with open(MEMORIA, encoding="utf-8") as f:
            contenido = f.read()
        self.assertNotIn("<<<<<<<", contenido)
        self.assertNotIn("=======", contenido)
        for linea in contenido.splitlines():
            self.assertFalse(linea.startswith(">>>>>>>"))

    def test_resolver_sobre_la_memoria_es_no_op(self):
        with open(MEMORIA, encoding="utf-8") as f:
            contenido = f.read()
        self.assertEqual(resolver_marcas(contenido), contenido)

    def test_la_zona_conflictiva_queda_unida_completa(self):
        with open(MEMORIA, encoding="utf-8") as f:
            contenido = f.read()
        for entrada in ENTRADAS_UNION:
            self.assertIn("## ", contenido)
            self.assertIn(entrada, contenido)


if __name__ == "__main__":
    unittest.main()
