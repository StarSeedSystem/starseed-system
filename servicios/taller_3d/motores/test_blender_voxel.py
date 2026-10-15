#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del motor Blender Voxel (WT1011B) — SIN red ni GPU: se simula Blender.

Ejecutar: python3 -m unittest motores.test_blender_voxel -v
"""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import blender_voxel as bv


class DisponibleTest(unittest.TestCase):
    def test_disponible_true(self):
        """Test when Blender is available."""
        with mock.patch('subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "Blender 4.2.0\n"
            self.assertTrue(bv.disponible())

    def test_disponible_false(self):
        """Test when Blender is not available."""
        with mock.patch('subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            self.assertFalse(bv.disponible())


class RemallarVoxelTest(unittest.TestCase):
    def setUp(self):
        # We'll mock the temporary file and subprocess.run in each test
        pass

    @mock.patch('blender_voxel.disponible')
    @mock.patch('subprocess.run')
    @mock.patch('tempfile.NamedTemporaryFile')
    def test_remallar_voxel_success(self, mock_tempfile, mock_subprocess_run, mock_disponible):
        """Test successful voxel remeshing."""
        mock_disponible.return_value = True
        
        # Mock temporary file
        mock_temp_file = mock.MagicMock()
        temp_file_path = "/tmp/test_script.py"
        mock_temp_file.name = temp_file_path
        mock_temp_file.__enter__.return_value = mock_temp_file
        mock_tempfile.return_value = mock_temp_file
        
        # Mock subprocess run to return different values based on arguments
        def mock_subprocess_run_side(*args, **kwargs):
            if not args:
                # This shouldn't happen, but return a default
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
            
            first_arg = args[0]
            if first_arg == ["blender", "-b", "-P", temp_file_path]:
                # Mock for the actual Blender call
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = "INFO: Volumen estimado: 1.0, Tamaño de vóxel calculado: 0.1\nSUCCESS: Remallado por vóxeles completado"
                mock_result.stderr = ""
                return mock_result
            else:
                # For any other call, return a default (should not happen)
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
        
        mock_subprocess_run.side_effect = mock_subprocess_run_side
        
        # Mock os.path.exists to return True for the output GLB
        with mock.patch('os.path.exists') as mock_exists:
            mock_exists.return_value = True
            
            result = bv.remallar_voxel("input.glb", 1000, {"textura": False, "destino": "avatar"})
            
            self.assertTrue(result["ok"])
            self.assertIsNotNone(result["glb"])
            self.assertEqual(result["procedencia"], "blender-voxel")
            self.assertIsNone(result["fallo"])
            self.assertGreaterEqual(result["segundos"], 0)
            self.assertGreaterEqual(result["pico_memoria_gb"], 0)

    @mock.patch('blender_voxel.disponible')
    @mock.patch('subprocess.run')
    @mock.patch('tempfile.NamedTemporaryFile')
    def test_remallar_voxel_blender_error(self, mock_tempfile, mock_subprocess_run, mock_disponible):
        """Test when Blender returns an error."""
        mock_disponible.return_value = True
        
        # Mock temporary file
        mock_temp_file = mock.MagicMock()
        temp_file_path = "/tmp/test_script.py"
        mock_temp_file.name = temp_file_path
        mock_temp_file.__enter__.return_value = mock_temp_file
        mock_tempfile.return_value = mock_temp_file
        
        # Mock subprocess run to return different values based on arguments
        def mock_subprocess_run_side(*args, **kwargs):
            if not args:
                # This shouldn't happen, but return a default
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
            
            first_arg = args[0]
            if first_arg == ["blender", "-b", "-P", temp_file_path]:
                # Mock for the actual Blender call
                mock_result = mock.MagicMock()
                mock_result.returncode = 1
                mock_result.stdout = ""
                mock_result.stderr = "Error: something went wrong"
                return mock_result
            else:
                # For any other call, return a default (should not happen)
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
        
        mock_subprocess_run.side_effect = mock_subprocess_run_side
        
        result = bv.remallar_voxel("input.glb", 1000, {"textura": False})
        
        self.assertFalse(result["ok"])
        self.assertIsNone(result["glb"])
        self.assertEqual(result["procedencia"], "blender-voxel")
        self.assertIn("Blender falló", result["fallo"])
        self.assertGreaterEqual(result["segundos"], 0)
        self.assertEqual(result["pico_memoria_gb"], 0)

    @mock.patch('subprocess.run')
    @mock.patch('tempfile.NamedTemporaryFile')
    def test_remallar_voxel_timeout(self, mock_tempfile, mock_subprocess_run):
        """Test when Blender execution times out."""
        
        # Mock temporary file
        mock_temp_file = mock.MagicMock()
        temp_file_path = "/tmp/test_script.py"
        mock_temp_file.name = temp_file_path
        mock_temp_file.__enter__.return_value = mock_temp_file
        mock_tempfile.return_value = mock_temp_file
        
        # Mock subprocess run to return success for version check and raise TimeoutExpired for Blender call
        def mock_subprocess_run_side(*args, **kwargs):
            if not args:
                # This shouldn't happen, but return a default
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
            
            first_arg = args[0]
            if first_arg == ["blender", "--version"]:
                # Mock for version check
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = "Blender 4.2.0\n"
                mock_result.stderr = ""
                return mock_result
            elif first_arg == ["blender", "-b", "-P", temp_file_path]:
                # Raise TimeoutExpired for the Blender call
                raise subprocess.TimeoutExpired(
                    ["blender", "-b", "-P", temp_file_path], 300
                )
            else:
                # For any other call, return a default (should not happen)
                mock_result = mock.MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                return mock_result
        
        mock_subprocess_run.side_effect = mock_subprocess_run_side
        
        result = bv.remallar_voxel("input.glb", 1000, {"textura": False})
        
        self.assertFalse(result["ok"])
        self.assertIsNone(result["glb"])
        self.assertEqual(result["procedencia"], "blender-voxel")
        self.assertEqual(result["fallo"], "Timeout ejecutando Blender")
        self.assertGreaterEqual(result["segundos"], 0)
        self.assertEqual(result["pico_memoria_gb"], 0)


if __name__ == "__main__":
    unittest.main()