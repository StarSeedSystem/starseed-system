import unittest
from unittest.mock import patch, MagicMock
import os
import subprocess

try:
    import pixal3d
except ImportError:
    pixal3d = None

class TestPixal3D(unittest.TestCase):

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_disponible_no_nvidia_smi(self):
        """Test disponible when nvidia-smi is not found."""
        with patch('subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            avail, motivo = pixal3d.disponible()
            self.assertFalse(avail)
            self.assertIn("nvidia-smi not found", motivo)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_disponible_nvidia_smi_failure(self):
        """Test disponible cuando nvidia-smi falla."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="some error")
            avail, motivo = pixal3d.disponible()
            self.assertFalse(avail)
            self.assertIn("nvidia-smi failed", motivo)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_disponible_insufficient_vram(self):
        """Test disponible cuando la VRAM es menor a 16 GB."""
        with patch('subprocess.run') as mock_run:
            # Mock nvidia-smi output with 8 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""\n""")
            avail, motivo = pixal3d.disponible()
            self.assertFalse(avail)
            self.assertIn("insufficient VRAM", motivo.lower())

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_disponible_sufficient_vram_missing_inference(self):
        """Test disponible cuando la VRAM es suficiente pero falta el script de inferencia."""
        with patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=False), \
             patch('os.path.isdir', return_value=True), \
             patch('os.listdir', return_value=['file1']):
            # Mock nvidia-smi output with 16 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""\n""")
            avail, motivo = pixal3d.disponible()
            self.assertFalse(avail)
            self.assertIn("inference script missing", motivo.lower())

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_disponible_sufficient_vram_missing_checkpoints(self):
        """Test disponible cuando la VRAM es suficiente pero faltan los checkpoints."""
        with patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=True), \
             patch('os.path.isdir', return_value=True), \
             patch('os.listdir', return_value=[]):
            # Mock nvidia-smi output with 16 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""\n""")
            avail, motivo = pixal3d.disponible()
            self.assertFalse(avail)
            self.assertIn("checkpoints missing", motivo.lower())

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_disponible_success(self):
        """Test disponible cuando todas las verificaciones pasan."""
        try:
            import torch
        except ImportError:
            self.skipTest("torch no instalado")
        with patch('subprocess.run') as mock_run, \
             patch('os.path.isfile', return_value=True), \
             patch('os.path.isdir', return_value=True), \
             patch('os.listdir', return_value=['file1']), \
             patch('torch.cuda.is_available', return_value=True):
            # Mock nvidia-smi output with 16 GB VRAM
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="""\n""")
            avail, motivo = pixal3d.disponible()
            self.assertTrue(avail)
            self.assertEqual(motivo, "")

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_get_procedencia(self):
        """Test del diccionario de procedencia."""
        prov = pixal3d._get_procedencia()
        self.assertEqual(prov["herramienta"], "pixal3d")
        self.assertEqual(prov["licencia"], "MIT (código y pesos); terceros según su NOTICE")
        self.assertEqual(prov["uso"], "condicionado")
        # Verificar que los campos opcionales no estén presentes
        self.assertNotIn("atribucion", prov)
        self.assertNotIn("regionesExcluidas", prov)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_generar_not_available(self):
        """Test generar cuando el motor no está disponible."""
        with patch('pixal3d.disponible', return_value=(False, "test reason")):
            result = pixal3d.generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "no-instalado")
            self.assertEqual(result["segundos"], 0.0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
    def test_generar_timeout(self):
        """Test generar cuando el subprocess se agota el tiempo de espera."""
        with patch('pixal3d.disponible', return_value=(True, "")), \
             patch('subprocess.run') as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="test", timeout=3600)
            result = pixal3d.generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "lento")
            self.assertEqual(result["segundos"], 3600.0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
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
            result = pixal3d.generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "sin-memoria")
            self.assertGreater(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
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
            result = pixal3d.generar("input.png", "output_dir", 1024, False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["fallo"], "error")
            self.assertGreater(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)

    @unittest.skipIf(pixal3d is None, "pixal3d module not available")
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
            result = pixal3d.generar("input.png", "output_dir", 1024, False)
            self.assertTrue(result["ok"])
            self.assertEqual(result["glb"], os.path.join("output_dir", "output.glb"))
            self.assertIsNone(result["fallo"])
            self.assertGreater(result["segundos"], 0)
            self.assertEqual(result["pico_memoria_gb"], 0.0)
            self.assertEqual(result["procedencia"], pixal3d._get_procedencia())