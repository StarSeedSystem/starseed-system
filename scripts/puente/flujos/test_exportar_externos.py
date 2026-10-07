"""Pruebas de exportar_externos: sin red, con respuestas falsas."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flujos import exportar_externos as ee


WORKFLOW = {
    "name": "Aviso Diario",
    "nodes": [
        {"id": "1", "name": "Webhook", "type": "n8n-nodes-base.webhook",
         "parameters": {"path": "aviso"},
         "credentials": {"httpHeaderAuth": {"id": "9", "name": "Clave Aviso"}}},
        {"id": "2", "name": "HTTP", "type": "n8n-nodes-base.httpRequest",
         "parameters": {"url": "https://ejemplo.test", "method": "GET"}},
    ],
    "connections": {"Webhook": {"main": [[{"node": "HTTP"}]]}},
}


class TestN8n(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.entrada = self.raiz / "entrada"
        self.entrada.mkdir()
        self.exports = self.raiz / "exports"
        self.hoy = datetime(2026, 10, 7, 12, 0, 0)

    def tearDown(self):
        self.tmp.cleanup()

    def test_exporta_limpia_e_importa(self):
        (self.entrada / "aviso.json").write_text(
            json.dumps(WORKFLOW), encoding="utf-8")
        (self.entrada / "no-es-flujo.json").write_text(
            json.dumps({"hola": 1}), encoding="utf-8")
        res = ee.exportar_n8n(self.entrada, self.exports, self.hoy,
                              guardar_flujo_fn=lambda flujo: self.raiz / "f.json")
        self.assertEqual(res["total"], 1)
        self.assertEqual(len(res["ignorados"]), 1)
        guardado = json.loads(Path(res["flujos"][0]["json"]).read_text("utf-8"))
        nodo = guardado["nodes"][0]
        self.assertNotIn("credentials", nodo)
        self.assertEqual(nodo["credenciales_nombres"], ["Clave Aviso"])
        self.assertIn("9", json.dumps(WORKFLOW))  # el original no se toca
        informe = Path(res["flujos"][0]["informe"]).read_text("utf-8")
        self.assertIn("Aviso Diario", informe)
        self.assertIn("Traducidos", informe)
        estado = ee.leer_estado(self.exports)
        self.assertEqual(estado["n8n"][0]["total"], 1)

    def test_estado_vacio(self):
        estado = ee.leer_estado(self.exports)
        self.assertEqual(estado, {"n8n": [], "dify": []})


class TestDify(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.exports = Path(self.tmp.name) / "exports"
        self.hoy = datetime(2026, 10, 7, 12, 0, 0)
        self.viejas = {k: os.environ.get(k) for k in ("DIFY_URL", "DIFY_CLAVE")}
        os.environ["DIFY_URL"] = "https://dify.test"
        os.environ["DIFY_CLAVE"] = "falsa"

    def tearDown(self):
        self.tmp.cleanup()
        for k, v in self.viejas.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def _http_falso(self, url: str, cabeceras):
        if url.endswith("/v1/datasets?page=1&limit=100"):
            return {"data": [{"id": "b1", "name": "Base Uno"}], "has_more": False}
        if "/v1/datasets/b1/documents" in url:
            return {"data": [
                {"id": "d1", "name": "Doc Uno", "text": "contenido uno"},
                {"id": "d2", "name": "Doc Dos", "text": "contenido dos"},
            ], "has_more": False}
        raise AssertionError(f"URL inesperada: {url}")

    def test_exporta_bases_y_documentos(self):
        res = ee.exportar_dify(http_get=self._http_falso,
                               raiz_exports=self.exports, ahora=self.hoy,
                               cargar_conocimiento=False)
        self.assertEqual(res["total_documentos"], 2)
        self.assertEqual(res["bases"][0]["nombre"], "Base Uno")
        ruta = Path(res["destino"]) / "base-uno" / "doc-uno.json"
        self.assertTrue(ruta.exists())
        estado = ee.leer_estado(self.exports)
        self.assertEqual(estado["dify"][0]["documentos"], 2)

    def test_sin_claves_no_llama_a_red(self):
        os.environ.pop("DIFY_URL")
        res = ee.exportar_dify(http_get=self._http_falso,
                               raiz_exports=self.exports, ahora=self.hoy,
                               cargar_conocimiento=False)
        self.assertIn("error", res)

    def test_paginacion(self):
        llamadas = []

        def http(url, cab):
            llamadas.append(url)
            if "page=1" in url:
                return {"data": [{"id": "b1", "name": "B"}], "has_more": True}
            if "page=2" in url and "documents" not in url:
                return {"data": [], "has_more": False}
            return {"data": [], "has_more": False}

        res = ee.exportar_dify(http_get=http, raiz_exports=self.exports,
                               ahora=self.hoy, cargar_conocimiento=False)
        self.assertEqual(len(res["bases"]), 1)
        self.assertTrue(any("page=2" in u for u in llamadas))


if __name__ == "__main__":
    unittest.main()
