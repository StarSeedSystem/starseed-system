#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para escritor_claude_plan.py (scripts/puente/).

TDD: escribir primero pruebas que fallen, luego implementar.
Pruebas con claude falso: cupo, entorno sin claves, modo plan.
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

RUTA = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "escritor_claude_plan.py"
)
ESPEC = importlib.util.spec_from_file_location("escritor_claude_plan", RUTA)
escritor_claude = importlib.util.module_from_spec(ESPEC)
sys.modules["escritor_claude_plan"] = escritor_claude
ESPEC.loader.exec_module(escritor_claude)


class TestEntornoSinClaves(unittest.TestCase):
    def test_elimina_anthropic_api_key(self):
        env = {"ANTHROPIC_API_KEY": "sk-test-123", "OTHER": "value"}
        limpio = escritor_claude.entorno_sin_claves_api(env)
        self.assertNotIn("ANTHROPIC_API_KEY", limpio)
        self.assertEqual(limpio["OTHER"], "value")

    def test_elimina_anthropic_auth_token(self):
        env = {"ANTHROPIC_AUTH_TOKEN": "token-abc", "PATH": "/usr/bin"}
        limpio = escritor_claude.entorno_sin_claves_api(env)
        self.assertNotIn("ANTHROPIC_AUTH_TOKEN", limpio)

    def test_conserva_otras_variables(self):
        env = {"ANTHROPIC_API_KEY": "key", "HOME": "/home/user", "PATH": "/usr/bin"}
        limpio = escritor_claude.entorno_sin_claves_api(env)
        self.assertEqual(limpio["HOME"], "/home/user")
        self.assertEqual(limpio["PATH"], "/usr/bin")

    def test_sin_entorno_usa_actual(self):
        original = dict(os.environ)
        try:
            os.environ.pop("ANTHROPIC_API_KEY", None)
            os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)
            limpio = escritor_claude.entorno_sin_claves_api()
            self.assertIsInstance(limpio, dict)
        finally:
            os.environ.clear()
            os.environ.update(original)


class TestClaudeDisponible(unittest.TestCase):
    def test_no_disponible_sin_binario(self):
        with mock.patch.object(escritor_claude, "shutil") as mock_shutil:
            mock_shutil.which.return_value = None
            escritor_claude.shutil.which = mock_shutil.which
            self.assertFalse(escritor_claude.claude_esta_disponible())

    def test_no_disponible_sesion_caducada(self):
        with mock.patch.object(escritor_claude, "shutil") as mock_shutil:
            with mock.patch.object(escritor_claude, "subprocess") as mock_subp:
                mock_shutil.which.return_value = "/usr/local/bin/claude"
                mock_subp.run.return_value = mock.Mock(
                    stdout="",
                    stderr="Session expired, please login again"
                )
                self.assertFalse(escritor_claude.claude_esta_disponible())

    def test_no_disponible_cupo_semana_85(self):
        with mock.patch.object(escritor_claude, "shutil") as mock_shutil:
            with mock.patch.object(escritor_claude, "subprocess") as mock_subp:
                mock_shutil.which.return_value = "/usr/local/bin/claude"
                mock_subp.run.return_value = mock.Mock(
                    stdout="Usage: 85% of weekly limit",
                    stderr=""
                )
                self.assertFalse(escritor_claude.claude_esta_disponible())

    def test_disponible_cupo_semana_70(self):
        with mock.patch.object(escritor_claude, "shutil") as mock_shutil:
            with mock.patch.object(escritor_claude, "subprocess") as mock_subp:
                mock_shutil.which.return_value = "/usr/local/bin/claude"
                mock_subp.run.return_value = mock.Mock(
                    stdout="Usage: 70% of weekly limit",
                    stderr=""
                )
                self.assertTrue(escritor_claude.claude_esta_disponible())


