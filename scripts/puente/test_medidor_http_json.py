#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests unitarios para medidor_http_json.py (MC1007C · 2026-10-06).

Pruebas unitarias para las funciones puras del adaptador de medidores http_json y declarado:
- extraer: navegación por rutas de puntos
- leer_entorno: lectura de variables de entorno sin ejecutar archivos .env
- leer_declarado: lectura de archivos JSON declarados por el usuario
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest.mock import MagicMock, Mock, patch

from medidor_http_json import (
    extraer,
    leer_entorno,
    leer_declarado,
    leer_http_json,
)


class TestExtraer(unittest.TestCase):
    """Prueba la función pura extraer."""

    def test_extraer_números(self) -> None:
        doc = {"data": {"usage": 2.5, "limit": 10, "limit_remaining": 7.5}}
        self.assertEqual(extraer(doc, "data.usage"), 2.5)
        self.assertEqual(extraer(doc, "data.limit"), 10.0)
        self.assertEqual(extraer(doc, "data.limit_remaining"), 7.5)
        self.assertEqual(extraer(doc, "data.missing"), None)
        self.assertEqual(extraer({"items": [{"x": 1}, {"x": 2}]}, "items.0.x"), 1.0)

    def test_extraer_texto_numérico(self) -> None:
        self.assertEqual(extraer({"valor": "123"}, "valor"), 123.0)
        self.assertEqual(extraer({"valor": "45.67"}, "valor"), 45.67)

    def test_extraer_no_numérico(self) -> None:
        self.assertEqual(extraer({"valor": "texto"}, "valor"), None)
        self.assertEqual(extraer({"valor": []}, "valor"), None)

    def test_extraer_ruta_vacia(self) -> None:
        self.assertEqual(extraer({"a": 1}, ""), None)

    def test_extraer_indice_fuera_de_rango(self) -> None:
        self.assertEqual(extraer({"items": [1, 2]}, "items.5"), None)


class TestLeerEntorno(unittest.TestCase):
    """Prueba leer_entorno sin ejecutar archivo .env."""

    @patch.dict(os.environ, {"EXISTE": "valor123", "NUMERO": "42"})
    def test_valor_en_entorno(self) -> None:
        self.assertEqual(leer_entorno("EXISTE"), "valor123")
        self.assertEqual(leer_entorno("NUMERO"), "42")

    def test_valor_no_en_entorno(self) -> None:
        self.assertEqual(leer_entorno("NOEXISTE"), None)

    @patch.dict(os.environ, {}, clear=True)
    def test_archivo_env_con_export(self) -> None:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".env", delete=False) as f:
            f.write("CLAVE_VALOR=123\nexport OTRO=abc\n# comentario\nSIN_IGUALDAD")
            tmp = f.name
        try:
            with patch("os.path.expanduser", return_value=tmp):
                self.assertEqual(leer_entorno("CLAVE_VALOR"), "123")
                self.assertEqual(leer_entorno("OTRO"), "abc")
                self.assertEqual(leer_entorno("FALTA"), None)
        finally:
            os.unlink(tmp)

    @patch.dict(os.environ, {}, clear=True)
    def test_solo_archivo_env(self) -> None:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".env", delete=False) as f:
            f.write("USUARIO=testuser\nCONTRASEÑA=secret\n")
            tmp = f.name
        try:
            with patch("os.path.expanduser", side_effect=lambda x: tmp if "~/.starseed" in x else x):
                self.assertEqual(leer_entorno("USUARIO"), "testuser")
                self.assertEqual(leer_entorno("CONTRASEÑA"), "secret")
        finally:
            os.unlink(tmp)


class TestLeerHttpJson(unittest.TestCase):
    """Prueba la lectura HTTP sin red ni claves reales."""

    def test_respuesta_valida_calcula_uso_y_saldo(self) -> None:
        entrada = {
            "id": "test-http", "nombre": "Test HTTP", "proveedor": "test",
            "url": "https://example.com/api", "clave_env": "TEST_API_KEY",
            "rutas": {
                "usado": "data.usage", "limite": "data.limit",
                "restante": "data.limit_remaining",
            },
            "unidad": "USD",
        }
        respuesta = MagicMock()
        respuesta.read.return_value = json.dumps({
            "data": {"usage": 25, "limit": 100, "limit_remaining": 75},
        }).encode("utf-8")
        respuesta_contexto = MagicMock()
        respuesta_contexto.__enter__.return_value = respuesta
        abrir_url = Mock(return_value=respuesta_contexto)

        resultado = leer_http_json(
            entrada, "2026-10-06T18:00:00Z", abrir_url=abrir_url,
            entorno={"TEST_API_KEY": "secreto"},
        )

        self.assertTrue(resultado["ok"], f"Resultado: {resultado}")
        self.assertEqual(resultado["ventanas"][0]["usado_pct"], 25.0)
        self.assertEqual(resultado["saldo"], {
            "valor": 75.0, "limite": 100.0, "unidad": "USD",
        })
        solicitud = abrir_url.call_args.args[0]
        self.assertEqual(solicitud.get_header("Authorization"), "Bearer secreto")
        abrir_url.assert_called_once_with(solicitud, timeout=20)
        respuesta.read.assert_called_once_with(256 * 1024)


