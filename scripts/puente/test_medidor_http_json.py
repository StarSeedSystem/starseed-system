#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del adaptador http_json y declarado (MC1007C)."""

import json
import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_http_json as M


class TestExtraer(unittest.TestCase):
    def test_puntos_simples(self):
        doc = {"data": {"usage": 2.5, "limit": 10, "limit_remaining": 7.5}}
        self.assertEqual(M.extraer(doc, "data.usage"), 2.5)
        self.assertEqual(M.extraer(doc, "data.limit_remaining"), 7.5)

    def test_indices_numericos(self):
        doc = {"items": [{"x": 1}, {"x": 2}]}
        self.assertEqual(M.extraer(doc, "items.0.x"), 1.0)
        self.assertEqual(M.extraer(doc, "items.1.x"), 2.0)

    def test_nulo_y_cadena_invalida(self):
        self.assertIsNone(M.extraer(None, "a"))
        self.assertIsNone(M.extraer({"a": "no"}, "a"))


class TestLeerHttpJson(unittest.TestCase):
    def test_limit_nulo_sin_ventanas(self):
        def falso(url, **kw):
            class Resp:
                def read(self, *a, **kw): return b'{"data":{"usage":1,"limit":0}}'
                def __enter__(self): return self
                def __exit__(self, *a): pass
            return Resp()
        r = M.leer_http_json({"id":"t","nombre":"T","proveedor":"p","url":"https://e.co/",
            "clave_env":"X","rutas":{"usado":"data.usage","limite":"data.limit","restante":"data.limit_remaining"},
            "unidad":"USD"}, datetime.now(), abrir_url=falso, entorno={"X":"secreto"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["ventanas"], [])
        self.assertIsNotNone(r["saldo"])

    def test_http_rechazado(self):
        r = M.leer_http_json({"id":"t","url":"http://inseguro/"}, datetime.now(), entorno={})
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"], "solo https")

    def test_falta_clave(self):
        r = M.leer_http_json({"id":"t","url":"https://e.co/","clave_env":"FALTA"}, datetime.now(), entorno={})
        self.assertFalse(r["ok"])
        self.assertIn("falta", r["error"])
        self.assertIn("FALTA", r["error"])

    def test_http_401(self):
        def falso(url, **kw):
            raise urllib.error.HTTPError(url, 401, "Unauthorized", {"Accept":"application/json"}, None)
        r = M.leer_http_json({"id":"t","url":"https://e.co/","clave_env":"K","rutas":{}}, datetime.now(), abrir_url=falso, entorno={"K":"v"})
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"], "http 401")

    def test_cabecera_lleva_clave_y_resultado_sin_valor(self):
        capturado = {}
        def falso(url, **kw):
            capturado["req"] = url
            class Resp:
                def read(self, *a, **kw): return b'{"data":{"usage":2.5,"limit":10,"limit_remaining":7.5}}'
                def __enter__(self): return self
                def __exit__(self, *a): pass
            return Resp()
        r = M.leer_http_json({"id":"t","nombre":"N","proveedor":"p","url":"https://e.co/",
            "clave_env":"API_KEY","rutas":{"usado":"data.usage","limite":"data.limit","restante":"data.limit_remaining"},
            "unidad":"USD"}, datetime.now(), abrir_url=falso, entorno={"API_KEY":"clave_secreta_123"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["ventanas"][0]["usado_pct"], 25.0)
        self.assertEqual(r["saldo"]["valor"], 7.5)
        # Verificar cabecera
        req_obj = capturado.get("req")
        # `url` en abrir_url es el Request; comprobamos que el resultado JSON no contiene la clave
        resultado_json = json.dumps(r)
        self.assertNotIn("clave_secreta_123", resultado_json)


class TestDeclarado(unittest.TestCase):
    def test_formato_real_claude_nube(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write(json.dumps({
                "restante_usd": 120.5,
                "total_usd": 250,
                "vence": "2026-11-05T01:59:00-06:00",
                "declarado_en": "2026-09-27T10:00:00Z"
            }))
            ruta = f.name
        try:
            r = M.leer_declarado({"id":"claude-nube","archivo":ruta,"nombre":"Claude nube","proveedor":"anthropic",
                "rutas":{"restante":"restante_usd","limite":"total_usd","vence":"vence"},"unidad":"USD"},
                datetime.now(timezone.utc))
            self.assertTrue(r["ok"])
            self.assertEqual(r["saldo"]["valor"], 120.5)
            self.assertEqual(r["saldo"]["limite"], 250)
            self.assertIn("vence", r["extras"])
            self.assertEqual(r["leido"], "2026-09-27T10:00:00Z")
        finally:
            os.unlink(ruta)


if __name__ == "__main__":
    unittest.main()
