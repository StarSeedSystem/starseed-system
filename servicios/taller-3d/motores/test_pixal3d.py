"""
Tests for the Pixal3D motor.
These tests are designed to run without GPU or network by mocking subprocess calls.
"""

import os
import sys
import json
import subprocess
from unittest.mock import patch, MagicMock
import unittest

# Add the current directory (motores) to the path so we can import the motor
sys.path.insert(0, os.path.dirname(__file__))

import pixal3d
from pixal3d import disponible, generar, _get_procedencia

class TestPixal3D(unittest.TestCase):
    def test_disponible_no_nvidia_smi(self):
        """Test disponible when nvidia-smi is not found."""
        with patch('subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            avail, motivo = disponible()
            self.assertFalse(avail)
            self.assertIn("nvidia-smi not found", motivo)

    def test_disponible_nvidia_smi_failure(self):
        """Test disponible when nvidia-smi fails."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="some error")
            avail, motivo = disponible()
            self.assertFalse(avail)
            self.assertIn("nvidia-smi failed", motivo)

    def test_disponible_insufficient_vram(self):
        """Test disponible when VRAM is less than 16 GB."""
        with patch('subprocess.run') as mock_run:
            # Mock nvidia-smi output with 8 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 550.54.15   Driver Version: 550.54.15   CUDA Version: 12.4     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  NVIDIA GeForce GTX 1080  Off | 00000000:03:00.0 Off |                    0 |
| N/A   30C    P8    9W / 150W |    0MiB / 8192MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
""".strip()
            )
            avail, motivo = disponible()
            self.assertFalse(avail)
            self.assertIn("Insufficient VRAM", motivo)
            # 8192 MiB = 8 GB
            self.assertTrue("8.0" in motivo or "8.1" in motivo or "8.2" in motivo)

    def test_disponible_sufficient_vram_missing_inference(self):
        """Test disponible when VRAM is sufficient but inference script is missing."""
        with patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=False), \
             patch('os.path.isdir', return_value=True), \
             patch('os.listdir', return_value=['file1']):
            # Mock nvidia-smi output with 16 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 550.54.15   Driver Version: 550.54.15   CUDA Version: 12.4     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  NVIDIA GeForce RTX 3090  Off | 00000000:03:00.0 Off |                    0 |
| N/A   30C    P8    9W / 150W |    0MiB / 16384MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
""".strip()
            )
            with patch.dict(os.environ, {}, clear=True):
                avail, motivo = disponible()
                self.assertFalse(avail)
                self.assertIn("Pixal3D inference script not found", motivo)

    def test_disponible_sufficient_vram_missing_checkpoints(self):
        """Test disponible when VRAM is sufficient but checkpoints are missing."""
        with patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=True), \
             patch('os.path.isdir', return_value=True), \
             patch('os.listdir', return_value=[]):
            # Mock nvidia-smi output with 16 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 550.54.15   Driver Version: 550.54.15   CUDA Version: 12.4     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  NVIDIA GeForce RTX 3090  Off | 00000000:03:00.0 Off |                    0 |
| N/A   30C    P8    9W / 150W |    0MiB / 16384MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
""".strip()
            )
            with patch.dict(os.environ, {}, clear=True):
                avail, motivo = disponible()
                self.assertFalse(avail)
                self.assertIn("Pixal3D checkpoints not found or empty", motivo)

    def test_disponible_success(self):
        """Test disponible when all checks pass."""
        try:
            import torch
        except ImportError:
            self.skipTest("torch not installed")
        with patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=True), \
             patch('os.path.isdir', return_value=True), \
             patch('os.listdir', return_value=['file1']), \
             patch('torch.cuda.is_available', return_value=True):
            # Mock nvidia-smi output with 16 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 550.54.15   Driver Version: 550.54.15   CUDA Version: 12.4     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  NVIDIA GeForce RTX 3090  Off | 00000000:03:00.0 Off |                    0 |
| N/A   30C    P8    9W / 150W |    0MiB / 16384MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
""".strip()
            )
            with patch.dict(os.environ, {}, clear=True):
                avail, motivo = disponible()
                self.assertTrue(avail)
                self.assertEqual(motivo, "")

    def test_get_procedencia(self):
        """Test the provenance dictionary."""
        prov = _get_procedencia()
        self.assertEqual(prov["herramienta"], "pixal3d")
        self.assertEqual(prov["licencia"], "MIT (código y pesos); terceros según su NOTICE")
        self.assertEqual(prov["uso"], "condicionado")
        # Check that optional fields are not present
        self.assertNotIn("atribucion", prov)
        self.assertNotIn("regionesExcluidas", prov)

    def test_generar_not_available(self):
        """Test generar cuando el motor no está disponible."""
        with patch('pixal3d.disponible', return_value=(False, "test reason")):
            result = generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "no-instalado")
            self.assertEqual(result["segundos"], 0.0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    def test_generar_timeout(self):
        """Test generar cuando el subprocess se agota el tiempo de espera."""
        with patch('pixal3d.disponible', return_value=(True, "")), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="test", timeout=3600)
            result = generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "lento")
            self.assertEqual(result["segundos"], 3600.0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    def test_generar_cuda_out_of_memory(self):
        """Test generar cuando ocurre CUDA out of memory."""
        with patch('pixal3d.disponible', return_value=(True, "")), \
             patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=True), \
             patch('os.path.getsize', return_value=100):
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="",
                stderr="CUDA out of memory. Tried to allocate 2.00 GiB"
            )
            result = generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "sin-memoria")
            self.assertGreater(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    def test_generar_error(self):
        """Test generar cuando el subprocess devuelve un error."""
        with patch('pixal3d.disponible', return_value=(True, "")), \
             patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=False):
            mock_run.return_value = MagicMock(
                returncode=1,
                stdout="",
                stderr="some error"
            )
            result = generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "error")
            self.assertGreater(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    def test_generar_success(self):
        """Test generar cuando el subprocess tiene éxito."""
        with patch('pixal3d.disponible', return_value=(True, "")), \
             patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=True), \
             patch('os.path.getsize', return_value=100):
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="",
                stderr=""
            )
            result = generar("input.png", "output_dir", 1024, False)
            self.assertTrue(result["ok"])
            self.assertEqual(result["glb"], os.path.join("output_dir", "output.glb"))
            self.assertIsNone(result["fallo"])
            self.assertGreater(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)
            self.assertEqual(result["procedencia"], _get_procedencia())

if __name__ == '__main__':
    unittest.main()