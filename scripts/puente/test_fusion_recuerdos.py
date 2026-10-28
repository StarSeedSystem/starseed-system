# -*- coding: utf-8 -*-
"""Pruebas de la fusión de recuerdos (LNN1028A2): los mismos casos que la versión TypeScript.

Contrato: RRF con k = 60 y rango desde 1, dedupe por `uri` (o por el texto si no hay)
quedándose con el texto más largo, corte por `maximo` y `max_caracteres`, y peso vectorial
0,7 salvo comillas o nombres propios, que baja a 0,4.
"""

import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import fusion_recuerdos as F  # noqa: E402


def recuerdo(uri="", texto="", fuente="memvid", **extra):
    datos = {"uri": uri, "texto": texto, "fuente": fuente, "alcance": "perfil"}
    datos.update(extra)
    return datos


class PruebaFundirRecuerdos(unittest.TestCase):
    def test_lo_que_esta_en_las_dos_listas_sube(self):
        memvid = [recuerdo("a", "alfa"), recuerdo("b", "beta")]
        leann = [recuerdo("b", "beta de leann", fuente="leann"), recuerdo("c", "gamma")]
        salida = F.fundir_recuerdos([memvid, leann])
        self.assertEqual([r["uri"] for r in salida], ["b", "a", "c"])
        self.assertAlmostEqual(salida[0]["puntuacion"], 1 / 62 + 1 / 61)
        self.assertAlmostEqual(salida[1]["puntuacion"], 1 / 61)

    def test_dedupe_por_uri_se_queda_con_el_texto_mas_largo(self):
        corto = recuerdo("x", "corto", titulo="viejo")
        largo = recuerdo("x", "un texto mucho más largo", titulo="nuevo", fuente="leann")
        salida = F.fundir_recuerdos([[corto], [largo]])
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["texto"], "un texto mucho más largo")
        self.assertEqual(salida[0]["titulo"], "nuevo")
        self.assertAlmostEqual(salida[0]["puntuacion"], 2 / 61)

    def test_sin_uri_la_huella_es_el_texto(self):
        sin_uri = recuerdo("", "el mismo texto")
        salida = F.fundir_recuerdos([[sin_uri], [dict(sin_uri, fuente="leann")]])
        self.assertEqual(len(salida), 1)
        self.assertAlmostEqual(salida[0]["puntuacion"], 2 / 61)

    def test_corta_por_maximo_respetando_el_orden(self):
        lista = [recuerdo(str(i), f"texto {i}") for i in range(10)]
        salida = F.fundir_recuerdos([lista], maximo=3)
        self.assertEqual([r["uri"] for r in salida], ["0", "1", "2"])

    def test_corta_por_caracteres(self):
        lista = [recuerdo("a", "x" * 600), recuerdo("b", "y" * 600), recuerdo("c", "z" * 600)]
        salida = F.fundir_recuerdos([lista], max_caracteres=1500)
        self.assertEqual([r["uri"] for r in salida], ["a", "b"])
        self.assertLessEqual(sum(len(r["texto"]) for r in salida), 1500)

    def test_lo_que_no_cabe_cierra_el_bloque(self):
        lista = [recuerdo("a", "x" * 1000), recuerdo("b", "y" * 600), recuerdo("c", "z" * 10)]
        salida = F.fundir_recuerdos([lista], max_caracteres=1500)
        self.assertEqual([r["uri"] for r in salida], ["a"])

    def test_sin_listas_no_hay_recuerdos(self):
        self.assertEqual(F.fundir_recuerdos([]), [])
        self.assertEqual(F.fundir_recuerdos([[], []]), [])

    def test_el_rango_empieza_en_uno(self):
        salida = F.fundir_recuerdos([[recuerdo("a", "a"), recuerdo("b", "b")]], k=0)
        self.assertEqual(salida[0]["puntuacion"], 1.0)
        self.assertEqual(salida[1]["puntuacion"], 0.5)

    def test_no_muta_las_entradas(self):
        original = recuerdo("a", "texto")
        salida = F.fundir_recuerdos([[original]])
        self.assertNotIn("puntuacion", original)
        salida[0]["texto"] = "cambiado"
        self.assertEqual(original["texto"], "texto")


class PruebaPesoVectorial(unittest.TestCase):
    def test_por_defecto_manda_el_vector(self):
        self.assertEqual(F.peso_vector_para("qué recuerdas de la ola"), 0.7)
        self.assertEqual(F.peso_vector_para(""), 0.7)

    def test_comillas_dan_peso_a_las_palabras(self):
        self.assertEqual(F.peso_vector_para('el "plan maestro"'), 0.4)
        self.assertEqual(F.peso_vector_para("«contrato de salas»"), 0.4)

    def test_nombres_propios_dan_peso_a_las_palabras(self):
        self.assertEqual(F.peso_vector_para("¿Dónde vive Alex?"), 0.4)
        self.assertEqual(F.peso_vector_para("Alex"), 0.4)
        self.assertEqual(F.peso_vector_para("cómo funciona LEANN"), 0.4)
        self.assertEqual(F.peso_vector_para("Madrid es grande"), 0.4)


if __name__ == "__main__":
    unittest.main()
