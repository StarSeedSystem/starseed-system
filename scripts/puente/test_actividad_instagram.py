#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de actividad_instagram con una muestra de la exportación oficial."""
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_instagram as I

POSTS = [{"title": "", "media_map_data": {}, "string_map_data": {
    "Media": {"href": "https://www.instagram.com/p/Cabc123/", "timestamp": 1700000000},
    "Saved on": {"timestamp": 1700000100}}}]
SIN_ENLACE = [{"title": "solo colección", "string_map_data": {"Saved on": {"timestamp": 1700000200}}}]
COLECCIONES = [{"name": "Referencias", "media_list_data": [
    {"string_map_data": {"Media": {"href": "https://www.instagram.com/p/Cdef456/"}}}]}]


class TestGuardados(unittest.TestCase):
    def test_fichas_de_saved_posts(self):
        fichas = I.fichas_de_saved_posts(POSTS)
        self.assertEqual(len(fichas), 1)
        self.assertEqual(fichas[0]["enlace"], "https://www.instagram.com/p/Cabc123/")
        self.assertEqual(fichas[0]["fecha"], "2023-11-14T22:15:00Z")
        self.assertTrue(fichas[0]["privado"])
        self.assertEqual(fichas[0]["coleccion"], "")

    def test_sin_enlace_se_omite(self):
        self.assertEqual(I.fichas_de_saved_posts(SIN_ENLACE), [])

    def test_autor_de_enlace(self):
        self.assertEqual(I.autor_de_enlace("https://www.instagram.com/p/Cabc123/"), "")
        self.assertEqual(I.autor_de_enlace("https://www.instagram.com/reel/Cabc/"), "")
        self.assertEqual(I.autor_de_enlace("https://www.instagram.com/maggasukha/"), "maggasukha")
        self.assertEqual(I.autor_de_enlace(""), "")

    def test_fichas_de_colecciones(self):
        fichas = I.fichas_de_saved_collections(COLECCIONES)
        self.assertEqual(len(fichas), 1)
        self.assertEqual(fichas[0]["enlace"], "https://www.instagram.com/p/Cdef456/")
        self.assertEqual(fichas[0]["coleccion"], "Referencias")
        self.assertTrue(fichas[0]["privado"])

    def test_fundir_incremental_por_enlace(self):
        previas = [{"enlace": "https://www.instagram.com/p/Cabc123/", "autor": "", "fecha": "vieja",
                    "coleccion": "", "privado": True}]
        nuevas = I.fichas_de_saved_posts(POSTS) + [{"enlace": "https://www.instagram.com/p/Cnuevo/",
                                                    "autor": "", "fecha": "nueva", "coleccion": "", "privado": True}]
        todo = I.fundir(nuevas, previas)
        por_enlace = {f["enlace"]: f for f in todo}
        self.assertEqual(len(todo), 2)
        self.assertEqual(por_enlace["https://www.instagram.com/p/Cabc123/"]["fecha"], "vieja")
        self.assertIn("https://www.instagram.com/p/Cnuevo/", por_enlace)

    def test_fundir_rellena_coleccion_vacia(self):
        previas = [{"enlace": "https://www.instagram.com/p/Cabc123/", "autor": "", "fecha": "vieja",
                    "coleccion": "", "privado": True}]
        nueva = dict(previas[0], coleccion="Referencias")
        todo = I.fundir([nueva], previas)
        self.assertEqual(len(todo), 1)
        self.assertEqual(todo[0]["coleccion"], "Referencias")

    def test_zip_oficial(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "instagram-maggasukha-2026-11-11-1234.zip"
            with zipfile.ZipFile(ruta, "w") as z:
                z.writestr("instagram-maggasukha/saved_posts.json", json.dumps(POSTS))
            self.assertTrue(I.ZIP_OK.match(ruta.name))
            self.assertFalse(I.ZIP_OK.match("otro-archivo.zip"))
            fichas = I.fichas_de_zip(ruta)
            self.assertEqual(len(fichas), 1)
            self.assertEqual(fichas[0]["enlace"], "https://www.instagram.com/p/Cabc123/")


if __name__ == "__main__":
    unittest.main()
