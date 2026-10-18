import unittest
from unittest.mock import patch, MagicMock
import subprocess
import os

# We assume the functions to test are in a module named `blender_voxel` in the same directory
# However, since we don't have the implementation, we will try to import it.
# If the module is not available, we will skip the tests or define dummy functions for the sake of the test structure.
# But note: the task is to add tests, so we assume the implementation exists.

# Try to import the actual module
try:
    from motores.blender_voxel import disponible, remallar_voxel
except ImportError:
    # If we cannot import, we define dummy functions so that the test can be written and run (but will fail)
    # This is just to allow the test to be written. In reality, we expect the module to exist.
    def disponible():
        return False

    def remallar_voxel(input_path, voxel_size, options):
        return {"ok": False, "glb": None, "procedencia": "blender-voxel", "fallo": "Not implemented", "segundos": 0, "pico_memoria_gb": 0}

class TestBlenderVoxel(unittest.TestCase):

    def test_disponible_true(self):
        """Test when Blender is available."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "Blender 4.2.0\n"
            self.assertTrue(disponible())

    def test_disponible_false(self):
        """Test when Blender is not available."""
        with patch('subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            self.assertFalse(disponible())

    def test_remallar_voxel_success(self):
        """Test successful voxel remeshing."""
        with patch('motores.blender_voxel.disponible') as mock_disponible, \
             patch('subprocess.run') as mock_subprocess_run, \
             patch('tempfile.NamedTemporaryFile') as mock_tempfile, \
             patch('os.path.exists') as mock_exists:

            mock_disponible.return_value = True

            # Mock temporary file
            mock_temp_file = MagicMock()
            temp_file_path = "/tmp/test_script.py"
            mock_temp_file.name = temp_file_path
            mock_temp_file.__enter__.return_value = mock_temp_file
            mock_tempfile.return_value = mock_temp_file

            # Mock subprocess run to return different values based on arguments
            def mock_subprocess_run_side(*args, **kwargs):
                if not args:
                    # This shouldn't happen, but return a default
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

                first_arg = args[0]
                if first_arg == ["blender", "-b", "-P", temp_file_path]:
                    # Mock for the actual Blender call
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = "INFO: Volumen estimado: 1.0, Tamaño de vóxel calculado: 0.1\nSUCCESS: Remallado por vóxeles completado"
                    mock_result.stderr = ""
                    return mock_result
                else:
                    # For any other call, return a default (should not happen)
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

            mock_subprocess_run.side_effect = mock_subprocess_run_side

            # Mock os.path.exists to return True for the output GLB
            mock_exists.return_value = True

            result = remallar_voxel("input.glb", 1000, {"textura": False, "destino": "avatar"})

            self.assertTrue(result["ok"])
            self.assertIsNotNone(result["glb"])
            self.assertEqual(result["procedencia"], "blender-voxel")
            self.assertIsNone(result["fallo"])
            self.assertGreaterEqual(result["segundos"], 0)
            self.assertGreaterEqual(result["pico_memoria_gb"], 0)

    def test_remallar_voxel_blender_error(self):
        """Test when Blender returns an error."""
        with patch('motores.blender_voxel.disponible') as mock_disponible, \
             patch('subprocess.run') as mock_subprocess_run, \
             patch('tempfile.NamedTemporaryFile') as mock_tempfile:

            mock_disponible.return_value = True

            # Mock temporary file
            mock_temp_file = MagicMock()
            temp_file_path = "/tmp/test_script.py"
            mock_temp_file.name = temp_file_path
            mock_temp_file.__enter__.return_value = mock_temp_file
            mock_tempfile.return_value = mock_temp_file

            # Mock subprocess run to return different values based on arguments
            def mock_subprocess_run_side(*args, **kwargs):
                if not args:
                    # This shouldn't happen, but return a default
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

                first_arg = args[0]
                if first_arg == ["blender", "-b", "-P", temp_file_path]:
                    # Mock for the actual Blender call
                    mock_result = MagicMock()
                    mock_result.returncode = 1
                    mock_result.stdout = ""
                    mock_result.stderr = "Error: something went wrong"
                    return mock_result
                else:
                    # For any other call, return a default (should not happen)
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

            mock_subprocess_run.side_effect = mock_subprocess_run_side

            result = remallar_voxel("input.glb", 1000, {"textura": False})

            self.assertFalse(result["ok"])
            self.assertIsNone(result["glb"])
            self.assertEqual(result["procedencia"], "blender-voxel")
            self.assertIn("Blender falló", result["fallo"])
            self.assertGreaterEqual(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0)

    def test_remallar_voxel_timeout(self):
        """Test when Blender execution times out."""
        with patch('subprocess.run') as mock_subprocess_run, \
             patch('tempfile.NamedTemporaryFile') as mock_tempfile:

            # Mock temporary file
            mock_temp_file = MagicMock()
            temp_file_path = "/tmp/test_script.py"
            mock_temp_file.name = temp_file_path
            mock_temp_file.__enter__.return_value = mock_temp_file
            mock_tempfile.return_value = mock_temp_file

            # Mock subprocess run to return success for version check and raise TimeoutExpired for Blender call
            def mock_subprocess_run_side(*args, **kwargs):
                if not args:
                    # This shouldn't happen, but return a default
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

                first_arg = args[0]
                if first_arg == ["blender", "--version"]:
                    # Mock for version check
                    mock_result = MagicMock()
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
                    mock_result = MagicMock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    return mock_result

            mock_subprocess_run.side_effect = mock_subprocess_run_side

            result = remallar_voxel("input.glb", 1000, {"textura": False})

            self.assertFalse(result["ok"])
            self.assertIsNone(result["glb"])
            self.assertEqual(result["procedencia"], "blender-voxel")
            self.assertEqual(result["fallo"], "Timeout ejecutando Blender")
            self.assertGreaterEqual(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0)

if __name__ == '__main__':
    unittest.main()