# -*- coding: utf-8 -*-
"""Pruebas de la actividad de Instagram: SOLO exportación oficial, fichas privadas
con enlace/autor/fecha e incrementales por enlace."""

import json, os, sys, tempfile, unittest, zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_instagram as A

AHORA = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


GUARDADOS = [{"timestamp": 1760000000, "media": [], "label_values": [
    {"label": "URL", "value": "https://www.instagram.com/reel/AAA111/",
     "href": "https://www.instagram.com/reel/AAA111/"},
    {"label": "Caption", "value": "Una cena"},
    {"dict": [{"dict": [{"label": "Name", "value": "Ana"},
                        {"label": "Username", "value": "ana.cocina"}]}], "title": "Owner"}],
    "fbid": "1"}]
COLECCIONES = {"saved_saved_collections": [
    {"title": "album", "string_map_data": {"Name": {"value": "Diseño"},
                                           "Creation Time": {"timestamp": 1750000000}}},
    {"string_map_data": {"Name": {"value": "Estudio", "href": "https://www.instagram.com/p/BBB222/"},
                        "Added Time": {"timestamp": 1760003600}}}]}
VIEJO = {"saved_saved_media": [{"title": "carlos", "string_map_data": {
    "Saved on": {"href": "https://www.instagram.com/p/CCC333/", "timestamp": 1700000000}}}]}


class PruebaLectura(unittest.TestCase):
    def test_formato_nuevo_con_enlace_autor_y_fecha(self):
        fichas = A.fichas_de_exportacion(GUARDADOS)
        self.assertEqual(len(fichas), 1)
        f = fichas[0]
        self.assertEqual(f["enlace"], "https://www.instagram.com/reel/AAA111/")
        self.assertEqual(f["autor"], "ana.cocina")
        self.assertEqual(f["fecha"], iso(1760000000))
        self.assertTrue(f["privado"])

    def test_formato_antiguo(self):
        f = A.fichas_de_exportacion(VIEJO)[0]
        self.assertEqual(f["enlace"], "https://www.instagram.com/p/CCC333/")
        self.assertEqual(f["autor"], "carlos")
        self.assertEqual(f["fecha"], iso(1700000000))

    def test_colecciones_traen_su_nombre(self):
        f = A.fichas_de_exportacion(None, COLECCIONES)[0]
        self.assertEqual(f["enlace"], "https://www.instagram.com/p/BBB222/")
        self.assertEqual(f["coleccion"], "Diseño")
        self.assertEqual(f["fecha"], iso(1760003600))

    def test_incremental_por_enlace_y_sin_duplicados(self):
        fichas = A.fichas_de_exportacion(GUARDADOS + GUARDADOS)
        self.assertEqual(len(fichas), 1)
        self.assertEqual(A.nuevas_por_enlace(fichas, [fichas[0]["enlace"]]), [])
        self.assertEqual(len(A.nuevas_por_enlace(fichas, [])), 1)


class PruebaArchivos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = self.tmp.name
        self.entrada = os.path.join(self.home, ".starseed", "actividad", "entrada", "instagram")
        self.descargas = os.path.join(self.home, "Downloads")
        os.makedirs(self.entrada); os.makedirs(self.descargas)

    def tearDown(self): self.tmp.cleanup()

    def _zip(self, carpeta, nombre, datos):
        ruta = os.path.join(carpeta, nombre)
        with zipfile.ZipFile(ruta, "w") as z:
            z.writestr("instagram/your_instagram_activity/saved/saved_posts.json",
                       json.dumps(datos))
        return ruta

    def test_solo_lee_zips_oficiales_y_no_los_borra(self):
        oficial = self._zip(self.descargas, "instagram-ana-2026-11-01-abc123.zip", VIEJO)
        copia = self._zip(self.descargas, "copia.zip", GUARDADOS)
        fichas = A.recolectar(home=self.home, descargas=self.descargas)
        self.assertEqual([f["enlace"] for f in fichas],
                         ["https://www.instagram.com/p/CCC333/"])
        self.assertTrue(os.path.exists(oficial)); self.assertTrue(os.path.exists(copia))

    def test_ejecutar_escribe_fichas_y_es_incremental(self):
        with open(os.path.join(self.entrada, "saved_posts.json"), "w", encoding="utf-8") as f:
            json.dump(GUARDADOS, f)
        r = A.ejecutar(home=self.home, descargas=self.descargas, ahora=AHORA)
        self.assertEqual((r["leidas"], r["nuevas"]), (1, 1))
        self.assertTrue(os.path.exists(r["ruta"]))
        r2 = A.ejecutar(home=self.home, descargas=self.descargas, ahora=AHORA)
        self.assertEqual(r2["nuevas"], 0)
        with open(r["ruta"], encoding="utf-8") as f: self.assertEqual(len(json.load(f)), 1)

    def test_sin_exportacion_no_falla(self):
        r = A.ejecutar(home=self.home, descargas=self.descargas, ahora=AHORA)
        self.assertEqual((r["ok"], r["nuevas"]), (True, 0))


if __name__ == "__main__":
    unittest.main()
