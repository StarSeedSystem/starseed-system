# -*- coding: utf-8 -*-
"""Pruebas del motor Antigravity (`agy`) del Director presidente (GEM1118A).

Ejecutor falso: ninguna prueba llama a `agy` de verdad. Se cubren la interpretación
pura de su salida (éxito, vacío, cuota, tiempo agotado, sesión) y el relevo real del
Director: un fallo de agy nunca se publica como respuesta y pasa al motor siguiente.
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat as dc
import director_presidente as P
import motores_director as M

AHORA = 1762934400.0  # 2026-11-12 12:00 UTC


class Falso:
    """`correr` falso: responde por el primer elemento de la orden y guarda lo que recibió."""

    def __init__(self, **respuestas):
        self.respuestas = respuestas
        self.llamadas = []
        self.entradas = {}
        self.ordenes = {}

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        motor = orden[0]
        self.llamadas.append(motor)
        self.entradas[motor] = entrada
        self.ordenes[motor] = list(orden)
        respuesta = self.respuestas.get(motor)
        if respuesta is None:
            raise AssertionError("no se esperaba llamar a %s" % motor)
        return respuesta


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.mensaje = dc.publicar("¿Sigue viva la dirección?", de="alex", rol="alex", tipo="mensaje",
                                   canales=["director-presidente"], raiz=self.raiz)
        self.estado = {}

    def tearDown(self):
        self.tmp.cleanup()

    def atender(self, falso, existe=None, texto=None):
        if texto:
            self.mensaje["texto"] = texto
        return P.atender(self.mensaje, self.estado, raiz=self.raiz, correr=falso,
                         existe=existe or (lambda n: True), limites={}, ahora=AHORA, tope_opus=40)

    def respuestas(self):
        return [r for r in dc.leer(limite=500, raiz=self.raiz) if r.get("tipo") == "respuesta"]


class TestLeerAgy(unittest.TestCase):
    """PURA: la salida de agy se traduce sin ejecutar nada."""

    def test_exito_json_con_uso_y_modelo(self):
        salida = json.dumps({"response": "Hola desde Antigravity", "model": "gemini-3.8-flash-medium",
                             "usage": {"input_tokens": 12, "output_tokens": 7}})
        r = M.leer_agy(salida, 0)
        self.assertEqual("Hola desde Antigravity", r["texto"])
        self.assertEqual("gemini-3.8-flash-medium", r["modelo"])
        self.assertEqual((12, 7), (r["tokens_entrada"], r["tokens_salida"]))
        self.assertIsNone(r["error"])

    def test_exito_texto_plano(self):
        r = M.leer_agy("Respuesta en texto con acentos: sí.", 0)
        self.assertEqual("Respuesta en texto con acentos: sí.", r["texto"])
        self.assertIsNone(r["error"])

    def test_vacio_es_fallo(self):
        r = M.leer_agy("", 0)
        self.assertEqual("", r["texto"])
        self.assertIn("vacía", r["error"])

    def test_cuota_es_fallo_y_no_se_publica(self):
        r = M.leer_agy(json.dumps({"error": {"message": "Quota exceeded for this model"}}), 0)
        self.assertEqual("", r["texto"])
        self.assertIn("Quota", r["error"])

    def test_sesion_caida_es_fallo(self):
        r = M.leer_agy("Error: not logged in. Run agy login.", 0)
        self.assertEqual("", r["texto"])
        self.assertIn("not logged in", r["error"])

    def test_tiempo_agotado_es_fallo(self):
        r = M.leer_agy("\n[tiempo agotado]", -9)
        self.assertEqual("", r["texto"])
        self.assertIn("tiempo agotado", r["error"])

    def test_codigo_distinto_de_cero_es_fallo_aunque_haya_texto(self):
        r = M.leer_agy("algo de texto", 1)
        self.assertEqual("", r["texto"])
        self.assertIn("código 1", r["error"])

    def test_una_respuesta_larga_que_menciona_cuota_no_es_fallo(self):
        largo = "La cuota es un concepto económico. " * 40
        r = M.leer_agy(largo, 0)
        self.assertEqual(largo.strip(), r["texto"])
        self.assertIsNone(r["error"])


class TestOrdenAgy(unittest.TestCase):
    """La orden: modelo, plan, tope y ninguna bandera peligrosa."""

    def test_orden_por_defecto(self):
        orden = M.orden_agy("pregunta")
        self.assertEqual("agy", orden[0])
        self.assertIn(M.MODELO_AGY, orden)
        self.assertIn("plan", orden)
        self.assertNotIn("--dangerously-skip-permissions", orden)
        self.assertEqual("%ds" % M.SEGUNDOS_AGY, orden[orden.index("--print-timeout") + 1])
        self.assertEqual("%ds" % M.SEGUNDOS_AGY, "%ds" % (M.SEGUNDOS_PROVEEDOR_PRESIDENTE + 15))

    def test_modelo_de_plan_explicito(self):
        orden = M.orden_agy("plan", M.MODELO_AGY_PLAN)
        self.assertIn(M.MODELO_AGY_PLAN, orden)


class TestLlamarAgy(Base):
    def test_cierra_la_entrada_y_anota_el_modelo_real(self):
        falso = Falso(agy=(0, json.dumps({"response": "Viva.", "model": "gemini-3.8-flash-medium",
                                          "usage": {"input_tokens": 3, "output_tokens": 2}})))
        texto, motivo, uso = P._llamar_agy("hola", falso)
        self.assertEqual("Viva.", texto)
        self.assertEqual("", motivo)
        self.assertIs(M.SIN_ENTRADA, falso.entradas["agy"])
        self.assertEqual("gemini-3.8-flash-medium", uso["modelo"])
        self.assertEqual((3, 2), (uso["tokensEntrada"], uso["tokensSalida"]))

    def test_prompt_largo_usa_el_modelo_de_plan(self):
        falso = Falso(agy=(0, "Vale."))
        P._llamar_agy("x" * (M.TOPE_PROMPT_AGY + 1), falso)
        self.assertIn(M.MODELO_AGY_PLAN, falso.ordenes["agy"])


class TestAtenderConAgy(Base):
    """El relevo real: Claude sin límites → Hermes → agy → Codex, sin publicar errores."""

    def test_exito_contesta_agy_y_anota_el_uso(self):
        falso = Falso(hermes=(1, ""),
                      agy=(0, json.dumps({"response": "Contesta Antigravity", "model": "gemini-3.8-flash-medium",
                                          "usage": {"input_tokens": 12, "output_tokens": 7}})))
        self.assertEqual("respondido", self.atender(falso))
        self.assertEqual(["hermes", "agy"], falso.llamadas)
        r = self.respuestas()[-1]
        self.assertEqual("agy", r["eleccion"]["proveedor"])
        self.assertEqual("agy/gemini-3.8-flash-medium", r["modelo"])
        self.assertEqual(12, r["uso"]["tokensEntrada"])
        self.assertIs(M.SIN_ENTRADA, falso.entradas["agy"])

    def test_vacio_pasa_a_codex(self):
        falso = Falso(hermes=(1, ""), agy=(0, ""), codex=(0, "Respuesta de Codex"))
        self.assertEqual("respondido", self.atender(falso))
        r = self.respuestas()[-1]
        self.assertEqual("chatgpt", r["eleccion"]["proveedor"])
        self.assertEqual("Respuesta de Codex", r["texto"])
        self.assertIn("agy", [d["proveedor"] for d in r["eleccion"]["descartes"]])

    def test_cuota_pasa_a_codex_y_no_se_publica_el_error(self):
        falso = Falso(hermes=(1, ""), agy=(0, json.dumps({"error": {"message": "Quota exceeded"}})),
                      codex=(0, "Respuesta de Codex"))
        self.assertEqual("respondido", self.atender(falso))
        r = self.respuestas()[-1]
        self.assertEqual("chatgpt", r["eleccion"]["proveedor"])
        self.assertNotIn("Quota", r["texto"])

    def test_tiempo_agotado_pasa_a_codex(self):
        falso = Falso(hermes=(1, ""), agy=(-9, "\n[tiempo agotado]"), codex=(0, "Respuesta de Codex"))
        self.assertEqual("respondido", self.atender(falso))
        self.assertEqual("chatgpt", self.respuestas()[-1]["eleccion"]["proveedor"])

    def test_sin_binario_se_salta(self):
        falso = Falso(hermes=(1, ""), codex=(0, "Respuesta de Codex"))
        self.assertEqual("respondido", self.atender(falso, existe=lambda n: n != "agy"))
        self.assertNotIn("agy", falso.llamadas)
        r = self.respuestas()[-1]
        self.assertEqual("chatgpt", r["eleccion"]["proveedor"])
        agy = [d for d in r["eleccion"]["descartes"] if d["proveedor"] == "agy"]
        self.assertEqual(1, len(agy))
        self.assertIn("no está instalada", agy[0]["motivo"])


if __name__ == "__main__":
    unittest.main()


