"""Tests para servir_transcodificar.py."""

import unittest
from unittest.mock import patch, MagicMock

from scripts.puente.servir_transcodificar import ordenes_escalera, transcodificar


class TestServirTranscodificar(unittest.TestCase):
    """Tests para las funciones de transcodificación."""

    def test_ordenes_escalera_basic(self):
        """Test básico de ordenes_escalera."""
        entrada = "input.mp4"
        salida_dir = "salida"
        alturas = (1080, 720, 480)
        cmd = ordenes_escalera(entrada, salida_dir, alturas)
        self.assertIsInstance(cmd, list)
        self.assertIn("ffmpeg", cmd)
        self.assertIn("-i", cmd)
        self.assertIn(entrada, cmd)
        self.assertIn("-filter_complex", cmd)
        self.assertIn("-map", cmd)
        self.assertIn("-c:v:0", cmd)
        self.assertIn("-c:a", cmd)
        self.assertIn("-var_stream_map", cmd)
        self.assertIn("-master_pl_name", cmd)
        self.assertIn("master.m3u8", cmd)
        self.assertIn("-f", cmd)
        self.assertIn("hls", cmd)
        self.assertIn("-hls_segment_file", cmd)
        self.assertIn(f"{salida_dir}/v%v/%03d.ts", cmd)
        self.assertIn(f"{salida_dir}/%v.m3u8", cmd)

    def test_ordenes_escalera_default_alturas(self):
        """Test con alturas por defecto."""
        entrada = "input.mp4"
        salida_dir = "salida"
        cmd = ordenes_escalera(entrada, salida_dir)
        self.assertIsInstance(cmd, list)
        # Verificar que contiene las alturas por defecto en el filter_complex
        cmd_str = " ".join(cmd)
        self.assertIn("scale=-2:1080", cmd_str)
        self.assertIn("scale=-2:720", cmd_str)
        self.assertIn("scale=-2:480", cmd_str)
        self.assertIn("scale=-2:240", cmd_str)

    def test_transcodificar_ffmpeg_not_found(self):
        """Test cuando ffmpeg no está instalado."""
        with patch("scripts.puente.servir_transcodificar.shutil.which", return_value=None):
            result = transcodificar("input.mp4", "salida")
            self.assertFalse(result)

    def test_transcodificar_success(self):
        """Test de transcodificación exitosa."""
        mock_run = MagicMock()
        mock_run.returncode = 0
        with patch("scripts.puente.servir_transcodificar.shutil.which", return_value="/usr/bin/ffmpeg"):
            with patch("scripts.puente.servir_transcodificar.subprocess.run", mock_run):
                result = transcodificar("input.mp4", "salida")
                self.assertTrue(result)
                mock_run.assert_called_once()
                # Verificar que se pasó una lista de argumentos
                args_passed = mock_run.call_args[0][0]
                self.assertIsInstance(args_passed, list)
                self.assertEqual(args_passed[0], "ffmpeg")

    def test_transcodificar_failure(self):
        """Test de transcodificación fallida (ffmpeg devuelve error)."""
        mock_run = MagicMock()
        mock_run.side_effect = Exception("Error")
        with patch("scripts.puente.servir_transcodificar.shutil.which", return_value="/usr/bin/ffmpeg"):
            with patch("scripts.puente.servir_transcodificar.subprocess.run", mock_run):
                result = transcodificar("input.mp4", "salida")
                self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()