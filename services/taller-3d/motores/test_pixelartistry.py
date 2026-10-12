import unittest
from unittest.mock import MagicMock, patch

# We will try to import the pixelartistry module.
# If it doesn't exist, we'll catch the ImportError and skip the tests.
try:
    import pixelartistry
except ImportError:
    pixelartistry = None

class TestPixelArtistry(unittest.TestCase):

    @unittest.skipIf(pixelartistry is None, "pixelartistry module not available")
    def test_disponible_false_en_linux(self):
        """On Linux, disponible should return False because it requires Windows."""
        self.assertFalse(pixelartistry.disponible())

    @unittest.skipIf(pixelartistry is None, "pixelartistry module not available")
    @patch('pixelartistry.urlopen')
    @patch('pixelartistry.subprocess.run')
    @patch('pixelartistry.platform.system')
    def test_disponible_true_when_conditions_met(self, mock_platform, mock_subprocess, mock_urlopen):
        """When mocked to Windows, with nvidia-smi and ComfyUI responding, disponible returns True."""
        # Mock platform to return Windows
        mock_platform.return_value = 'Windows'
        # Mock nvidia-smi to succeed
        mock_subprocess.return_value = MagicMock()
        # Mock ComfyUI API to respond
        mock_urlopen.return_value = MagicMock()
        
        self.assertTrue(pixelartistry.disponible())

    @unittest.skipIf(pixelartistry is None, "pixelartistry module not available")
    def test_generar_not_available(self):
        """Cuando el motor no está disponible, generar debería devolver un dict de error."""
        result = pixelartistry.generar("/fake/path/image.png", 512)
        self.assertFalse(result["ok"])
        self.assertEqual(result["glb"], b"")
        self.assertIsInstance(result["procedencia"], dict)
        self.assertIsNotNone(result["fallo"])
        self.assertIn("no disponible", result["fallo"].lower())
        self.assertGreaterEqual(result["segundos"], 0.0)
        self.assertGreaterEqual(result["pico_memoria_gb"], 0.0)

    @unittest.skipIf(pixelartistry is None, "pixelartistry module not available")
    @patch('pixelartistry.time')
    @patch('pixelartistry.disponible')
    def test_generar_available_simulated(self, mock_disponible, mock_time):
        """When motor is available (mocked), generar should return a successful simulation."""
        # Mock disponible to return True
        mock_disponible.return_value = True
        # Mock time to control the elapsed time
        mock_time.side_effect = [1000.0, 1000.1]  # start and end times
        
        result = pixelartistry.generar("/fake/path/image.png", 1024)
        
        self.assertTrue(result["ok"])
        self.assertIsInstance(result["glb"], bytes)
        self.assertGreater(len(result["glb"]), 0)
        self.assertIsInstance(result["procedencia"], dict)
        self.assertIn("herramienta", result["procedencia"])
        self.assertEqual(result["procedencia"]["herramienta"], "pixelartistry")
        self.assertIsNone(result["fallo"])
        self.assertAlmostEqual(result["segundos"], 0.1, places=2)
        self.assertGreater(result["pico_memoria_gb"], 0.0)

if __name__ == '__main__':
    unittest.main()