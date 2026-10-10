#!/usr/bin/env python3
"""Pruebas de actualizar_catalogo sin red: urlopen simulado y catálogo falso."""
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "protomolecula"))
import actualizar_catalogo as ac

CATALOGO = """
export const herramientas = {
  imagen: { id: "imagen", nombre: "Imagen", repositorio: "OWNER1/repo-uno" },
  audio: {
    id: "audio", nombre: "Audio",
    repositorio: "https://github.com/OWNER2/repo-dos",
  },
};
"""


def respuesta(payload):
    falso = io.BytesIO(json.dumps(payload).encode())
    falso.__enter__ = lambda s: s
    falso.__exit__ = lambda *a: False
    falso.headers = {}
    return falso


def http_error(codigo, reset=None):
    cabeceras = {}
    if reset is not None:
        cabeceras["x-ratelimit-reset"] = str(reset)
    return urllib.error.HTTPError("http://x", codigo, "", cabeceras, None)


class ActualizarCatalogoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.catalogo = os.path.join(self.tmp.name, "catalogo.ts")
        self.salida = os.path.join(self.tmp.name, "salida.json")
        self.cache = os.path.join(self.tmp.name, "cache.json")
        with open(self.catalogo, "w", encoding="utf-8") as f:
            f.write(CATALOGO)

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self, extra=None):
        argv = ["x", "--catalogo", self.catalogo, "--salida", self.salida,
                "--cache", self.cache] + (extra or [])
        with mock.patch("sys.argv", argv):
            return ac.main()

    def test_extraer_repos(self):
        herramientas = ac.extraer_herramientas(CATALOGO)
        self.assertEqual(herramientas,
                         {"imagen": "OWNER1/repo-uno",
                          "audio": "OWNER2/repo-dos"})

    def test_falta_catalogo_codigo_2(self):
        with mock.patch("sys.argv", ["x", "--catalogo", "/no/existe.ts"]):
            self.assertEqual(ac.main(), 2)

    def test_json_salida_claves_esperadas(self):
        datos_falsos = {
            "tag_name": "v2.1.0", "published_at": "2026-10-01T00:00:00Z",
            "license": {"spdx_id": "MIT"},
            "assets": [{"digest": "sha256:abc"}],
        }
        with mock.patch("urllib.request.urlopen",
                        return_value=respuesta(datos_falsos)):
            self.assertEqual(self.correr(), 0)
        with open(self.salida, encoding="utf-8") as f:
            doc = json.load(f)
        self.assertIn("actualizado", doc)
        entrada = doc["herramientas"]["imagen"]
        for clave in ("version", "fecha", "licencia", "sha", "estado"):
            self.assertIn(clave, entrada)
        self.assertEqual(entrada["version"], "v2.1.0")
        self.assertEqual(entrada["sha"], "sha256:abc")
        self.assertEqual(entrada["estado"], "disponible")

    def test_cache_vigente_no_consulta(self):
        ac.guardar_cache(self.cache, {"OWNER1/repo-uno": {
            "version": "v9", "fecha": None, "licencia": None, "sha": None,
            "estado": "disponible"}})
        llamadas = []

        def falso_urlopen(req, timeout=0):
            llamadas.append(req.full_url)
            return respuesta({"tag_name": "v1"})

        with mock.patch("urllib.request.urlopen", falso_urlopen):
            self.assertEqual(self.correr(), 0)
        repos_pedidos = [u for u in llamadas if "OWNER1" in u]
        self.assertEqual(repos_pedidos, [])

    def test_403_espera_reinicio_y_reintenta(self):
        intentos = []

        def falso_urlopen(req, timeout=0):
            intentos.append(1)
            if len(intentos) == 1:
                raise http_error(403, reset=int(__import__("time").time()))
            return respuesta({"tag_name": "v3"})

        with mock.patch("urllib.request.urlopen", falso_urlopen):
            entrada = ac.comprobar("OWNER1/repo-uno")
        self.assertEqual(len(intentos), 2)
        self.assertEqual(entrada["version"], "v3")

    def test_sin_releases_usa_tags(self):
        def falso_urlopen(req, timeout=0):
            if "releases" in req.full_url:
                raise http_error(404)
            return respuesta([{"name": "v0.9"}])

        with mock.patch("urllib.request.urlopen", falso_urlopen):
            entrada = ac.comprobar("OWNER1/repo-uno")
        self.assertEqual(entrada["version"], "v0.9")
        self.assertEqual(entrada["sha"], None)

    def test_repo_inexistente(self):
        with mock.patch("urllib.request.urlopen",
                        side_effect=http_error(404)):
            entrada = ac.comprobar("OWNER1/fantasma")
        self.assertEqual(entrada["estado"], "error")

    def test_error_de_red_sin_comprobar_con_motivo(self):
        with mock.patch("urllib.request.urlopen",
                        side_effect=urllib.error.URLError("caído")):
            entrada = ac.comprobar("OWNER1/repo-uno")
        self.assertEqual(entrada["estado"], "sin-comprobar")
        self.assertIn("motivo", entrada)

    def test_solo_informe_no_escribe(self):
        with mock.patch("urllib.request.urlopen",
                        return_value=respuesta({"tag_name": "v1"})):
            self.assertEqual(self.correr(["--solo-informe"]), 0)
        self.assertFalse(os.path.exists(self.salida))
        self.assertFalse(os.path.exists(self.cache))


if __name__ == "__main__":
    unittest.main()
