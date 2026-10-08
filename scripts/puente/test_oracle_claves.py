#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni ssh real para oracle_claves."""
from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_claves as oc  # noqa: E402


class PruebasOracleClaves(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.home = Path(self.temporal.name)
        # Env inyectado en directorio temporal (sin tocar la casa real)
        self.env_path = self.home / ".starseed" / "env"
        self.env_path.parent.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.temporal.cleanup()

    def configurar_env(self, datos: dict[str, str]):
        lineas = [f"{k}={v}" for k, v in datos.items()]
        self.env_path.write_text("\n".join(lineas) + "\n", encoding="utf-8")

    def test_nombres_invalidos_rechazados(self):
        errores = oc.validar_nombres(["ASTRA_CLOUD_URL", "clave_mal", "123_BAD", "VA_OK"])
        self.assertIn("clave_mal (no coincide con [A-Z][A-Z0-9_]+)", errores)
        self.assertIn("123_BAD (no coincide con [A-Z][A-Z0-9_]+)", errores)
        self.assertNotIn("ASTRA_CLOUD_URL", errores)
        self.assertNotIn("VA_OK", errores)

    def test_simular_no_imprime_valores(self):
        salida = io.StringIO()
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch("pathlib.Path.home", return_value=self.home):
                with mock.patch("oracle_claves.ENV_LOCAL", self.env_path):
                    with mock.patch("oracle_claves.ORACLE_JSON", self.home / ".starseed" / "oracle.json"):
                        self.configurar_env({"ASTRA_CLOUD_URL": "https://ejemplo.com/secreto"})
                        with mock.patch.object(oc, "entregas_por_ssh", return_value=0) as ssh_mock:
                            with mock.patch("sys.stdout", salida):
                                resultado = oc.main(["maquina", "ASTRA_CLOUD_URL", "--simular"])
        self.assertEqual(resultado, 0)
        texto = salida.getvalue()
        self.assertNotIn("https://", texto)
        self.assertNotIn("secreto", texto)
        self.assertIn("ASTRA_CLOUD_URL ✓", texto)

    def test_ssh_falso_captura_entrada_y_saluda_ok(self):
        entrado = io.BytesIO()
        capturado = io.StringIO()
        def ssh_falso(args, **kwargs):
            # Capturar stdin que recibe ssh
            stdin_data = kwargs.get("input", "")
            capturado.write(stdin_data)
            return type("R", (), {"returncode": 0, "stderr": ""})()
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch("pathlib.Path.home", return_value=self.home):
                with mock.patch("oracle_claves.ENV_LOCAL", self.env_path):
                    with mock.patch("oracle_claves.ORACLE_JSON", self.home / ".starseed" / "oracle.json"):
                        self.configurar_env({"ORACLE_VAR": "valor_prueba"})
                        with mock.patch("subprocess.run", ssh_falso):
                            resultado = oc.main(["starseed-a1", "ORACLE_VAR"])
        self.assertEqual(resultado, 0)
        stdin_capturado = capturado.getvalue()
        self.assertIn("ORACLE_VAR=valor_prueba", stdin_capturado)
        # Verificar que ninguna salida de main imprime el valor directamente
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch("pathlib.Path.home", return_value=self.home):
                with mock.patch("oracle_claves.ENV_LOCAL", self.env_path):
                    with mock.patch("oracle_claves.ORACLE_JSON", self.home / ".starseed" / "oracle.json"):
                        salida_std = io.StringIO()
                        with mock.patch("sys.stdout", salida_std):
                            with mock.patch("subprocess.run", ssh_falso):
                                oc.main(["starseed-a1", "ORACLE_VAR"])
        texto_salida = salida_std.getvalue()
        self.assertNotIn("valor_prueba", texto_salida)
        self.assertIn("ORACLE_VAR ✓", texto_salida)


if __name__ == "__main__":
    unittest.main()
