# -*- coding: utf-8 -*-
"""Pruebas de la tarjeta de habilidad del enjambre (Ola 1018L · L). Sin red ni modelos cargados:
la respuesta de Laya va de ejemplo DENTRO de la prueba con la forma real del contrato
(architecture/laya-y-habilidades.md §1): `answers` con choice/probabilities/answer_confidence,
score y noul, y `motor`; transporte y reloj, falsos.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from habilidades_enjambre import PLAZO_LAYA_S, tarjeta_para, elegir_con_laya, con_habilidad

TAREAS = {
    "tdd": {"id": "qA", "titulo": "Prueba first para envolver", "prompt": "escribe las pruebas primero"},
    "diagnosing-bugs": {"id": "qB", "titulo": "La ola se fue", "prompt": "arreglar el error de la pasarela"},
    "codebase-design": {"id": "qC", "titulo": "modulo nuevo", "prompt": "diseñar la interfaz del dock"},
    "to-spec": {"id": "qD", "titulo": "Contrato de salas", "prompt": "escribir la especificación"},
}
TAREA_ENLACE = {"id": "zPr", "titulo": "Añadir enlace del dock", "prompt": "registralo en dock-config.ts"}

def respuesta_laya(choice, conf, motor="laya-local"):
    """Ejemplo con la forma REAL (§1): choice + probabilities + answer_confidence,
    score y noul de relleno del mismo pase."""
    return {"answers": {
        "habilidad": {"type": "choice", "choice": choice, "confidence": 0.95, "answer_confidence": conf,
                      "probabilities": {"tdd": 0.62, "diagnosing-bugs": 0.19, "codebase-design": 0.11,
                                        "to-spec": 0.05, "ninguna": 0.03}},
        "esfuerzo": {"type": "score", "score": 2, "probabilities": {"1": 0.5, "2": 0.4, "3": 0.1}},
        "es_privado": {"type": "noul", "answer": 0.25, "answer_confidence": 0.4},
    }, "motor": motor}

def transporte_falso(reloj, respuesta, salto=0.4):
    """Guarda url y cuerpo, hace avanzar el reloj falso y responde sin red."""
    def transporte(url, cuerpo, plazo):
        assert plazo <= PLAZO_LAYA_S, "el plazo de Laya no puede pasar de 3 s"
        reloj.update(url=url, cuerpo=json.loads(cuerpo.decode("utf-8")))
        reloj["t"] = reloj.get("t", 0.0) + salto
        return 200, json.dumps(respuesta, ensure_ascii=False)
    return transporte

def caido(_url, _cuerpo, _plazo):
    raise ConnectionError("refused")

def roto(_url, _cuerpo, _plazo):
    return 200, "</div>no"

class TarjetaPorPalabrasTest(unittest.TestCase):
    def test_encaje_y_no_encaje(self):
        for id, tarea in TAREAS.items():
            with self.subTest(id=id):
                elegida = tarjeta_para(tarea)
                self.assertEqual(elegida["id"], id)
                self.assertTrue(elegida["tarjeta"].strip())
        for tarea in (TAREA_ENLACE, {}, {"id": "x"}):
            with self.subTest(id=tarea.get("id")):
                self.assertIsNone(tarjeta_para(tarea))

class ElegirConLayaTest(unittest.TestCase):
    def test_laya_elige_en_lugar_de_las_palabras(self):
        reloj = {}  # el transporte y el reloj son el MISMO dict: el reloj avanza al responder
        res = elegir_con_laya(TAREA_ENLACE, transporte=transporte_falso(reloj, respuesta_laya("tdd", 0.71)),
                              reloj=lambda: reloj.get("t", 0.0))
        self.assertEqual(res["tarjeta"]["id"], "tdd")
        self.assertEqual(res["motor"], "laya-local")
        # Cuerpo en formato de Jev: state + la pregunta choice con criterios y «ninguna».
        q = reloj["cuerpo"]["questions"]["habilidad"]
        self.assertEqual(q["type"], "choice")
        self.assertEqual(set(q["criteria"]), {"tdd", "diagnosing-bugs", "codebase-design", "to-spec", "ninguna"})
        self.assertIn("/v1/systemone", reloj["url"])

    def test_umbral_sobre_answer_confidence_nunca_sobre_confidence(self):
        res = elegir_con_laya(TAREA_ENLACE, transporte=transporte_falso({}, respuesta_laya("tdd", 0.2)),
                              reloj=lambda: 100.0)
        self.assertIsNone(res)  # (contrato §1) `answer_confidence` manda; `confidence` no: dudas

    def test_tarde_caido_y_raro_son_none_y_ninguna_cuenta_como_respondida(self):
        reloj = {}
        tarda = transporte_falso(reloj, respuesta_laya("tdd", 0.9), salto=PLAZO_LAYA_S + 0.5)
        for transporte, tic in ((tarda, lambda: reloj.get("t", 0.0)), (caido, lambda: 0.0), (roto, lambda: 0.0)):
            with self.subTest(motivo=str(transporte)):
                self.assertIsNone(elegir_con_laya(TAREA_ENLACE, transporte=transporte, reloj=tic))
        res = elegir_con_laya(TAREA_ENLACE, transporte=transporte_falso({}, respuesta_laya("ninguna", 0.8)),
                              reloj=lambda: 0.0)
        self.assertIsNotNone(res)  # respondió ELIGIENDO ninguna (no cae a las palabras)
        self.assertIsNone(res["tarjeta"])

class ConHabilidadTest(unittest.TestCase):
    def test_anade_tarjeta_al_final_con_titulo(self):
        falso = transporte_falso({}, respuesta_laya("tdd", 0.71))
        salida = con_habilidad("PROMPT\nTAREA qA", TAREA_ENLACE, transporte=falso, reloj=lambda: 100.4)
        self.assertTrue(salida.startswith("PROMPT\nTAREA qA"))
        self.assertIn("Cómo trabajar (habilidad de Matt Pocock, MIT)", salida)
        self.assertIn("elegida por Laya local (laya-local)", salida)
        self.assertIn("Bucle rojo", salida)

    def test_dudas_de_laya_cae_a_las_palabras(self):
        falso = transporte_falso({}, respuesta_laya("diagnosing-bugs", 0.2))
        salida = con_habilidad("P", TAREAS["diagnosing-bugs"], transporte=falso, reloj=lambda: 100.4)
        self.assertIn("elegida por las palabras del título y el prompt", salida)
        self.assertIn("bucle de realimentación", salida)

    def test_ninguna_respondida_y_sin_palabras_dejan_el_prompt_tal_cual(self):
        # «Ninguna» respondida (aunque el transporte funciona) y sin palabras: nada de tarjeta.
        falso = transporte_falso({}, respuesta_laya("ninguna", 0.8))
        salida = con_habilidad("P\nTAREA zPr", TAREA_ENLACE, transporte=falso, reloj=lambda: 100.4)
        self.assertEqual(salida, "P\nTAREA zPr")

    def test_caido_y_malformado_cae_a_las_palabras(self):
        for transporte in (caido, roto):
            with self.subTest(motivo=str(transporte)):
                salida = con_habilidad("P", TAREAS["tdd"], transporte=transporte, reloj=lambda: 0.0)
                self.assertIn("elegida por las palabras", salida)
                self.assertIn("Bucle rojo", salida)

if __name__ == "__main__":
    unittest.main()
