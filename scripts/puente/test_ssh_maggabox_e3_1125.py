import unittest
import sys
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

# Añadir el directorio scripts/puente al path para poder importar los módulos
sys.path.append(str(Path(__file__).resolve().parent))

class TestSSHMaggabox(unittest.TestCase):
    @patch('subprocess.run')
    def test_captura_aparatos_ssh_options(self, mock_run):
        import captura_aparatos
        # Forzar que la clave y hosts existan para que no falle antes de llamar a ssh
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        
        # Simulamos una llamada que use _ssh
        captura_aparatos._ssh("test-command")
        
        # Verificamos la llamada a subprocess.run
        args = mock_run.call_args[0][0]
        self.assertEqual(args[0], "ssh")
        self.assertIn("AddressFamily=inet", args)
        self.assertIn("IdentitiesOnly=yes", args)
        self.assertIn("ConnectTimeout=8", args)

    @patch('subprocess.run')
    def test_pruebas_malla_ssh_options(self, mock_run):
        import pruebas_malla
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        
        pruebas_malla._ejecutar_ssh("test-command")
        
        args = mock_run.call_args[0][0]
        self.assertEqual(args[0], "ssh")
        self.assertIn("AddressFamily=inet", args)
        self.assertIn("IdentitiesOnly=yes", args)
        self.assertIn("ConnectTimeout=8", args)

if __name__ == "__main__":
    unittest.main()
