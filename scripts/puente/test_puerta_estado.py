"""Pruebas del estado de la puerta de integración (MED1111E)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puerta_estado as P  # noqa: E402

T0 = datetime(2026, 11, 11, 3, 0, tzinfo=timezone.utc)


class Estado(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.ruta = os.path.join(self.dir.name, "produccion", "puerta-estado.json")

    def leer(self):
        with open(self.ruta, encoding="utf-8") as f:
            return json.load(f)

    def test_recorrido_completo_en_verde(self):
        self.assertTrue(P.iniciar("1111e", ["opus1106/LLA1111A"], "315028b8f4aaaa", self.ruta, T0))
        d = self.leer()
        self.assertEqual((d["paso"], d["resultado"], d["fin"], d["base"]), ("esperando", "en_curso", None, "315028b8f4"))
        self.assertTrue(P.paso("pruebas", self.ruta, T0 + timedelta(minutes=3)))
        self.assertEqual(self.leer()["actualizado"], (T0 + timedelta(minutes=3)).isoformat())
        self.assertEqual(self.leer()["inicio"], T0.isoformat())
        P.pruebas({"archivos": 939, "pruebas": 10673, "falladas": 0, "omitidas": 13}, self.ruta)
        self.assertTrue(P.cerrar("verde", ruta=self.ruta, ahora=T0 + timedelta(minutes=20)))
        d = self.leer()
        self.assertEqual((d["paso"], d["resultado"], d["pruebas"]["pruebas"]), ("terminado", "verde", 10673))
        self.assertEqual(d["fin"], (T0 + timedelta(minutes=20)).isoformat())
        self.assertNotIn("fallo", d)

    def test_rojo_con_fallo_sin_rutas(self):
        P.iniciar("x", ["a"], "", self.ruta, T0)
        P.cerrar("rojo", "tsc falla en /Users/alex/Documents/starseed-os-main/src/a.ts(3,1)\nerror TS2304", self.ruta, T0)
        d = self.leer()
        self.assertEqual(d["resultado"], "rojo")
        self.assertNotIn("/Users", d["fallo"])
        self.assertNotIn("\n", d["fallo"])
        self.assertIn("error TS2304", d["fallo"])

    def test_nunca_lanza(self):
        # Paso desconocido, resultado inválido, estado sin iniciar y destino imposible: False, sin excepción.
        self.assertFalse(P.paso("pruebas", self.ruta))
        self.assertFalse(P.cerrar("verde", ruta=self.ruta))
        P.iniciar("x", [], "", self.ruta, T0)
        self.assertFalse(P.paso("inventado", self.ruta))
        self.assertFalse(P.cerrar("quizá", ruta=self.ruta))
        archivo = os.path.join(self.dir.name, "archivo")
        open(archivo, "w").close()
        self.assertFalse(P.iniciar("x", [], "", os.path.join(archivo, "dentro.json"), T0))

    def test_escritura_atomica_no_deja_temporales(self):
        P.iniciar("x", ["a"], "", self.ruta, T0)
        P.paso("tipos", self.ruta, T0)
        self.assertEqual(os.listdir(os.path.dirname(self.ruta)), ["puerta-estado.json"])

    def test_variable_de_entorno_cambia_el_destino(self):
        alterna = os.path.join(self.dir.name, "otro.json")
        anterior = os.environ.get("STARSEED_PUERTA_ESTADO")
        os.environ["STARSEED_PUERTA_ESTADO"] = alterna
        try:
            P.iniciar("x", ["a"], "", ahora=T0)
        finally:
            if anterior is None:
                del os.environ["STARSEED_PUERTA_ESTADO"]
            else:
                os.environ["STARSEED_PUERTA_ESTADO"] = anterior
        self.assertTrue(os.path.exists(alterna))

    def test_contar_vitest(self):
        salida = " Test Files  939 passed (939)\n      Tests  10673 passed | 13 skipped (10686)\n"
        self.assertEqual(P.contar_vitest(salida), {"archivos": 939, "pruebas": 10673, "falladas": 0, "omitidas": 13})
        rojo = " Test Files  1 failed | 302 passed (303)\n      Tests  1 failed | 3405 passed (3406)\n"
        self.assertEqual(P.contar_vitest(rojo), {"archivos": 303, "pruebas": 3405, "falladas": 1, "omitidas": 0})
        self.assertEqual(P.contar_vitest(""), {"archivos": 0, "pruebas": 0, "falladas": 0, "omitidas": 0})

    def test_linea_de_ordenes(self):
        os.environ["STARSEED_PUERTA_ESTADO"] = self.ruta
        try:
            self.assertEqual(P.main(["iniciar", "n", "--ramas", "a,b", "--base", "abc123"]), 0)
            self.assertEqual(P.main(["paso", "tipos"]), 0)
            self.assertEqual(P.main(["cerrar", "rojo", "--fallo", "algo"]), 0)
        finally:
            del os.environ["STARSEED_PUERTA_ESTADO"]
        d = self.leer()
        self.assertEqual((d["ramas"], d["paso"], d["resultado"]), (["a", "b"], "terminado", "rojo"))


if __name__ == "__main__":
    unittest.main()
