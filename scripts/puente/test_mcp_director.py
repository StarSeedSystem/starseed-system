#!/usr/bin/env python3
"""Pruebas de mcp_director.atender con carpeta temporal vía STARSEED_ROOT."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import director_chat
import mcp_director


class PruebasAtender(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._guardada = os.environ.get("STARSEED_ROOT")
        os.environ["STARSEED_ROOT"] = self.tmp.name

    def tearDown(self):
        if self._guardada is None:
            os.environ.pop("STARSEED_ROOT", None)
        else:
            os.environ["STARSEED_ROOT"] = self._guardada
        self.tmp.cleanup()

    def _p(self, metodo, params=None, ident=1):
        peticion = {"jsonrpc": "2.0", "id": ident, "method": metodo}
        if params is not None:
            peticion["params"] = params
        return peticion

    def _call(self, nombre, argumentos):
        r = mcp_director.atender(
            self._p("tools/call", {"name": nombre, "arguments": argumentos})
        )
        assert "error" not in r, r.get("error")
        return r["result"]["content"][0]["text"]

    def test_initialize(self):
        r = mcp_director.atender(self._p("initialize"))
        self.assertEqual(r["jsonrpc"], "2.0")
        self.assertEqual(r["result"]["protocolVersion"], "2025-06-18")
        self.assertEqual(r["result"]["serverInfo"]["name"], "starseed-director")
        self.assertEqual(r["result"]["capabilities"], {"tools": {}})

    def test_notificacion_initialized_sin_respuesta(self):
        r = mcp_director.atender(
            {"jsonrpc": "2.0", "method": "notifications/initialized"}
        )
        self.assertIsNone(r)

    def test_tools_list_cuatro_herramientas(self):
        r = mcp_director.atender(self._p("tools/list"))
        nombres = [h["name"] for h in r["result"]["tools"]]
        self.assertEqual(
            nombres,
            [
                "director_leer",
                "director_decir",
                "director_bandeja",
                "director_responder",
            ],
        )

    def test_decir_y_leer(self):
        self.assertIn(
            "Publicado como md-",
            self._call("director_decir", {"texto": "Hola desde la prueba"}),
        )
        texto = self._call("director_leer", {"limite": 10})
        self.assertIn("Hola desde la prueba", texto)
        self.assertIn("[agente]", texto)

    def test_decir_rol_director_para_claude(self):
        self._call("director_decir", {"texto": "Informe", "de": "claude-cowork"})
        self.assertIn("[director]", self._call("director_leer", {}))

    def test_responder_marca_entrega(self):
        original = director_chat.publicar(
            "Mensaje para ide",
            de="claude-cowork",
            rol="director",
            tipo="mensaje",
            canal="mando",
            canales=["ide"],
        )
        self.assertIn(
            "Mensaje para ide", self._call("director_bandeja", {"canal": "ide"})
        )
        self.assertIn(
            "Respondido a",
            self._call(
                "director_responder",
                {
                    "id": original["id"],
                    "canal": "ide",
                    "texto": "Recibido",
                    "de": "antigravity",
                },
            ),
        )
        self.assertIn(
            "No hay pendientes", self._call("director_bandeja", {"canal": "ide"})
        )

    def test_metodo_desconocido(self):
        r = mcp_director.atender(self._p("no/existe"))
        self.assertEqual(r["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()
