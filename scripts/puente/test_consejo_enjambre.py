# -*- coding: utf-8 -*-
"""Pruebas de Jev en la zona de duda del enjambre de código (consejo_enjambre.py): la regla
manda y es el respaldo; Jev solo cambia algo con confianza, y callado no cambia nada."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import consejo_enjambre as C  # noqa: E402

TAREA = {"id": "p384A", "titulo": "Frenar el sondeo de la malla", "archivos": ["src/lib/network/malla.ts"],
         "prompt": "Añade esLider() antes del setInterval."}
CANDIDATOS = ["nim/moonshotai/kimi-k3", "nim/deepseek-v4-pro", "xkiro/qwen3-coder-plus", "gemini/gemini-2.5-flash",
              "llm7/minimax-m2.7"]


class Consulta(object):
    def __init__(self, respuesta=None, lanza=False):
        self.respuesta = respuesta
        self.lanza = lanza
        self.vistas = []

    def __call__(self, tipo, estado, pregunta, **kw):
        self.vistas.append((tipo, estado, pregunta, kw))
        if self.lanza:
            raise RuntimeError("sin red")
        r = self.respuesta(kw.get("opciones")) if callable(self.respuesta) else self.respuesta
        return r or {"respuesta": kw.get("regla"), "medio": "regla"}


class Escritores(unittest.TestCase):
    def test_sin_fallo_previo_manda_el_orden_y_ni_se_pregunta(self):
        c = Consulta({"respuesta": "xkiro/qwen3-coder-plus", "confianza": 0.9, "medio": "local"})
        lista, nota, exp = C.ordenar_escritores(TAREA, CANDIDATOS, [], c)
        self.assertEqual((lista, nota, c.vistas), (CANDIDATOS, "", []))

    def test_tras_un_fallo_jev_elige_entre_proveedores_distintos(self):
        c = Consulta({"respuesta": "xkiro/qwen3-coder-plus", "confianza": 0.72, "medio": "openrouter", "experiencia": "e9"})
        lista, nota, exp = C.ordenar_escritores(TAREA, CANDIDATOS, ["codex/gpt-5.6-sol"], c)
        self.assertEqual(lista[0], "xkiro/qwen3-coder-plus")
        self.assertEqual(sorted(lista), sorted(CANDIDATOS))
        self.assertIn("Jev elige xkiro/qwen3-coder-plus", nota)
        self.assertEqual(exp, "e9")
        tipo, estado, _, kw = c.vistas[0]
        self.assertEqual(tipo, "elegir")
        # Uno por proveedor (el segundo de nim no compite con el primero) y la regla = el primero.
        self.assertEqual(kw["opciones"], ["nim/moonshotai/kimi-k3", "xkiro/qwen3-coder-plus",
                                          "gemini/gemini-2.5-flash", "llm7/minimax-m2.7"])
        self.assertEqual(kw["regla"], "nim/moonshotai/kimi-k3")
        self.assertEqual(estado["ya_fallaron_aqui"], ["codex/gpt-5.6-sol"])
        self.assertEqual(estado["tarea"]["extensiones"], ["ts"])

    def test_poca_confianza_silencio_o_error_no_cambian_nada(self):
        for c in (Consulta({"respuesta": "xkiro/qwen3-coder-plus", "confianza": 0.3, "medio": "local"}),
                  Consulta(None), Consulta(lanza=True), None):
            lista, nota, _ = C.ordenar_escritores(TAREA, CANDIDATOS, ["x/y"], c)
            self.assertEqual((lista, nota), (CANDIDATOS, ""))

    def test_un_solo_proveedor_o_modelo_pedido_no_pregunta(self):
        c = Consulta({"respuesta": "nim/b", "confianza": 0.9, "medio": "local"})
        self.assertEqual(C.ordenar_escritores(TAREA, ["nim/a", "nim/b"], ["x/y"], c)[0], ["nim/a", "nim/b"])
        self.assertEqual(C.ordenar_escritores(dict(TAREA, modelo="nim/a"), CANDIDATOS, ["x/y"], c)[0], CANDIDATOS)
        self.assertEqual(c.vistas, [])


class Revisores(unittest.TestCase):
    REV = [("xkiro", "qwen3.7-plus"), ("tokenrouter", "glm-5.3-free"), ("nim", "kimi-k3")]

    def test_con_ultimo_que_respondio_manda_la_regla(self):
        c = Consulta({"respuesta": "nim/kimi-k3", "confianza": 0.9, "medio": "local"})
        self.assertEqual(C.ordenar_revisores(self.REV, "xkiro/qwen3.7-plus", c), (self.REV, ""))
        self.assertEqual(c.vistas, [])

    def test_sin_ultimo_jev_elige_quien_revisa_primero(self):
        c = Consulta({"respuesta": "nim/kimi-k3", "confianza": 0.8, "medio": "local"})
        lista, nota = C.ordenar_revisores(self.REV, "", c, "p384A")
        self.assertEqual(lista, [("nim", "kimi-k3"), ("xkiro", "qwen3.7-plus"), ("tokenrouter", "glm-5.3-free")])
        self.assertIn("revisor nim/kimi-k3", nota)

    def test_sin_ultimo_y_jev_callado(self):
        self.assertEqual(C.ordenar_revisores(self.REV, "", Consulta(None)), (self.REV, ""))


class SinCambios(unittest.TestCase):
    PROBADOS = ["nim/kimi-k3", "xkiro/qwen3-coder-plus"]

    def test_con_confianza_alta_se_acepta_ya(self):
        c = Consulta({"respuesta": "sí", "p": 0.91, "medio": "openrouter", "experiencia": "e5"})
        parar, nota, exp = C.parar_sin_cambios(TAREA, 2, self.PROBADOS, ["gemini/x"], ["ya existe esLider()"], c)
        self.assertTrue(parar)
        self.assertIn("p=0.91", nota)
        self.assertEqual(exp, "e5")
        tipo, estado, _, kw = c.vistas[0]
        self.assertEqual((tipo, kw["regla"]), ("si-no", "no"))
        self.assertEqual(estado["ultimas_salidas"], ["ya existe esLider()"])

    def test_en_la_duda_se_sigue(self):
        for c in (Consulta({"respuesta": "sí", "p": 0.7, "medio": "local"}), Consulta(None), Consulta(lanza=True)):
            self.assertFalse(C.parar_sin_cambios(TAREA, 3, self.PROBADOS, ["gemini/x"], [], c)[0])

    def test_no_se_pregunta_antes_de_tiempo(self):
        c = Consulta({"respuesta": "sí", "p": 0.99, "medio": "local"})
        self.assertFalse(C.parar_sin_cambios(TAREA, 1, self.PROBADOS[:1], ["gemini/x"], [], c)[0])
        self.assertFalse(C.parar_sin_cambios(TAREA, 2, ["nim/a", "nim/b"], ["gemini/x"], [], c)[0])  # un solo proveedor
        self.assertFalse(C.parar_sin_cambios(TAREA, 2, self.PROBADOS, [], [], c)[0])                 # no queda nadie
        self.assertEqual(c.vistas, [])


if __name__ == "__main__":
    unittest.main()
