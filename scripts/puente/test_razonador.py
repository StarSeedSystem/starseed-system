"""razonador + experiencias: tres capas, una puerta, y cada decisión deja rastro (sin red)."""
import json
import os
import tempfile
import unittest

import experiencias
import jev
import razonador


class Base(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        experiencias.RUTA = os.path.join(self._dir, "exp.jsonl")
        experiencias.COPIA_DIR = os.path.join(self._dir, "copia")
        jev.CACHE = os.path.join(self._dir, "cache.json"); jev.USO = os.path.join(self._dir, "uso.json")
        os.environ["STARSEED_JEV"] = "0"
        jev.TRANSPORTE = None; razonador.TRANSPORTE_NEEDLE = None; razonador.TRANSPORTE_BITNET = None

    def tearDown(self):
        jev.TRANSPORTE = None; razonador.TRANSPORTE_NEEDLE = None; razonador.TRANSPORTE_BITNET = None
        os.environ.pop("STARSEED_JEV", None)


class Reflejo(Base):
    HERR = [{"name": "abrir_app", "description": "Abre una app.", "parameters": {"type": "object", "properties": {"nombre": {"type": "string"}}, "required": ["nombre"]}}]

    def test_intencion_segura_se_ejecuta_y_queda_anotada(self):
        razonador.TRANSPORTE_NEEDLE = lambda c: {"ok": True, "llamadas": [{"nombre": "abrir_app", "argumentos": {"nombre": "Café"}}], "confianza": 0.71, "ms": 120}
        r = razonador.intencion("abre la app Café", self.HERR, dominio="ui")
        self.assertEqual(r["zona"], "ejecutar")
        self.assertEqual(r["capa"], "needle")
        exps = experiencias.leer()
        self.assertEqual(len(exps), 1)
        self.assertEqual(exps[0]["tipo"], "intencion")
        self.assertEqual(exps[0]["dominio"], "ui")
        self.assertIsNone(exps[0]["resultado"])

    def test_intencion_dudosa_confirma_o_escala(self):
        razonador.TRANSPORTE_NEEDLE = lambda c: {"ok": True, "llamadas": [{"nombre": "abrir_app", "argumentos": {}}], "confianza": 0.45}
        self.assertEqual(razonador.intencion("abre algo", self.HERR)["zona"], "confirmar")
        razonador.TRANSPORTE_NEEDLE = lambda c: {"ok": True, "llamadas": [{"nombre": "a"}, {"nombre": "b"}], "confianza": 0.9}
        self.assertEqual(razonador.intencion("dos cosas", self.HERR)["zona"], "escalar")   # dos llamadas: no es reflejo

    def test_sin_astraura_devuelve_none_sin_anotar(self):
        def caido(c):
            raise OSError("sin backend")
        razonador.TRANSPORTE_NEEDLE = caido
        self.assertIsNone(razonador.intencion("abre la app Café", self.HERR))
        self.assertEqual(experiencias.leer(), [])


class Juicio(Base):
    def test_juicio_con_jev_y_cierre_del_ciclo(self):
        jev.TRANSPORTE = lambda c: {"answers": {"q": {"type": "choice", "choice": "reintentar", "probabilities": {"reintentar": 0.8, "descartar": 0.2}, "confidence": 0.7}}, "usage": {}}
        opcion, probs, conf, eid = razonador.juicio({"tarea": "RS3b"}, "¿qué hacer?", {"reintentar": "…", "descartar": "…"}, dominio="enjambre")
        self.assertEqual(opcion, "reintentar")
        razonador.confirmar(eid, True, "se integró")
        exps = experiencias.leer()
        self.assertEqual(exps[0]["resultado"], True)
        self.assertEqual(exps[0]["opciones"], ["reintentar", "descartar"])
        self.assertEqual(experiencias.calibracion(exps, "jev"), {"0.7": {"n": 1, "aciertos": 1}})

    def test_sin_jev_none(self):
        self.assertIsNone(razonador.juicio({"x": 1}, "?", {"a": "", "b": ""}))
        self.assertIsNone(razonador.si_no({"x": 1}, "?"))


class Deliberacion(Base):
    def test_deliberar_anota_la_capa_real(self):
        razonador.TRANSPORTE_BITNET = lambda c: {"response": "StarSeed OS es…", "mode": "bitnet-native"}
        r = razonador.deliberar("explica StarSeed", dominio="chat")
        self.assertEqual(r["capa"], "bitnet")
        self.assertEqual(experiencias.leer()[0]["capa"], "bitnet")
        razonador.TRANSPORTE_BITNET = lambda c: {"text": "…", "engine": "openrouter"}
        self.assertEqual(razonador.deliberar("otra")["capa"], "llm")


class ParaNeedle(Base):
    def test_solo_las_intenciones_acertadas_entrenan(self):
        razonador.TRANSPORTE_NEEDLE = lambda c: {"ok": True, "llamadas": [{"nombre": "abrir_app", "argumentos": {"nombre": "Café"}}], "confianza": 0.7, "razonamiento": "'Café' -> nombre"}
        h = Reflejo.HERR
        a = razonador.intencion("abre la app Café", h); b = razonador.intencion("abre el Nexus", h)
        razonador.confirmar(a["experiencia"], True); razonador.confirmar(b["experiencia"], False)
        filas = experiencias.para_needle(experiencias.leer())
        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]["query"], "abre la app Café")
        self.assertEqual(filas[0]["answers"][0]["arguments"], {"nombre": "Café"})
        self.assertIn("tools", filas[0])

    def test_entrada_recortada_y_sin_claves(self):
        e = experiencias.nueva("regla", "eleccion", "x" * 1000, {"v": 1})
        self.assertLessEqual(len(e["entrada"]), experiencias.MAX_ENTRADA + 1)
        with self.assertRaises(ValueError):
            experiencias.nueva("magia", "eleccion", "", {})


if __name__ == "__main__":
    unittest.main()
