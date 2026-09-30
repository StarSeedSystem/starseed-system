# -*- coding: utf-8 -*-
"""El orquestador aplica el protocolo común (2026-09-30): el escritor recibe el contexto
común de su rol, el revisor el suyo, y quién revisa primero lo afina Jev solo cuando no hay
«último que respondió». Sin red: decidir es un doble."""
import importlib.util
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
sys.path.insert(0, DIRECTORIO)
sys.path.insert(0, os.path.join(RAIZ, "scripts", "puente"))


class DecidirDoble(object):
    def __init__(self, respuesta):
        self.respuesta = respuesta
        self.vistas = []

    def consultar(self, tipo, estado, pregunta, **kw):
        self.vistas.append((tipo, kw))
        return self.respuesta(kw) if callable(self.respuesta) else self.respuesta


class ProtocoloComun(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        espec = importlib.util.spec_from_file_location("enjambre_protocolo", os.path.join(DIRECTORIO, "starseed-enjambre.py"))
        cls.E = importlib.util.module_from_spec(espec)
        espec.loader.exec_module(cls.E)

    def setUp(self):
        self.viejos = {}
        self.parchear("ROOT", RAIZ)  # leer las reglas de ESTE repositorio
        self.eventos = []
        self.parchear("evento", lambda tipo, tid, texto, *a, **k: self.eventos.append((tipo, texto)))

    def tearDown(self):
        for k, v in self.viejos.items():
            setattr(self.E, k, v)

    def parchear(self, nombre, valor):
        self.viejos.setdefault(nombre, getattr(self.E, nombre))
        setattr(self.E, nombre, valor)

    def test_el_escritor_recibe_el_contexto_comun_compacto(self):
        texto = self.E.contexto_inteligente({"id": "p1", "titulo": "Frenar el sondeo", "archivos": ["src/lib/mando/colas.ts"],
                                             "prompt": "x"})
        self.assertIn("# Contexto común · rol escritor", texto)
        self.assertIn("protocolo Jev", texto)
        self.assertIn("decidir.py si-no", texto)
        comun = texto[texto.index("# Contexto común"):]
        self.assertLessEqual(len(comun), 2200)
        self.assertNotIn("## Tu área", comun)   # el área ya la da contexto_inteligente

    def revisar_con(self, decidir, ultimo=""):
        llamadas = []
        self.parchear("_decidir", lambda: decidir)
        self.parchear("candidatos_revision", lambda: ([("xkiro", "qwen3.7-plus"), ("nim", "kimi-k3")], []))
        self.parchear("_revisor_ultimo_ok", lambda: ultimo)
        self.parchear("_revisor_respondio", lambda p, m: None)
        self.parchear("llamar_llm", lambda p, m, prompt, **kw: llamadas.append((p, prompt)) or "Seguimiento: no")
        quien, texto, _ = self.E.revisar("p1", "Frenar el sondeo", "diff --git a/x b/x")
        return quien, llamadas

    def test_sin_ultimo_revisor_jev_elige_y_el_revisor_lleva_sus_reglas(self):
        doble = DecidirDoble({"respuesta": "nim/kimi-k3", "confianza": 0.8, "medio": "local"})
        quien, llamadas = self.revisar_con(doble)
        self.assertEqual(quien, "nim/kimi-k3")
        self.assertEqual(doble.vistas[0][0], "elegir")
        self.assertTrue(llamadas[0][1].startswith("# Contexto común · rol revisor"))
        self.assertIn("Bloqueante SOLO", llamadas[0][1])
        self.assertTrue(any("Jev elige revisor" in t for _, t in self.eventos))

    def test_con_ultimo_revisor_manda_la_regla_y_jev_callado_tambien(self):
        doble = DecidirDoble({"respuesta": "nim/kimi-k3", "confianza": 0.9, "medio": "local"})
        quien, _ = self.revisar_con(doble, ultimo="xkiro/qwen3.7-plus")
        self.assertEqual((quien, doble.vistas), ("xkiro/qwen3.7-plus", []))
        quien, _ = self.revisar_con(DecidirDoble({"respuesta": "xkiro/qwen3.7-plus", "medio": "regla"}))
        self.assertEqual(quien, "xkiro/qwen3.7-plus")
        quien, _ = self.revisar_con(None)
        self.assertEqual(quien, "xkiro/qwen3.7-plus")


if __name__ == "__main__":
    unittest.main()
