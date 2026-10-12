#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para el motor de remallado por vóxeles de Blender (sin ventana)."""

import unittest
from unittest.mock import patch, MagicMock
import subprocess
import os
import tempfile

# Importar el módulo a probar
try:
    import blender_voxel
except ImportError:
    # Si no existe el módulo, definimos funciones mock para que las pruebas compile
    # Esto es temporal; en la implementación real, se eliminará este bloque
    def disponible():
        return False

    def remallar_voxel(input_path, voxel_count, options):
        return {
            "ok": False,
            "glb": None,
            "procedencia": "blender-voxel",
            "fallo": "Módulo no implementado",
            "segundos": 0,
            "pico_memoria_gb": 0
        }

    # Creamos un módulo mock
    import sys
    blender_voxel = type('blender_voxel', (), {
        'disponible': disponible,
        'remallar_voxel': remallar_voxel
    })()


class TestBlenderVoxel(unittest.TestCase):
    @patch('subprocess.run')
    def test_disponible_true(self, mock_run):
        """Prueba cuando Blender está disponible."""
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "Blender 4.2.0\n"
        self.assertTrue(blender_voxel.disponible())

    @patch('subprocess.run')
    def test_disponible_false(self, mock_run):
        """Prueba cuando Blender no está disponible."""
        mock_run.side_effect = FileNotFoundError()
        self.assertFalse(blender_voxel.disponible())

    @patch('subprocess.run')
    @patch('tempfile.NamedTemporaryFile')
    @patch('os.path.exists')
    def test_remallar_voxel_success(self, mock_exists, mock_tempfile, mock_subprocess_run):
        """Prueba de remallado por vóxeles exitoso."""
        # Simular que disponible retorna True
        with patch.object(blender_voxel, 'disponible', return_value=True):
            # Simular archivo temporal
            mock_temp_file = MagicMock()
            temp_file_path = "/tmp/test_script.py"
            mock_temp_file.name = temp_file_path
            mock_temp_file.__enter__.return_value = mock_temp_file
            mock_tempfile.return_value = mock_temp_file

            # Simular que subprocess.run retorna diferentes valores según los argumentos
            def mock_subprocess_run_side(*args, **kwargs):
                if not args:
                    # Esto no debería ocurrir, pero retornar un valor por defecto
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result
                first_arg = args[0]
                if first_arg == ["blender", "-b", "-P", temp_file_path]:
                    # Simular la llamada real a Blender
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = "INFO: Volumen estimado: 1.0, Tamaño de vóxel calculado: 0.1\nSUCCESS: Remallado por vóxeles completado"
                    mock_result.stderr = ""
                    return mock_result
                else:
                    # Para cualquier otra llamada, retornar un valor por defecto (no debería ocurrir)
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

            mock_subprocess_run.side_effect = mock_subprocess_run_side

            # Simular que os.path.exists retorna True para el output GLB
            mock_exists.return_value = True

            result = blender_voxel.remallar_voxel("input.glb", 1000, {"textura": False, "destino": "avatar"})

            self.assertTrue(result["ok"])
            self.assertIsNotNone(result["glb"])
            self.assertEqual(result["procedencia"], "blender-voxel")
            self.assertIsNone(result["fallo"])
            self.assertGreaterEqual(result["segundos"], 0)
            self.assertGreaterEqual(result["pico_memoria_gb"], 0)

    @patch('subprocess.run')
    @patch('tempfile.NamedTemporaryFile')
    @patch('os.path.exists')
    def test_remallar_voxel_blender_error(self, mock_exists, mock_tempfile, mock_subprocess_run):
        """Prueba cuando Blender devuelve un error."""
        # Simular que disponible retorna True
        with patch.object(blender_voxel, 'disponible', return_value=True):
            # Simular archivo temporal
            mock_temp_file = MagicMock()
            temp_file_path = "/tmp/test_script.py"
            mock_temp_file.name = temp_file_path
            mock_temp_file.__enter__.return_value = mock_temp_file
            mock_tempfile.return_value = mock_temp_file

            # Simular que subprocess.run retorna diferentes valores según los argumentos
            def mock_subprocess_run_side(*args, **kwargs):
                if not args:
                    # Esto no debería ocurrir, pero retornar un valor por defecto
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result
                first_arg = args[0]
                if first_arg == ["blender", "-b", "-P", temp_file_path]:
                    # Simular la llamada real a Blender que devuelve un error
                    mock_result = MagicMock()
                    mock_result.returncode = 1
                    mock_result.stdout = ""
                    mock_result.stderr = "Error: algo salió mal"
                    return mock_result
                else:
                    # Para cualquier otra llamada, retornar un valor por defecto (no debería ocurrir)
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

            mock_subprocess_run.side_effect = mock_subprocess_run_side

            result = blender_voxel.remallar_voxel("input.glb", 1000, {"textura": False})

            self.assertFalse(result["ok"])
            self.assertIsNone(result["glb"])
            self.assertEqual(result["procedencia"], "blender-voxel")
            self.assertIn("Blender falló", result["fallo"])
            self.assertGreaterEqual(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0)

    @patch('subprocess.run')
    @patch('tempfile.NamedTemporaryFile')
    def test_remallar_voxel_timeout(self, mock_tempfile, mock_subprocess_run):
        """Prueba cuando la ejecución de Blender agota el tiempo de espera."""
        # Simular archivo temporal
        mock_temp_file = MagicMock()
        temp_file_path = "/tmp/test_script.py"
        mock_temp_file.name = temp_file_path
        mock_temp_file.__enter__.return_value = mock_temp_file
        mock_tempfile.return_value = mock_temp_file

        # Simular que subprocess.run retorna éxito para la verificación de versión y agota el tiempo de espera para la llamada a Blender
        def mock_subprocess_run_side(*args, **kwargs):
            if not args:
                # Esto no debería ocurrir, pero retornar un valor por defecto
                mock_result = MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
            first_arg = args[0]
            if first_arg == ["blender", "--version"]:
                # Simular la verificación de versión
                mock_result = MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = "Blender 4.2.0\n"
                mock_result.stderr = ""
                return mock_result
            elif first_arg == ["blender", "-b", "-P", temp_file_path]:
                # Simular que la llamada a Blender agota el tiempo de espera
                raise subprocess.TimeoutExpired(
                    ["blender", "-b", "-P", temp_file_path], 300
                )
            else:
                # Para cualquier otra llamada, retornar un valor por defecto (no debería ocurrir)
                mock_result = MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result

        mock_subprocess_run.side_effect = mock_subprocess_run_side

        result = blender_voxel.remallar_voxel("input.glb", 1000, {"textura": False})

        self.assertFalse(result["ok"])
        self.assertIsNone(result["glb"])
        self.assertEqual(result["procedencia"], "blender-voxel")
        self.assertEqual(result["fallo"], "Timeout ejecutando Blender")
        self.assertGreaterEqual(result["segundos"], 0)
        self.assertEqual(result["pico_memoria_gb"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)