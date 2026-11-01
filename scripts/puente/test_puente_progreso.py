# -*- coding: utf-8 -*-
"""(SUP0111P, 2026-11-01) `puente.py integrada` y `orden` no tiran progreso.json ni las órdenes por una
lectura a medias, y escriben con os.replace."""
import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from unittest import mock

# Por ruta y con otro nombre: con pytest, `import puente` es la carpeta scripts/puente, no puente.py.
_ESPEC = importlib.util.spec_from_file_location(
    "puente_cli_progreso", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
puente = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(puente)


class ProgresoEntero(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.ruta = os.path.join(self.dir, "progreso.json")
        self.cerrojo = os.path.join(self.dir, "cerrojos", "progreso.lock")

    def _escribir(self, texto):
        with open(self.ruta, "w", encoding="utf-8") as f:
            f.write(texto)

    def test_leer_entero(self):
        self.assertEqual({}, puente.leer_json_entero(self.ruta))
        self._escribir('{"A": {"estado": "commit"}}')
        self.assertEqual({"A": {"estado": "commit"}}, puente.leer_json_entero(self.ruta))
        self._escribir('{"A": {"estado": "com')
        with mock.patch.object(puente.time, "sleep"):
            self.assertIsNone(puente.leer_json_entero(self.ruta, intentos=3))

    def test_con_el_archivo_a_medias_no_borra_las_demas(self):
        self._escribir('{"A": {"estado": "commit"}, "B": {"est')
        with mock.patch.object(puente.time, "sleep"):
            self.assertIsNone(puente.marcar_en_progreso(self.ruta, ["X1"], {"estado": "commit"}, self.cerrojo))
        with open(self.ruta, encoding="utf-8") as f:
            self.assertEqual('{"A": {"estado": "commit"}, "B": {"est', f.read())

    def test_marca_sin_tocar_las_demas_y_con_os_replace(self):
        self._escribir(json.dumps({"A": {"estado": "commit"}, "X1": {"estado": "fallo"}}))
        inodo = os.stat(self.ruta).st_ino
        self.assertEqual(1, puente.marcar_en_progreso(self.ruta, ["X1"], {"estado": "commit", "sha": "abc"},
                                                      self.cerrojo))
        with open(self.ruta, encoding="utf-8") as f:
            d = json.load(f)
        self.assertEqual({"estado": "commit"}, d["A"])
        self.assertEqual(("commit", "abc"), (d["X1"]["estado"], d["X1"]["sha"]))
        self.assertIn("t", d["X1"])
        self.assertNotEqual(inodo, os.stat(self.ruta).st_ino)
        self.assertEqual(["cerrojos", "progreso.json"], sorted(os.listdir(self.dir)))


if __name__ == "__main__":
    unittest.main()
