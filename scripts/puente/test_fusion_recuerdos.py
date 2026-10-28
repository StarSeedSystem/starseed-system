# -*- coding: utf-8 -*-
"""Pruebas de la fusión de recuerdos (unittest puro, sin pytest ni red)."""

import os
import sys
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from fusion_recuerdos import (  # noqa: E402
    PESO_VECTOR_CON_PALABRAS,
    PESO_VECTOR_POR_DEFECTO,
    fundir_recuerdos,
    peso_vector_para,
)


def recuerdo(uri, texto, fuente="memvid", alcance="personal"):
    """Recuerdo mínimo con el contrato de la fusión."""
    return {
        "uri": uri,
        "texto": texto,
        "fuente": fuente,
        "alcance": alcance,
    }


class FusionRecuerdosTest(unittest.TestCase):
    def test_aparece_en_las_dos_listas_sube(self):
        comun = recuerdo("u-comun", "el café del jueves", "memvid")
        igual_leann = recuerdo("u-comun", "el café del jueves", "leann")
        suelto = recuerdo("u-suelto", "el café del viernes", "memvid")
        salida = fundir_recuerdos([[comun, suelto], [igual_leann]])
        self.assertEqual(salida[0]["uri"], "u-comun")
        self.assertEqual(len(salida), 2)

    def test_sin_uri_dedupe_por_texto(self):
        uno = recuerdo("", "misma frase en dos motores", "memvid")
        dos = recuerdo("", "misma frase en dos motores", "leann")
        salida = fundir_recuerdos([[uno], [dos]])
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["texto"], "misma frase en dos motores")

    def test_dedupe_por_uri_se_queda_el_texto_mas_largo(self):
        corto = recuerdo("u-1", "café")
        largo = recuerdo("u-1", "café del jueves con Marta")
        salida = fundir_recuerdos([[corto], [largo]])
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["texto"], "café del jueves con Marta")

    def test_corte_por_maximo(self):
        lista = [recuerdo("u-%d" % i, "texto %d" % i) for i in range(5)]
        salida = fundir_recuerdos([lista], maximo=2)
        self.assertEqual(len(salida), 2)
        self.assertEqual([r["uri"] for r in salida], ["u-0", "u-1"])

    def test_corte_por_caracteres(self):
        lista = [recuerdo("u-%d" % i, "0123456789") for i in range(5)]
        salida = fundir_recuerdos([lista], max_caracteres=25)
        self.assertEqual(sum(len(r["texto"]) for r in salida), 25)
        self.assertEqual(len(salida), 3)
        self.assertEqual(salida[-1]["texto"], "01234")

    def test_sin_listas(self):
        self.assertEqual(fundir_recuerdos([]), [])
        self.assertEqual(fundir_recuerdos([[], []]), [])

    def test_empate_conserva_el_orden_de_llegada(self):
        a = recuerdo("u-a", "primero")
        b = recuerdo("u-b", "segundo")
        salida = fundir_recuerdos([[a], [b]])
        self.assertEqual([r["uri"] for r in salida], ["u-a", "u-b"])


class PesoVectorTest(unittest.TestCase):
    def test_por_defecto(self):
        self.assertEqual(peso_vector_para("¿qué dije del café?"), PESO_VECTOR_POR_DEFECTO)
        self.assertEqual(peso_vector_para("Hola mundo tranquilo"), PESO_VECTOR_POR_DEFECTO)
        self.assertEqual(peso_vector_para(""), PESO_VECTOR_POR_DEFECTO)

    def test_con_comillas(self):
        self.assertEqual(peso_vector_para('planes del "café"'), PESO_VECTOR_CON_PALABRAS)
        self.assertEqual(peso_vector_para("«café del jueves»"), PESO_VECTOR_CON_PALABRAS)

    def test_con_nombre_propio(self):
        self.assertEqual(peso_vector_para("¿qué dijo Marta del café?"), PESO_VECTOR_CON_PALABRAS)
        self.assertEqual(peso_vector_para("LEANN y Memvid"), PESO_VECTOR_CON_PALABRAS)


if __name__ == "__main__":
    unittest.main()
