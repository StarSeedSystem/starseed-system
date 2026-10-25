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

    def test_anidado(self):
        # Dos bloques internos; el más profundo se resuelve primero y ninguna
        # de sus lecciones (a, b, c, d, e) se pierde, sin dejar marcas sueltas.
        texto = (
            "antes\n<<<<<<< HEAD\na\n<<<<<<< HEAD\nb\n=======\nc\n"
            ">>>>>>> r1\nd\n=======\ne\n>>>>>>> r2\ndespues"
        )
        resultado = resolver_marcas(texto)
        self.assertNotIn("<<<<<<<", resultado)
        self.assertNotIn("=======", resultado)
        self.assertNotIn(">>>>>>>", resultado)
        for leccion in ("a", "b", "c", "d", "e"):
            self.assertIn(leccion, resultado)

    def test_etiquetas_repetidas_entre_secciones_se_conservan(self):
        # Dos secciones en la misma parte usan la misma etiqueta: son lecciones
        # distintas y ninguna se pierde (el dedupe no es global).
        texto = (
            "<<<<<<< HEAD\n"
            "## sección uno\n"
            "**Lo que quedó fuera:**\n"
            "## sección dos\n"
            "**Lo que quedó fuera:**\n"
            "=======\n"
            ">>>>>>> ref\n"
        )
        resultado = resolver_marcas(texto)
        veces = resultado.count("**Lo que quedó fuera:**")
        self.assertEqual(veces, 2)

    def test_solape_contiguo_se_colapsa(self):
        # Solape clásico de fusión: la línea compartida queda pegada entre
        # ambas partes y se deja UNA sola vez.
        texto = "<<<<<<< HEAD\nline1\nline2\n=======\nline2\nline3\n>>>>>>> ref\n"
        resultado = resolver_marcas(texto)
        self.assertEqual(resultado, "line1\nline2\nline3\n")

    def test_lineas_iguales_no_contiguas_se_conservan(self):
        # La misma línea en posiciones distintas agrupa contenido distinto
        # (etiquetas repetidas entre grupos): no se borra por parecerse.
        texto = (
            "<<<<<<< HEAD\n"
            "**Lo que quedó fuera:**\n"
            "- grupo uno\n"
            "**Lo que quedó fuera:**\n"
            "- grupo dos\n"
            "=======\n"
            "- grupo tres\n"
            ">>>>>>> ref\n"
        )
        resultado = resolver_marcas(texto)
        veces = resultado.count("**Lo que quedó fuera:**")
        self.assertEqual(veces, 2)
        self.assertIn("- grupo tres\n", resultado)

    def test_saltos_repetidos_se_colapsan(self):
        texto = "<<<<<<< HEAD\nlección\n=======\n\n\n>>>>>>> ref\n"
        resultado = resolver_marcas(texto)
        self.assertEqual(resultado, "lección\n\n")

    def test_bloque_mal_cerrado(self):
        # Marcas sueltas fuera de todo bloque y separadores sobrantes: nunca
        # quedan en el resultado; el contenido que sí es contenido se conserva.
        texto = "<<<<<<< HEAD\nreal\n=======\n<<<<<<< HEAD\n=======\nsolo otra\n>>>>>>> r1\n=======\nmás\n>>>>>>> r2\n>>>>>>> r3\nfin\n"
        resultado = resolver_marcas(texto)
        self.assertFalse(any(m in resultado for m in ("<<<<<<<", "=======", ">>>>>>>")))
        for esperado in ("real\n", "solo otra\n", "más\n"):
            self.assertIn(esperado, resultado)

    def test_sin_separador(self):
        # Conflicto con inicio y cierre pero sin «=======»: se une como parte única.
        texto = "<<<<<<< HEAD\ncontenido\n>>>>>>> ref\ndespues"
        resultado = resolver_marcas(texto)
        self.assertEqual(resultado, "contenido\ndespues")

    def test_idempotente(self):
        texto = "a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> ref\n"
        no_esta_claro = resolver_marcas(texto)
        self.assertEqual(resolver_marcas(no_esta_claro), no_esta_claro)

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
