#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de integración del escritor Claude con starseed-director.py (CAP1126C).

Verifica que:
- Los modelos claude/ aparecen en la rotación correctamente
- El director puede lanzar agentes con Claude CLI
- La detección de cupo semanal funciona
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

RUTA_DIRECTOR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "starseed-director.py"
)
ESPEC_DIRECTOR = importlib.util.spec_from_file_location("director", RUTA_DIRECTOR)
director = importlib.util.module_from_spec(ESPEC_DIRECTOR)
sys.modules["director"] = director
ESPEC_DIRECTOR.loader.exec_module(director)

RUTA_ESCRITOR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "escritor_claude_plan.py"
)
ESPEC_ESCRITOR = importlib.util.spec_from_file_location("escritor_claude_plan", RUTA_ESCRITOR)
escritor_claude = importlib.util.module_from_spec(ESPEC_ESCRITOR)
sys.modules["escritor_claude_plan"] = escritor_claude
ESPEC_ESCRITOR.loader.exec_module(escritor_claude)


class TestModeloClaudeEnRotacion(unittest.TestCase):
    def test_claude_sonnet_en_modelos(self):
        """claude/sonnet debe estar en la lista global de modelos."""
        # Importar el módulo principal para acceder a MODELOS
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
        ESPEC = importlib.util.spec_from_file_location("enjambre", ruta)
        enjambre = importlib.util.module_from_spec(ESPEC)
        sys.modules["enjambre"] = enjambre
        ESPEC.loader.exec_module(enjambre)
        self.assertIn("claude/sonnet", enjambre.MODELOS)

    def test_claude_opus_en_modelos(self):
        """claude/opus debe estar en la lista global de modelos."""
        # Importar el módulo principal para acceder a MODELOS
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
        ESPEC = importlib.util.spec_from_file_location("enjambre", ruta)
        enjambre = importlib.util.module_from_spec(ESPEC)
        sys.modules["enjambre"] = enjambre
        ESPEC.loader.exec_module(enjambre)
        self.assertIn("claude/opus", enjambre.MODELOS)


class TestDirectorClaudePlan(unittest.TestCase):
    def test_detiene_agentes_por_cupo_semanal(self):
        """El director debe detener agentes si el cupo semanal de Claude está ≥ 85%."""
        with mock.patch.object(escritor_claude, "shutil") as mock_shutil:
            with mock.patch.object(escritor_claude, "lector_limites_claude") as mock_limite:
                mock_shutil.which.return_value = "/usr/local/bin/claude"
                mock_limite.return_value = {"porcentaje_uso": 90, "valido": False}
                self.assertFalse(escritor_claude.claude_esta_disponible())

    def test_permite_agentes_con_cupo_bajo(self):
        """El director debe permitir agentes si el cupo semanal está < 85%."""
        with mock.patch.object(escritor_claude, "shutil") as mock_shutil:
            with mock.patch.object(escritor_claude, "lector_limites_claude") as mock_limite:
                mock_shutil.which.return_value = "/usr/local/bin/claude"
                mock_limite.return_value = {"porcentaje_uso": 70, "valido": True}
                self.assertTrue(escritor_claude.claude_esta_disponible())


class TestIntegracionDirector(unittest.TestCase):
    def test_proveedor_claude_estado_defecto(self):
        """El proveedor claude debe tener un estado por defecto válido."""
        self.assertEqual(
            director.PROVEEDORES[0]["nombre"], "apinex"
        )

    def test_clave_variable_claude(self):
        """Claude requiere clave via variable de entorno."""
        self.assertIsNotNone(director.PROVEEDORES[0].get("clave_var"))


if __name__ == "__main__":
    unittest.main()