class TestOrdenClaudePlan(unittest.TestCase):
    def test_orden_incluye_prompt(self):
        orden = escritor_claude.orden_claude_plan("planificar", "/tmp/wt")
        self.assertIn("-p", orden)
        self.assertIn("planificar", orden)

    def test_orden_incluye_modelo(self):
        orden = escritor_claude.orden_claude_plan("planificar", "/tmp/wt", modelo="opus")
        self.assertIn("opus", orden)

    def test_modelo_por_defecto_sonnet(self):
        orden = escritor_claude.orden_claude_plan("planificar", "/tmp/wt")
        self.assertIn("sonnet", orden)


class TestOrdenClaudeEscribir(unittest.TestCase):
    def test_orden_para_escribir_codigo(self):
        orden = escritor_claude.orden_claude_escribir("escribe este código", "/tmp/wt")
        self.assertIn("exec", orden)
        self.assertIn("-m", orden)
        self.assertIn("sonnet", orden)
        self.assertIn("-s", orden)
        self.assertIn("workspace-write", orden)


class TestErroresClaude(unittest.TestCase):
    def test_es_error_cuota(self):
        self.assertTrue(escritor_claude.es_error_cuota_claude("Rate limit exceeded"))
        self.assertTrue(escritor_claude.es_error_cuota_claude("429 Too Many Requests"))
        self.assertTrue(escritor_claude.es_error_cuota_claude("Daily limit reached"))
        self.assertFalse(escritor_claude.es_error_cuota_claude("Syntax error"))

    def test_es_error_sesion(self):
        self.assertTrue(escritor_claude.es_error_sesion_claude("Session expired"))
        self.assertTrue(escritor_claude.es_error_sesion_claude("Invalid API key"))
        self.assertTrue(escritor_claude.es_error_sesion_claude("Unauthorized"))
        self.assertFalse(escritor_claude.es_error_sesion_claude("Rate limit exceeded"))


class TestLeerSalidaClaude(unittest.TestCase):
    def test_salida_exitosa(self):
        r = escritor_claude.leer_salida_claude("Plan generado correctamente", 0)
        self.assertEqual(r["texto"], "Plan generado correctamente")
        self.assertIsNone(r["error"])

    def test_salida_vacia_es_fallo(self):
        r = escritor_claude.leer_salida_claude("", 0)
        self.assertIsNotNone(r["error"])

    def test_error_cuota_detectado(self):
        r = escritor_claude.leer_salida_claude("Rate limit exceeded", 0)
        self.assertIsNotNone(r["error"])
        self.assertIn("cuota", r["error"].lower())


class TestModeloClaude(unittest.TestCase):
    def test_es_modelo_claude_siempre(self):
        self.assertTrue(escritor_claude.es_modelo_claude("claude/sonnet"))
        self.assertTrue(escritor_claude.es_modelo_claude("claude/opus"))
        self.assertFalse(escritor_claude.es_modelo_claude("sonnet"))
        self.assertFalse(escritor_claude.es_modelo_claude("opencode/glm-5.3"))
        self.assertFalse(escritor_claude.es_modelo_claude(""))

    def test_claude_sin_prefijo(self):
        self.assertEqual(escritor_claude.claude_sin_prefijo("claude/sonnet"), "sonnet")
        self.assertEqual(escritor_claude.claude_sin_prefijo("claude/opus"), "opus")
        self.assertEqual(escritor_claude.claude_sin_prefijo("sonnet"), "sonnet")
        self.assertEqual(escritor_claude.claude_sin_prefijo(""), "sonnet")


class TestParametrosClaude(unittest.TestCase):
    def test_segmentos_definidos(self):
        self.assertEqual(escritor_claude.SEGUNDOS_ESCRITURA_CLAUDE, 1500)
        self.assertEqual(escritor_claude.CODIGO_FALLO, 1)
        self.assertEqual(escritor_claude.CODIGO_TIMEOUT, 124)

    def test_modelos_claude(self):
        self.assertIn("claude/sonnet", escritor_claude.MODELOS_CLAUDE)
        self.assertIn("claude/opus", escritor_claude.MODELOS_CLAUDE)


if __name__ == "__main__":
    unittest.main()