class TestLeerDeclarado(unittest.TestCase):
    """Prueba leer_declarado sin archivo real."""

    def test_archivo_declarado_valido(self) -> None:
        """Test: leer_declarado lee un archivo JSON válido."""
        entrada = {
            "id": "test-declarado", "nombre": "Test Declarado", "proveedor": "test",
            "archivo": "/tmp/test-declarado.json",
            "rutas": {"restante": "restante_usd", "limite": "total_usd"},
            "unidad": "USD",
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({
                "restante_usd": 200,
                "total_usd": 300,
                "declarado_en": "2026-10-05T12:00:00Z"
            }, f, ensure_ascii=False)
            tmp = f.name
        try:
            with patch("os.path.expanduser", side_effect=lambda x: tmp):
                resultado = leer_declarado(entrada, "2026-10-06T18:00:00Z")
        finally:
            os.unlink(tmp)
        self.assertTrue(resultado["ok"], f"Resultado: {resultado}")
        self.assertEqual(resultado["fuente"], "declarado")
        self.assertEqual(resultado["leido"], "2026-10-05T12:00:00Z")
        self.assertEqual(resultado["saldo"]["valor"], 200.0)
        self.assertEqual(resultado["saldo"]["limite"], 300.0)

    def test_archivo_declarado_sin_declarado_en(self) -> None:
        """Test: leer_declarado usa la fecha actual si no hay declarado_en."""
        entrada = {
            "id": "sin-declarado-en", "archivo": "/tmp/sin-declarado.json",
            "rutas": {"restante": "restante_usd"}, "unidad": "USD",
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({"restante_usd": 150}, f, ensure_ascii=False)
            tmp = f.name
        try:
            with patch("os.path.expanduser", side_effect=lambda x: tmp):
                resultado = leer_declarado(entrada, "2026-10-06T18:00:00Z")
        finally:
            os.unlink(tmp)
        self.assertTrue(resultado["ok"], f"Resultado: {resultado}")
        self.assertEqual(resultado["leido"], "2026-10-06T18:00:00Z")

    def test_archivo_declarado_no_existente(self) -> None:
        """Test: leer_declarado devuelve valores por defecto cuando el archivo no existe."""
        entrada = {
            "id": "no-existente", "archivo": "/tmp/inesistente.json",
            "rutas": {"restante": "restante_usd"}, "unidad": "USD",
        }
        with patch("os.path.expanduser", return_value="/tmp/inesistente.json"):
            with patch("builtins.open", side_effect=FileNotFoundError):
                resultado = leer_declarado(entrada, "2026-10-06T18:00:00Z")
        self.assertTrue(resultado["ok"], f"Resultado: {resultado}")
        self.assertEqual(resultado["fuente"], "declarado")
        self.assertEqual(resultado["leido"], "2026-10-06T18:00:00Z")
        self.assertIsNone(resultado.get("saldo"))

    def test_archivo_declarado_json_inválido(self) -> None:
        """Test: leer_declarado maneja archivos JSON inválidos."""
        entrada = {
            "id": "json-inv", "archivo": "/tmp/invalido.json",
            "rutas": {"restante": "restante_usd"}, "unidad": "USD",
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("not json at all")
            tmp = f.name
        try:
            with patch("os.path.expanduser", side_effect=lambda x: tmp):
                with patch("json.load", side_effect=json.JSONDecodeError("", "", 0)):
                    resultado = leer_declarado(entrada, "2026-10-06T18:00:00Z")
        finally:
            os.unlink(tmp)
        self.assertTrue(resultado["ok"], f"Resultado: {resultado}")
        self.assertEqual(resultado["fuente"], "declarado")
        self.assertEqual(resultado["leido"], "2026-10-06T18:00:00Z")

    def test_archivo_declarado_limit_cero_sin_ventanas(self) -> None:
        """Test: leer_declarado no crea ventanas cuando el límite es cero."""
        entrada = {
            "id": "limit-cero", "archivo": "/tmp/limit-cero.json",
            "rutas": {"limite": "total_usd", "restante": "restante_usd"}, "unidad": "USD",
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({"total_usd": 0, "restante_usd": 0}, f, ensure_ascii=False)
            tmp = f.name
        try:
            with patch("os.path.expanduser", side_effect=lambda x: tmp):
                resultado = leer_declarado(entrada, "2026-10-06T18:00:00Z")
        finally:
            os.unlink(tmp)
        self.assertTrue(resultado["ok"], f"Resultado: {resultado}")
        self.assertEqual(resultado["ventanas"], [])
        self.assertEqual(resultado["saldo"]["valor"], 0.0)


if __name__ == "__main__":
    unittest.main()
