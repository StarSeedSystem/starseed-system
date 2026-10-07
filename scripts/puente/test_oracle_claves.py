#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni OCI real para oracle_claves."""
from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
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

    def tearDown(self):
        self.temporal.cleanup()

    def configurar_env(self, datos: dict[str, str] | None = None) -> None:
        env_ruta = self.home / ".starseed" / "env"
        env_ruta.parent.mkdir(parents=True)
        contenido = ""
        if datos:
            contenido = "\n".join(f"{k}={v}" for k, v in datos.items())
        env_ruta.write_text(contenido, encoding="utf-8")
        # Crear un archivo oracle.json falso con una instancia
        oracle_ruta = self.home / ".starseed" / "oracle.json"
        oracle_ruta.parent.mkdir(parents=True, exist_ok=True)
        oracle_ruta.write_text(
            json.dumps({"instancias": [{"nombre": "starseed-a1", "ip_publica": "10.0.0.5"}]}),
            encoding="utf-8"
        )

    def test_rechaza_nombres_invalidos(self):
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            self.configurar_env({"STARSEED_API_KEY": "secreto123"})
            # Llamar con nombre inválido debe fallar sin imprimir valores
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                resultado = oc.main(["starseed-a1", "starseed_api_key"])
            self.assertEqual(resultado, 1)
            texto = salida.getvalue()
            self.assertIn("rechazados nombres", texto)
            # No debe contener el valor de la variable (aunque sea inválida)
            self.assertNotIn("secreto", texto)

    def test_simular_no_imprime_valores(self):
        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            self.configurar_env({"STARSEED_API_KEY": "secreto123", "ASTRAURA_KEY": "otro"})
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                resultado = oc.main(["starseed-a1", "--simular", "STARSEED_API_KEY", "ASTRAURA_KEY", "NO_EXISTE"])
            self.assertEqual(resultado, 0)
            texto = salida.getvalue()
            self.assertIn("simular", texto)
            # No debe contener valores de las variables
            self.assertNotIn("secreto123", texto)
            self.assertNotIn("otro", texto)
            # Debe mencionar la variable faltante
            self.assertIn("NO_EXISTE", texto)

    def test_ssh_falso_captura_entrada_y_no_imprime_valores(self):
        """Inyecta un ssh falso que captura stdin y comprueba que la salida
        impresa no contiene ningún valor."""
        entradas_capturadas: list[bytes] = []
        def ssh_falso(*args, **kwargs):
            if "input" in kwargs:
                entradas_capturadas.append(kwargs["input"])
            # Devolver una respuesta vacía (como si ssh tuviera éxito)
            return subprocess.CompletedProcess(args=[], returncode=0, stdout=b"", stderr=b"")

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            self.configurar_env({"STARSEED_API_KEY": "secreto123"})
            salida = io.StringIO()
            with mock.patch("oracle_claves.subprocess.run", ssh_falso), \
                 contextlib.redirect_stdout(salida):
                resultado = oc.main(["starseed-a1", "STARSEED_API_KEY"])
            texto = salida.getvalue()
            # No debe contener valores
            self.assertNotIn("secreto123", texto)
            # Debe contener la confirmación sin valor
            self.assertIn("STARSEED_API_KEY ✓", texto)
            # El ssh falso debe haber recibido la entrada con el archivo en memoria
            self.assertTrue(len(entradas_capturadas) > 0)
            contenido_capturado = entradas_capturadas[0].decode("utf-8")
            # El contenido capturado debe tener el archivo con la variable y valor
            # (esto es la entrada a ssh, no la salida impresa)
            self.assertIn("STARSEED_API_KEY=secreto123", contenido_capturado)


if __name__ == "__main__":
    unittest.main()
