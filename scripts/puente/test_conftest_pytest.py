"""Pruebas de scripts/puente/conftest.py (COL1012Md-d1).

Sin tocar `sys.path` a mano (esa es la gracia): si el conftest no hiciera su trabajo, esta prueba SÍ se
recogería (solo importa la biblioteca estándar), pero fallarían sus aserciones: `test_carpeta_del_puente_en_sys_path`
y `test_hermanos_se_importan_por_nombre_simple`. Sirve igual con `python3 -m unittest discover -s scripts/puente`
(ahí esas dos se saltan: unittest ya mete la carpeta de inicio y el conftest no interviene).
"""
import importlib
import importlib.util
import os
import subprocess
import sys
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(CARPETA, "..", ".."))


# El conftest solo lo lee pytest; unittest ya añade la carpeta de inicio con `discover -s scripts/puente`.
BAJO_PYTEST = "pytest" in sys.modules


@unittest.skipUnless(BAJO_PYTEST, "el conftest solo actúa bajo pytest")
class TestConftestPuente(unittest.TestCase):
    def test_carpeta_del_puente_en_sys_path(self):
        self.assertIn(CARPETA, sys.path)

    def test_hermanos_se_importan_por_nombre_simple(self):
        # Los dos que más veces fallaron en la recogida de pytest: se importan unos a otros por nombre simple.
        for nombre in ("produccion_puentes", "colmena_logica"):
            with self.subTest(modulo=nombre):
                self.assertIsNotNone(importlib.import_module(nombre))


class TestRecogidaConPytest(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec("pytest"), "pytest no está instalado en este python")
    def test_pytest_recoge_desde_la_raiz_un_test_sin_sys_path_insert(self):
        """El caso real que bloqueó a la nube: `pytest scripts/puente/test_produccion_puentes.py` desde la raíz.
        Ese archivo hace `import produccion_puentes` sin `sys.path.insert`; sin conftest moría en la recogida."""
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider",
             os.path.join("scripts", "puente", "test_produccion_puentes.py")],
            cwd=RAIZ, capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("ModuleNotFoundError", r.stdout + r.stderr)
        self.assertIn("test_produccion_puentes.py", r.stdout)


if __name__ == "__main__":
    unittest.main()
