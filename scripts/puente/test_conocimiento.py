#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de conocimiento.py: funciones puras + guardado en un tmpdir; cero red, cero claves."""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import conocimiento as co


class PruebasTroceoYBm25(unittest.TestCase):
    def test_tokenizar_limpia_acentos(self):
        self.assertEqual(co.tokenizar("¡Ópera Fácil!"), ["opera", "facil"])

    def test_trocear_vacio(self):
        self.assertEqual(co.trocear(""), [])
        self.assertEqual(co.trocear("   \n "), [])

    def test_trocear_corta_en_trozos_peques_y_sin_vacios(self):
        trozos = co.trocear("Lorem ipsum dolor sit amet. " * 100)
        self.assertTrue(len(trozos) > 2)
        self.assertTrue(all(t for t in trozos))
        self.assertTrue(all(len(t) <= co.TAM_TROZO + 1 for t in trozos))

    def test_bm25_ordena_por_relevancia(self):
        trozos = [["gato", "gato", "perro"], ["sol", "luna"], ["gato"]]
        p = co.bm25_puntuar(trozos, ["gato"])
        self.assertEqual(len(p), 3)
        self.assertEqual(p[1], 0.0)
        self.assertGreater(p[0], 0)
        self.assertGreater(p[2], 0)

    def test_bm25_sin_consulta_da_ceros(self):
        self.assertEqual(co.bm25_puntuar([["a"]], []), [0.0])


class PruebasGuardado(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_crear_y_listar_bases(self):
        base = co.crear_base("Manuales del OS", "doc interna", self.raiz)
        self.assertEqual(base["id"], "manuales-del-os")
        self.assertEqual(base["document_count"], 0)
        bases = co.listar_bases(self.raiz)
        self.assertEqual(len(bases), 1)
        mismo = co.crear_base("Manuales del OS", "", self.raiz)
        self.assertEqual(mismo["id"], "manuales-del-os-2")

    def test_id_de_nombre_seguro(self):
        self.assertEqual(co.id_de_nombre("../traición/ok"), "traicion-ok")
        self.assertNotIn("..", co.id_de_nombre(".."))

    def test_agregar_documento_y_recuperar(self):
        base = co.crear_base("memoria", "", self.raiz)
        doc = co.agregar_documento(
            base["id"], "ola 1", "Los medidores nunca se quedan en cero. Nada de red en pruebas. " * 3,
            self.raiz,
        )
        self.assertTrue(doc["word_count"] > 0)
        base2 = co._cargar_base(base["id"], self.raiz)
        self.assertEqual(base2["document_count"], 1)
        res = co.recuperar(base["id"], "medidores", top=3, raiz=self.raiz)
        self.assertEqual(res["query"]["content"], "medidores")
        self.assertTrue(len(res["records"]) >= 1)
        self.assertIn("medidores", res["records"][0]["segment"]["content"])
        vacio = co.recuperar(base["id"], "palabranoexistentejaja", raiz=self.raiz)
        self.assertEqual(vacio["records"], [])

    def test_recuperar_base_fantasma_falla(self):
        with self.assertRaises(KeyError):
            co.recuperar("no-existo", "hola", raiz=self.raiz)

    def test_cli_crear_e_imprime_json(self):
        os.environ["STARSEED_ROOT"] = self.tmp.name
        import io
        from contextlib import redirect_stdout

        buf = io.StringIO()
        with redirect_stdout(buf):
            co.CONOCIMIENTO = os.path.join(self.tmp.name, "starseed_memory_root", "conocimiento")
            sal = co.main(["conocimiento", "crear", "--nombre", "Pruebas CLI"])
        self.assertEqual(sal, 0)
        datos = json.loads(buf.getvalue())
        self.assertEqual(datos["name"], "Pruebas CLI")


if __name__ == "__main__":
    unittest.main()
