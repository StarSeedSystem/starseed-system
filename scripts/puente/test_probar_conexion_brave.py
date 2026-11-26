#!/usr/bin/env python3
"""Pruebas para .agent/skills/mcp-brave-search/scripts/probar_conexion.py."""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

RUTA_SCRIPT = Path(__file__).resolve().parents[2] / ".agent" / "skills" / "mcp-brave-search" / "scripts" / "probar_conexion.py"


class PruebasProbarConexion(unittest.TestCase):
    def test_script_existe(self):
        self.assertTrue(RUTA_SCRIPT.is_file(), "%s no existe" % RUTA_SCRIPT)

    def test_script_devuelve_json_valido_sin_variable(self):
        resultado = subprocess.run(
            [sys.executable, str(RUTA_SCRIPT)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        salida = json.loads(resultado.stdout)
        self.assertFalse(salida.get("ok"), salida.get("detalle"))
        self.assertIn("sin conexión", salida.get("detalle", ""))

    def test_script_con_simular_devuelve_ok(self):
        resultado = subprocess.run(
            [sys.executable, str(RUTA_SCRIPT), "--simular"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        salida = json.loads(resultado.stdout)
        self.assertTrue(salida.get("ok"), salida.get("detalle"))
        pasos = salida.get("pasos", {})
        self.assertIn("initialize", pasos)
        self.assertIn("tools/list", pasos)
        self.assertIn("brave_estado", pasos)
        self.assertIn("brave_probar", pasos)
        estado = pasos["brave_estado"]
        self.assertTrue(estado.get("configurada"))

    def test_script_con_consulta_agrega_brave_buscar(self):
        resultado = subprocess.run(
            [sys.executable, str(RUTA_SCRIPT), "--q", "StarSeed OS", "--simular"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        salida = json.loads(resultado.stdout)
        self.assertTrue(salida.get("ok"), salida.get("detalle"))
        pasos = salida.get("pasos", {})
        self.assertIn("brave_buscar", pasos)

    def test_script_contiene_herramientas_brave_en_tools_list(self):
        resultado = subprocess.run(
            [sys.executable, str(RUTA_SCRIPT), "--simular"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        salida = json.loads(resultado.stdout)
        herramientas = salida.get("pasos", {}).get("tools/list", [])
        self.assertIn("brave_estado", herramientas)
        self.assertIn("brave_probar", herramientas)
        self.assertIn("brave_buscar", herramientas)

    def test_script_devuelve_inicializacion_correcta(self):
        resultado = subprocess.run(
            [sys.executable, str(RUTA_SCRIPT), "--simular"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        salida = json.loads(resultado.stdout)
        self.assertEqual(
            salida.get("pasos", {}).get("initialize"), "starseed-director"
        )


if __name__ == "__main__":
    unittest.main()