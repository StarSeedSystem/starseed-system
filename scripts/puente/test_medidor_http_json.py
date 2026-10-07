#!/usr/bin/env python3
"""Tests para los adaptadores por configuración MC1007C (http_json y declarado).

Pruebas sin red ni procesos reales: se inyectan `abrir_url` falso y `abrir`
falso, y los valores vienen desde `entrada`.
"""
import json
import os
import sys

import urllib.error

from unittest.mock import MagicMock


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_http_json as mhj


FALSO_NOW = "2026-10-06T18:05:00-06:00"


def fake_abrir_url_25pct(req, timeout=None):
    class Resp:
        def read(self, _):
            return json.dumps({"data": {"usage": 2.5, "limit": 10, "limit_remaining": 7.5}}).encode("utf-8")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    return Resp()


def test_extraer():
    assert mhj.extraer({"data": {"usage": 2.5}}, "data.usage") == 2.5
    assert mhj.extraer({"data": {"limit": 10}}, "data.limit") == 10.0
    assert mhj.extraer({"data": {"limit_remaining": 7.5}}, "data.limit_remaining") == 7.5
    assert mhj.extraer({"a": {"b": {"c": 3}}}, "a.b.c") == 3.0
    assert mhj.extraer({"items": [{"x": 1}]}, "items.0.x") == 1.0
    assert mhj.extraer({"x": "5"}, "x") == 5.0
    assert mhj.extraer({"x": "abc"}, "x") is None
    assert mhj.extraer({"a": 1}, "") is None


def test_leer_entorno():
    assert mhj.leer_entorno("PATH", {"PATH": "/usr/bin"}) == "/usr/bin"
    assert mhj.leer_entorno("HOME", dict(os.environ)) == os.environ["HOME"]

    archivo = "/tmp/test_env"
    with open(archivo, "w") as f:
        f.write("export CLAVE_VALOR=miClave\n")
        f.write("OTRA=sin_export\n")
    try:
        assert mhj.leer_entorno("CLAVE_VALOR", rutas=(archivo,)) == "miClave"
        assert mhj.leer_entorno("OTRA", rutas=(archivo,)) is None
        assert mhj.leer_entorno("NOEXISTE", rutas=(archivo,)) is None
    finally:
        os.unlink(archivo)


def test_leer_http_json_exito():
    entrada = {
        "id": "openrouter",
        "proveedor": "openrouter",
        "nombre": "OpenRouter · saldo",
        "url": "https://openrouter.ai/api/v1/key",
        "clave_env": "OPENROUTER_API_KEY",
        "rutas": {
            "usado": "data.usage",
            "limite": "data.limit",
            "restante": "data.limit_remaining"
        },
        "unidad": "USD"
    }
    falso_env = {"OPENROUTER_API_KEY": "clave_falsa"}

    falso_abrir = MagicMock(return_value=fake_abrir_url_25pct(None))
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, abrir_url=falso_abrir, entorno=falso_env)

    assert resultado["id"] == "openrouter"
    assert resultado["ok"] is True
    assert resultado["error"] is None
    assert len(resultado["ventanas"]) == 1
    assert resultado["ventanas"][0]["id"] == "uso"
    assert resultado["ventanas"][0]["etiqueta"] == "Uso"
    assert abs(resultado["ventanas"][0]["usado_pct"] - 25.0) < 0.01
    assert resultado["ventanas"][0]["reinicia"] is None
    assert resultado["saldo"]["valor"] == 7.5
    assert resultado["saldo"]["limite"] == 10.0
    assert resultado["saldo"]["unidad"] == "USD"
    # Verificar que se llamó con los headers correctos
    falso_abrir.assert_called_once()
    req = falso_abrir.call_args[0][0]
    assert "Authorization" in req.headers
    assert req.headers["Authorization"].startswith("Bearer")


def test_leer_http_json_http_requerido():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "url": "http://example.com",
        "clave_env": "TEST_KEY",
        "unidad": "USD"
    }

    falso_env = {"TEST_KEY": "value"}
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, entorno=falso_env)

    assert resultado["ok"] is False
    assert resultado["error"] == "solo https"


def test_leer_http_json_falta_clave():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "url": "https://example.com",
        "unidad": "USD"
    }
    falso_env = {"OTRA": "value"}
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, entorno=falso_env)

    assert resultado["ok"] is False
    assert resultado["error"] == "falta TEST_KEY"


