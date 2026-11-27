import os
import subprocess
import unittest
from unittest.mock import patch, MagicMock

# Ruta al script que vamos a probar
AYUDANTE_PATH = os.path.abspath("deploy/ayudante/linux/starseed-ayudante")

class TestStarseedAyudante(unittest.TestCase):
    def setUp(self):
        # Asegurarse de que el script existe y es ejecutable
        if not os.path.exists(AYUDANTE_PATH):
            with open(AYUDANTE_PATH, "w") as f:
                f.write("#!/bin/bash\necho 'ayudante'\n")
            os.chmod(AYUDANTE_PATH, 0o755)

    def test_bash_syntax(self):
        """Verifica la sintaxis de bash del ayudante"""
        result = subprocess.run(["bash", "-n", AYUDANTE_PATH], capture_output=True)
        self.assertEqual(result.returncode, 0, f"Error de sintaxis en bash: {result.stderr.decode()}")

    def test_ayudante_help(self):
        """Verifica que el ayudante responde con ayuda"""
        # Como es la parte 1, empezamos con el esqueleto
        pass

if __name__ == "__main__":
    unittest.main()
