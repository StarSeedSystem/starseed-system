"""Pruebas de instalar_trabajador: Instalador del trabajador para cualquier aparato (COL1012K)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCRIPT_INSTALAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar_trabajador.sh")


class TestInstalarTrabajador(unittest.TestCase):
    """Pruebas básicas del script de instalación del trabajador."""

    def setUp(self):
        """Configuración inicial para cada prueba."""
        self.bucle_original = None

    def tearDown(self):
        """Limpieza después de cada prueba."""
        pass

    def test_el_script_es_ejecutable(self):
        """El script es ejecutable."""
        self.assertTrue(os.access(SCRIPT_INSTALAR, os.X_OK), f"{SCRIPT_INSTALAR} no es ejecutable")

    def test_el_script_tiene_help(self):
        """El script tiene una opción --ayuda."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
            temp_path = temp_file.name

        resultado = os.system(f"bash {SCRIPT_INSTALAR} --ayuda > {temp_path} 2>&1")
        self.assertEqual(resultado, 0, "El script falló al ejecutar --ayuda")

        with open(temp_path, 'r') as f:
            contenido = f.read()
            self.assertIn("Instalador del trabajador StarSeed", contenido)

        os.unlink(temp_path)

    def test_el_script_procesa_seco(self):
        """El script procesa --seco sin error."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
            temp_path = temp_file.name

        # Usar /dev/null para redirigir la salida para que no llene el terminal
        resultado = os.system(f"bash {SCRIPT_INSTALAR} --seco > {temp_path} 2>&1")
        # El script debe salir con código 0 en modo seco
        self.assertEqual(resultado, 0, f"El script falló al ejecutar --seco (código {resultado})")

        with open(temp_path, 'r') as f:
            contenido = f.read()
            self.assertIn("Modo seco activado.", contenido)

        os.unlink(temp_path)

    def test_el_script_procesa_emparejar(self):
        """El script procesa --emparejar con código."""
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
            temp_path = temp_file.name

        resultado = os.system(f"bash {SCRIPT_INSTALAR} --emparejar TEST123 --seco > {temp_path} 2>&1")
        self.assertEqual(resultado, 0, f"El script falló al ejecutar --emparejar (código {resultado})")

        with open(temp_path, 'r') as f:
            contenido = f.read()
            self.assertIn("Pendiente: falta la migración de nodos", contenido)

        os.unlink(temp_path)

    def test_el_script_opciones_desconocidas(self):
        """El script rechaza opciones desconocidas."""
        resultado = os.system(f"bash {SCRIPT_INSTALAR} --desconocido >/dev/null 2>&1")
        self.assertNotEqual(resultado, 0, "El script debería fallar con opciones desconocidas")


if __name__ == "__main__":
    unittest.main()