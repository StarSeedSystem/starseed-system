# -*- coding: utf-8 -*-
"""Pruebas del módulo puro habilidades_enjambre (Ola 1018L · L): tarjetas por palabras,
decisión con Laya (respuestas de EJEMPLO con la forma real choice/probabilities/
answer_confidence, sin red y sin cargar el modelo) y pregunta con transporte inyectado."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import habilidades_enjambre as h  # noqa: E402

DECISION_LAYA = {"type": "choice", "choice": "codebase-design",
    "probabilities": {"tdd": 0.1, "codebase-design": 0.72, "ninguna": 0.08},
    "answer_confidence": 0.83}
RESPUESTA_LAYA = {"answers": {"habilidad": DECISION_LAYA}, "ms": 2400}


def tareas(prompt):
    """Tarea de ejemplo: título neutro (sin palabras pistas): lo probado va en `prompt`."""
    return {"id": "LYS1018L", "titulo": "Tarea del enjambre",
        "archivos": ["scripts/enjambre/habilidades_enjambre.py"], "prompt": prompt.strip()}


class PalabrasYBloque(unittest.TestCase):
    """`tarjeta_para` elige por palabras; `con_habilidad` añade la tarjeta al final."""

    def test_tarjetas_de_palabras_en_su_orden(self):
        self.assertEqual(h.tarjeta_para(tareas("Añadir pruebas al módulo nuevo")), "tdd")
        # El orden manda: «arregla el fallo escribiendo primero la prueba» es TDD.
        self.assertEqual(h.tarjeta_para(tareas("Arregla el fallo escribiendo la prueba primero")), "tdd")
        self.assertEqual(h.tarjeta_para(tareas("Depura el error de la pasarela")), "diagnosing-bugs")
        self.assertEqual(h.tarjeta_para(tareas("Refactoriza la interfaz del módulo")), "codebase-design")
        self.assertEqual(h.tarjeta_para(tareas("Convertir el contrato en especificación")), "to-spec")
        self.assertEqual(h.tarjeta_para(tareas("contrato en especificacion sin tilde")), "to-spec")
        self.assertIsNone(h.tarjeta_para(tareas("Botes de jabón del escaparate")))

    def test_bloque_al_final_con_titulo_y_atribucion(self):
        resultado = h.con_habilidad("ESCRIBE la tarea L.", tareas("Coberturas de prueba"))
        self.assertTrue(resultado.startswith("ESCRIBE la tarea L."))
        self.assertIn(h.TITULO_BLOQUE, resultado)
        self.assertIn("TDD · Desarrollo guiado por pruebas", resultado)
        self.assertIn("Matt Pocock", resultado)
        self.assertIn("MIT", resultado)

    def test_sin_habilidad_no_toca_el_prompt(self):
        self.assertEqual(h.con_habilidad("Solo botes de jabón.", tareas("Botes de jabón")), "Solo botes de jabón.")
        self.assertEqual(h.con_habilidad(None, tareas("Botes de jabón")), "")


class LayaYEleccion(unittest.TestCase):
    """`elegir_con_laya` decide con «answer_confidence» (nunca «confidence»), y de
    respaldo las palabras; «ninguna» segura deja el prompt sin tarjeta (contrato §4)."""

    def test_laya_segura_salta_las_palabras(self):
        self.assertEqual(h.elegir_con_laya(RESPUESTA_LAYA, tareas("Cobertura de pruebas"), umbral=0.7), "codebase-design")
        # También vale la decisión SUELTA, sin el sobre {answers} del servidor.
        self.assertEqual(h.elegir_con_laya(DECISION_LAYA, tareas("Cobertura de pruebas"), umbral=0.7), "codebase-design")

    def test_confianza_baja_o_ausente_vuelve_a_las_palabras(self):
        baja = {"answers": {"habilidad": dict(DECISION_LAYA, answer_confidence=0.61)}}  # español, §2
        self.assertEqual(h.elegir_con_laya(baja, tareas("Cobertura de pruebas"), umbral=0.7), "tdd")
        solo_confidence = {"answers": {"habilidad": {"type": "choice", "choice": "to-spec", "confidence": 0.99}}}
        self.assertEqual(h.elegir_con_laya(solo_confidence, tareas("Refactor del módulo"), umbral=0.7), "codebase-design")
        raro = {"answers": {"habilidad": {"type": "choice", "choice": "prototipo", "answer_confidence": 0.99}}}
        self.assertEqual(h.elegir_con_laya(raro, tareas("pruebas"), umbral=0.7), "tdd")

    def test_ninguna_segura_quita_la_tarjeta(self):
        ninguna = {"answers": {"habilidad": {"type": "choice", "choice": "ninguna", "answer_confidence": 0.9}}}
        self.assertIsNone(h.elegir_con_laya(ninguna, tareas("Botes de jabón"), umbral=0.7))
        self.assertEqual(h.con_habilidad("x", tareas("Botes de jabón"), ninguna), "x")
        dudosa = {"answers": {"habilidad": {"type": "choice", "choice": "ninguna", "answer_confidence": 0.5}}}
        self.assertEqual(h.elegir_con_laya(dudosa, tareas("pruebas"), umbral=0.7), "tdd")


class PreguntaLaya(unittest.TestCase):
    """`preguntar_a_laya` manda UNA pregunta choice con los ids y «ninguna»; None si no responde."""

    def test_envia_choice_con_los_ids_y_ninguna(self):
        vistas = {}

        class Respuesta:
            def read(self):
                return json.dumps(RESPUESTA_LAYA).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def falso(peticion, timeout):
            vistas["url"] = peticion.full_url
            vistas["cuerpo"] = json.loads(peticion.data.decode("utf-8"))
            vistas["plazo"] = timeout
            return Respuesta()

        salida = h.preguntar_a_laya(tareas("prueba"), url="http://127.0.0.1:4470/v1/systemone", abrir=falso)
        self.assertEqual(salida, RESPUESTA_LAYA)
        pregunta = vistas["cuerpo"]["questions"]["habilidad"]
        self.assertEqual(pregunta["type"], "choice")
        self.assertEqual(list(pregunta["criteria"]), ["tdd", "diagnosing-bugs", "codebase-design", "to-spec", "ninguna"])
        self.assertEqual(vistas["plazo"], h.PLAZO_LAYA_S)
        self.assertTrue(vistas["cuerpo"]["state"].startswith("[LYS1018L]"))

    def test_sin_respuesta_devuelve_none(self):
        def roto(peticion, timeout):
            raise OSError("conexión denegada")

        self.assertIsNone(h.preguntar_a_laya(tareas("prueba"), abrir=roto))


if __name__ == "__main__":
    unittest.main()