def test_leer_http_json_clave_valor_nulo():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "url": "https://example.com",
        "clave_env": "TEST_KEY",
        "unidad": "USD"
    }
    falso_env = {}
    falso_abrir = MagicMock(side_effect=Exception("no network"))
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, abrir_url=falso_abrir, entorno=falso_env)

    assert resultado["ok"] is False
    assert resultado["error"] == "falta TEST_KEY"


def test_leer_http_json_http_error():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "url": "https://example.com",
        "clave_env": "TEST_KEY",
        "unidad": "USD"
    }
    falso_env = {"TEST_KEY": "value"}

    class HTTPErrorResp:
        code = 401
        def __enter__(self):
            raise urllib.error.HTTPError("https://example.com", 401, "Unauthorized", {}, None)

        def __exit__(self, *args):
            pass

    falso_abrir = MagicMock(return_value=HTTPErrorResp())
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, abrir_url=falso_abrir, entorno=falso_env)

    assert resultado["ok"] is False
    assert resultado["error"] == "HTTP 401"


def test_leer_http_json_otro_error():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "url": "https://example.com",
        "clave_env": "TEST_KEY",
        "unidad": "USD"
    }
    falso_env = {"TEST_KEY": "value"}
    falso_abrir = MagicMock(side_effect=Exception("error de red"))
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, abrir_url=falso_abrir, entorno=falso_env)

    assert resultado["ok"] is False
    assert resultado["error"] == "Exception"


def test_leer_http_json_sin_limite():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "url": "https://example.com",
        "clave_env": "TEST_KEY",
        "unidad": "USD"
    }
    falso_env = {"TEST_KEY": "value"}

    def fake_abrir_url_sinlimite(req, timeout=None):
        class Resp:
            def read(self, _):
                return json.dumps({"data": {"limit_remaining": 0}}).encode("utf-8")
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
        return Resp()

    falso_abrir = MagicMock(return_value=fake_abrir_url_sinlimite(None))
    resultado = mhj.leer_http_json(entrada, FALSO_NOW, abrir_url=falso_abrir, entorno=falso_env)

    assert resultado["ok"] is True
    assert len(resultado["ventanas"]) == 0
    assert resultado["saldo"]["valor"] == 0
    assert resultado["saldo"]["limite"] == 0


def test_leer_declarado_exito():
    entrada = {
        "id": "claude-nube",
        "proveedor": "anthropic",
        "nombre": "Claude · crédito nube",
        "archivo": "/tmp/credito_claude_nube_test.json",
        "rutas": {
            "restante": "restante_usd",
            "limite": "total_usd",
            "vence": "vence"
        },
        "unidad": "USD"
    }

    archivo = "/tmp/credito_claude_nube_test.json"
    try:
        with open(archivo, "w") as f:
            json.dump({
                "restante_usd": 180,
                "total_usd": 250,
                "vence": "2026-11-05T01:59:00-06:00",
                "declarado_en": "2026-10-06T18:05:00-06:00"
            }, f)

        falso_abrir = MagicMock(side_effect=open)
        resultado = mhj.leer_declarado(entrada, FALSO_NOW, abrir=falso_abrir)

        assert resultado["id"] == "claude-nube"
        assert resultado["ok"] is True
        assert resultado["error"] is None
        assert len(resultado["ventanas"]) == 1
        assert resultado["ventanas"][0]["id"] == "uso"
        assert abs(resultado["ventanas"][0]["usado_pct"] - 28.0) < 0.01
        assert resultado["ventanas"][0]["reinicia"] == "2026-11-05T01:59:00-06:00"
        assert resultado["saldo"]["valor"] == 180
        assert resultado["saldo"]["limite"] == 250
        assert resultado["saldo"]["unidad"] == "USD"
        assert resultado["fuente"] == "declarado"
        assert "leido" in resultado
    finally:
        if os.path.exists(archivo):
            os.unlink(archivo)


def test_leer_declarado_sin_archivo():
    entrada = {
        "id": "test",
        "proveedor": "test",
        "nombre": "test",
        "unidad": "USD"
    }
    falso_abrir = MagicMock(side_effect=FileNotFoundError("no existe"))
    resultado = mhj.leer_declarado(entrada, FALSO_NOW, abrir=falso_abrir)

    assert resultado["ok"] is False
    assert resultado["error"] == "FileNotFoundError"
