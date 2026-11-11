# -*- coding: utf-8 -*-
"""Pruebas puras de actividad_instagram.py: sin red, sin sesión y con muestras mínimas."""
import json, os, sys, tempfile, unittest, zipfile
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from actividad_instagram import (  # noqa: E402
    ejecutar, es_zip_oficial, leer_exportacion, leer_saved_collections, leer_saved_posts)

SAVED = {"saved_saved_media": [
    {"title": "programador_artesano", "string_map_data": {"Saved on": {"href": "https://www.instagram.com/p/ABC123/", "timestamp": 1680000000}}},
    {"title": "otra_cuenta", "string_map_data": {"Saved on": {"href": "https://www.instagram.com/reel/XYZ789/", "timestamp": 1680003600}}}]}
COLLECTIONS = {"saved_collections": [{"name": "Programación", "media": [
    {"title": "artista", "string_map_data": {"Saved on": {"href": "https://www.instagram.com/p/COL1/", "timestamp": 1680007200}}}]}]}
REPETIDA = {"saved_collections": [{"name": "Repes", "media": [
    {"title": "programador_artesano", "string_map_data": {"Saved on": {"href": "https://www.instagram.com/p/ABC123/", "timestamp": 1680000000}}}]}]}

class FichasDeGuardados(unittest.TestCase):
    def test_saved_posts_trae_enlace_autor_fecha_y_privado(self):
        fichas = leer_saved_posts(SAVED)
        self.assertEqual(len(fichas), 2)
        primera = fichas[0]
        self.assertEqual(primera["autor"], "programador_artesano")
        self.assertEqual(primera["enlace"], "https://www.instagram.com/p/ABC123/")
        self.assertEqual(primera["fecha"], "2023-03-28T10:40:00Z")
        self.assertTrue(primera["privado"])
        self.assertEqual(primera["fuente"], "instagram")

    def test_colecciones_anidan_media_y_nombre(self):
        fichas = leer_saved_collections(COLLECTIONS)
        self.assertEqual(len(fichas), 1)
        self.assertEqual(fichas[0]["coleccion"], "Programación")
        self.assertEqual(fichas[0]["autor"], "artista")
        self.assertEqual(fichas[0]["enlace"], "https://www.instagram.com/p/COL1/")

    def test_exportacion_no_duplica_por_enlace(self):
        fichas = leer_exportacion({"saved_posts.json": SAVED, "saved_collections.json": REPETIDA})
        self.assertEqual(len(fichas), 2)

    def test_label_values_trae_url_autor_y_fecha(self):
        datos = {"saved_saved_media": [{"label_values": [
            {"label": "URL", "value": "https://www.instagram.com/p/LV1/"},
            {"label": "Owner", "value": "cuenta_lv"},
            {"label": "Timestamp", "value": "2023-04-01T12:00:00Z"}]}]}
        ficha = leer_saved_posts(datos)[0]
        self.assertEqual(ficha["enlace"], "https://www.instagram.com/p/LV1/")
        self.assertEqual(ficha["autor"], "cuenta_lv")
        self.assertEqual(ficha["fecha"], "2023-04-01T12:00:00Z")

    def test_timestamp_en_milisegundos(self):
        datos = {"saved_saved_media": [{"title": "x", "string_map_data": {
            "Saved on": {"href": "https://www.instagram.com/p/MS/", "timestamp": 1680000000000}}}]}
        self.assertEqual(leer_saved_posts(datos)[0]["fecha"], "2023-03-28T10:40:00Z")

class NombresDeZip(unittest.TestCase):
    def test_solo_el_zip_oficial(self):
        self.assertTrue(es_zip_oficial("instagram-maggasukha-2023-06-01-abc123.zip"))
        self.assertFalse(es_zip_oficial("fotos.zip"))
        self.assertFalse(es_zip_oficial("instagram-maggasukha.zip"))
        self.assertFalse(es_zip_oficial("instagram-2023-06-01-abc.zip"))

class LecturaIncremental(unittest.TestCase):
    def test_suelto_guarda_fichas_y_no_repite(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp); entrada = raiz / "entrada"; entrada.mkdir()
            (entrada / "saved_posts.json").write_text(json.dumps(SAVED), encoding="utf-8")
            (entrada / "saved_collections.json").write_text(json.dumps(COLLECTIONS), encoding="utf-8")
            base = raiz / "actividad"
            primera = ejecutar(directorios=[str(entrada)], base=base, ahora="2026-11-11")
            self.assertTrue(primera["ok"])
            self.assertEqual(primera["nuevas"], 3)
            self.assertTrue(all(f["privado"] for f in primera["fichas"]))
            guardado = json.loads((base / "fichas" / "2026-11-11-instagram.json").read_text(encoding="utf-8"))
            self.assertEqual(len(guardado), 3)
            segunda = ejecutar(directorios=[str(entrada)], base=base, ahora="2026-11-11")
            self.assertTrue(segunda["ok"])
            self.assertEqual(segunda["nuevas"], 0)

    def test_lee_el_zip_oficial_y_no_lo_borra(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp); descargas = raiz / "Descargas"; descargas.mkdir()
            ruta = descargas / "instagram-maggasukha-2023-06-01-abc123.zip"
            with zipfile.ZipFile(ruta, "w") as comprimido:
                comprimido.writestr("your_instagram_activity/saved/saved_posts.json", json.dumps(SAVED))
                comprimido.writestr("your_instagram_activity/saved/saved_collections.json", json.dumps(COLLECTIONS))
            resultado = ejecutar(directorios=[str(descargas)], base=raiz / "actividad", ahora="2026-11-11")
            self.assertTrue(resultado["ok"])
            self.assertEqual(resultado["nuevas"], 3)
            self.assertTrue(ruta.exists())

    def test_zip_con_otro_nombre_se_ignora(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp); ruta = raiz / "fotos.zip"
            with zipfile.ZipFile(ruta, "w") as comprimido:
                comprimido.writestr("saved_posts.json", json.dumps(SAVED))
            resultado = ejecutar(directorios=[str(raiz)], base=raiz / "actividad")
            self.assertFalse(resultado["ok"])
            self.assertEqual(resultado["nuevas"], 0)
