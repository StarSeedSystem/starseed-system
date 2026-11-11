#!/usr/bin/env python3
"""(VER1111F) El archivo de comprobaciones de las pruebas y su comando, en una carpeta temporal."""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comprobaciones_prueba as C  # noqa: E402

#: El mismo ejemplo que lee la prueba de TypeScript (src/lib/mando/__tests__/lanzamientos-pruebas.test.ts).
EJEMPLO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "lib", "mando", "__tests__",
                       "fixtures", "pruebas-comprobaciones.json")


class Logica(unittest.TestCase):
    def test_numero(self):
        for t in ("36", "prueba36", "prueba.36", "0.5.1-prueba.36", " PRUEBA.36 "):
            self.assertEqual(C.numero_de_prueba(t), 36, t)
        for t in ("", "0.5.1", "abc", None):
            self.assertIsNone(C.numero_de_prueba(t))

    def test_registrar_sin_duplicar_y_marcar(self):
        d, ids = C.registrar(None, "prueba36", ["Llamada por Bluetooth", "Cámara del iPhone"], aparato="Mac",
                             sha="A8051EA953", t="T")
        self.assertEqual(ids, ["c1", "c2"])
        d, ids = C.registrar(d, "36", ["llamada por bluetooth", "Tablet sin Wi-Fi"], aparato="Android")
        self.assertEqual(ids, ["c3"])
        d = C.marcar(d, "0.5.1-prueba.36", "c2", "falla", nota="video negro", quien="director", t="T2")
        p = d["pruebas"]["36"]
        self.assertEqual(p["sha"], "a8051ea953")
        self.assertEqual(p["comprobaciones"][1]["estado"], "falla")
        self.assertEqual(p["comprobaciones"][1]["nota"], "video negro")
        self.assertEqual(C.resumen(p), {"total": 3, "bien": 0, "falla": 1, "pendiente": 2})

    def test_errores(self):
        d, _ = C.registrar(None, "36", ["x"])
        with self.assertRaises(ValueError):
            C.marcar(d, "36", "c9", "bien")
        with self.assertRaises(ValueError):
            C.marcar(d, "36", "c1", "regular")
        with self.assertRaises(ValueError):
            C.registrar(None, "nada", ["x"])

    def test_normalizar_descarta_lo_roto(self):
        d = C.normalizar({"pruebas": {"x": {}, "7": {"comprobaciones": [{"id": "c1"}, {"id": "c2", "texto": "t",
                                                                                   "estado": "raro"}]}}})
        self.assertEqual(list(d["pruebas"]), ["7"])
        self.assertEqual(d["pruebas"]["7"]["comprobaciones"][0]["estado"], "pendiente")

    def test_el_ejemplo_compartido_con_el_panel_se_lee_igual(self):
        with open(EJEMPLO, encoding="utf-8") as f:
            crudo = json.load(f)
        d = C.normalizar(crudo)
        self.assertEqual(C.resumen(d["pruebas"]["36"]), {"total": 4, "bien": 2, "falla": 1, "pendiente": 1})


class Comando(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.environ["STARSEED_PRODUCCION_DIR"] = self.dir

    def tearDown(self):
        os.environ.pop("STARSEED_PRODUCCION_DIR", None)

    def _correr(self, *args):
        salida = io.StringIO()
        with redirect_stdout(salida):
            rc = C.main(list(args))
        return rc, salida.getvalue()

    def test_registrar_marcar_y_ver(self):
        rc, out = self._correr("registrar", "prueba36", "--aparato", "Mac", "--sha", "a8051ea953", "Tres llamadas")
        self.assertEqual((rc, out.strip()), (0, "registradas 1: c1"))
        rc, out = self._correr("marcar", "36", "c1", "bien", "--nota", "con cámara")
        self.assertEqual(rc, 0)
        rc, out = self._correr("ver", "36")
        self.assertIn("1 de 1", out)
        self.assertIn("con cámara", out)
        with open(os.path.join(self.dir, C.NOMBRE), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["pruebas"]["36"]["comprobaciones"][0]["estado"], "bien")

    def test_un_error_no_escribe(self):
        rc, _ = self._correr("registrar", "36", "x", "--sha", "no-es-sha")
        self.assertEqual(rc, 2)
        self.assertFalse(os.path.exists(os.path.join(self.dir, C.NOMBRE)))


if __name__ == "__main__":
    unittest.main()
