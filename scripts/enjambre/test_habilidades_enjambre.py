# -*- coding: utf-8 -*-
"""Pruebas de lo puro de habilidades_enjambre (Ola 1018L · L): sin red y sin modelos.

Laya no se carga ni se llama: las respuestas de ejemplo viven DENTRO de la prueba, con la
forma real de /v1/systemone (choice/probabilities/answer_confidence, y score y noul en la
misma respuesta — contrato architecture/laya-y-habilidades.md §1 y §4).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import habilidades_enjambre as H  # noqa: E402

TAREA = {"id": "X1", "titulo": "Encargo", "prompt": "Sin palabras clave"}


def laya_choice(choice, confianza):
    """Respuesta de ejemplo de Laya con la forma REAL: choice + score + noul en UNA pasada."""
    return {
        "answers": {
            "habilidad": {
                "type": "choice",
                "choice": choice,
                "probabilities": {"tdd": 0.72, "diagnosing-bugs": 0.21, "codebase-design": 0.05, "to-spec": 0.01, "ninguna": 0.01},
                "answer_confidence": confianza,
            },
            "dificultad": {"type": "score", "score": 0.4, "answer_confidence": 0.66},
            "basta_pequeno": {"type": "noul", "noul": 0.58, "answer_confidence": 0.61},
        }
    }


class TarjetaParaTest(unittest.TestCase):
    """`tarjeta_para` elige por palabras del título y del prompt (regla determinista)."""

    def test_las_palabras_del_contrato_eligen_su_habilidad(self):
        self.assertEqual(H.tarjeta_para({"titulo": "t", "prompt": "Añade la prueba del saludo"}), "tdd")
        self.assertEqual(H.tarjeta_para({"titulo": "Cerrojo roto", "prompt": "Arregla el fallo"}), "diagnosing-bugs")
        self.assertEqual(H.tarjeta_para({"titulo": "Panel", "prompt": "Refactoriza la interfaz del panel"}), "codebase-design")
        self.assertEqual(H.tarjeta_para({"titulo": "Salas", "prompt": "Define el contrato de las salas"}), "to-spec")

    def test_sin_tilde_decide_igual_que_con_ella(self):
        self.assertEqual(H.tarjeta_para({"titulo": "t", "prompt": "Refactoriza el modulo de salas"}), "codebase-design")
        self.assertEqual(H.tarjeta_para({"titulo": "t", "prompt": "Escribe la especificación"}), "to-spec")

    def test_busca_en_el_titulo_y_none_si_no_hay_nada(self):
        self.assertEqual(H.tarjeta_para({"titulo": "Arreglar el bug del dock", "prompt": ""}), "diagnosing-bugs")
        self.assertIsNone(H.tarjeta_para(TAREA))
        self.assertIsNone(H.tarjeta_para({}))
        self.assertIsNone(H.tarjeta_para(None))


class HabilidadesDatosTest(unittest.TestCase):
    """Las tarjetas son datos fieles: mismos ids que TS y dentro del límite de §5."""

    def test_los_cuatro_ids_del_contrato(self):
        self.assertEqual(set(H.HABILIDADES), {"tdd", "diagnosing-bugs", "codebase-design", "to-spec"})

    def test_tarjetas_hasta_60_palabras(self):
        for idi, (_nombre, tarjeta) in H.HABILIDADES.items():
            self.assertLessEqual(len(tarjeta.split()), 60, idi)


class ElegirConLayaTest(unittest.TestCase):
    """Laya decide con `answer_confidence` calibrada; si falla, duda o duda el estado, None."""

    def test_choice_con_confianza_alta_decide(self):
        vistos = []

        def pedir(estado, preguntas):
            vistos.append((estado, preguntas))
            return laya_choice("diagnosing-bugs", 0.9)

        self.assertEqual(H.elegir_con_laya("Encargo " * 400, {"titulo": "Mi título", "prompt": "cuerpo"}, pedir), "diagnosing-bugs")
        estado, preguntas = vistos[0]
        self.assertIn("Mi título", estado)
        self.assertIn("Encargo", estado)
        self.assertLessEqual(len(estado), 1200)
        self.assertEqual(preguntas, H.PREGUNTA)

    def test_duda_fallo_forma_rara_y_sin_pedir(self):
        # 0,61: la confianza real que dio Laya en español (contrato §2): no decide.
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: laya_choice("tdd", 0.61)))
        # La sin calibrar («confidence») no manda: falta `answer_confidence` → None.
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: {"answers": {"habilidad": {"choice": "tdd", "confidence": 0.99}}}))
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: laya_choice("ninguna", 0.95)))
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: laya_choice("loquesea", 0.95)))
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: None))
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: {"answers": []}))
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, lambda e, q: {}))
        self.assertIsNone(H.elegir_con_laya("texto", TAREA, None))

    def test_si_pedir_lanza_no_propaga(self):
        def pedir(estado, preguntas):
            raise TimeoutError("Laya no llegó en el plazo")

        self.assertIsNone(H.elegir_con_laya("texto", TAREA, pedir))


class ConHabilidadTest(unittest.TestCase):
    """`con_habilidad` añade la tarjeta al final con el título exacto; idempotente."""

    def test_anade_la_tarjeta_de_las_palabras_con_titulo_y_nombre(self):
        salida = H.con_habilidad("Haz X.", {"titulo": "t", "prompt": "Añade la prueba del saludo"})
        self.assertTrue(salida.startswith("Haz X."))
        self.assertIn("## " + H.TITULO, salida)
        self.assertIn("TDD · Desarrollo guiado por pruebas", salida)
        self.assertIn("rojo → verde", salida)

    def test_sin_tarjeta_o_tarjeta_ya_puesta_el_encargo_queda_intacto(self):
        self.assertEqual(H.con_habilidad("Haz X.", TAREA), "Haz X.")
        self.assertEqual(H.con_habilidad("", TAREA), "")
        una = H.con_habilidad("Haz X.", {"titulo": "t", "prompt": "Añade la prueba"})
        self.assertEqual(H.con_habilidad(una, {"titulo": "t", "prompt": "Añade la prueba"}), una)

    def test_laya_segura_manda_sobre_las_palabras(self):
        # Las palabras dirían tdd («prueba»), pero Laya está segura: diagnosing-bugs.
        pedir = lambda estado, preguntas: laya_choice("diagnosing-bugs", 0.9)  # noqa: E731
        salida = H.con_habilidad("Escribe la prueba del saludo", TAREA, laya=pedir)
        self.assertIn("hipótesis falsables", salida)
        self.assertNotIn("rojo → verde", salida)

    def test_laya_que_duda_falla_o_dice_ninguna(self):
        tarea = {"id": "X2", "titulo": "Saludo", "prompt": "Escribe la prueba del saludo"}
        dudas = H.con_habilidad(tarea["prompt"], tarea, laya=lambda e, q: laya_choice("diagnosing-bugs", 0.61))
        self.assertIn("rojo → verde", dudas)
        falla = H.con_habilidad(tarea["prompt"], tarea, laya=lambda e, q: None)
        self.assertIn("rojo → verde", falla)
        ninguna = H.con_habilidad(tarea["prompt"], tarea, laya=lambda e, q: laya_choice("ninguna", 0.95))
        self.assertNotIn(H.TITULO, ninguna)


if __name__ == "__main__":
    unittest.main()
