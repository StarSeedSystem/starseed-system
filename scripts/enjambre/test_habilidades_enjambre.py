# -*- coding: utf-8 -*-
"""Pruebas de habilidades_enjambre (Ola 1018L · L, contrato laya-y-habilidades §5 y §7).
Módulo PURO: nada de red ni de carga de modelos; las respuestas de Laya son de ejemplo, con
su forma real (choice/probabilities/answer_confidence, score, noul), como en jev.py.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import habilidades_enjambre as hab


def tarea(titulo="tarea", prompt="", archivos=None):
    return {"titulo": titulo, "prompt": prompt, "archivos": list(archivos or [])}

# Forma real de Laya (contrato §1): `choice` con `answer_confidence` calibrada; `score`
# y `noul` para probar que donde toca `choice` no valen otros tipos.
CHOICE_OK = {"type": "choice", "choice": "tdd",
             "probabilities": {"tdd": 0.72, "diagnosing-bugs": 0.12, "codebase-design": 0.05, "to-spec": 0.11},
             "answer_confidence": 0.93}
SCORE_OK = {"type": "score", "score": 3.0, "probabilities": {"2": 0.4, "3": 0.5, "4": 0.1}, "confidence": 0.9}
NOUL_OK = {"type": "noul", "noul": 0.44}


class TarjetaParaTest(unittest.TestCase):
    """`tarjeta_para` elige por palabras de título y prompt (regla del contrato §5)."""

    def test_prueba_va_a_tdd_y_manda_sobre_las_otras(self):
        self.assertEqual(hab.tarjeta_para(tarea("Prueba del rito de bienvenida", "vitest"))["id"], "tdd")
        # El plural casa por prefijo y «prueba» va antes en la regla que «error».
        self.assertEqual(hab.tarjeta_para(tarea("Escribir pruebas del wizard"))["id"], "tdd")
        self.assertEqual(hab.tarjeta_para(tarea(prompt="prueba del error"))["id"], "tdd")

    def test_error_fallo_arreglar_va_a_diagnosing(self):
        for palabra in ("error", "fallo", "arreglar", "errores", "fallos"):
            self.assertEqual(hab.tarjeta_para(tarea(prompt=palabra + " de lo roto"))["id"], "diagnosing-bugs")

    def test_modulo_interfaz_refactor_va_a_codebase_design(self):
        for palabra in ("módulo", "modulos", "interfaz", "interfaces", "refactorizar"):
            self.assertEqual(hab.tarjeta_para(tarea(prompt=palabra))["id"], "codebase-design")
        # Los ARCHIVOS también cuentan en la firma.
        self.assertEqual(hab.tarjeta_para(tarea(archivos=["modulo/x.ts"]))["id"], "codebase-design")

    def test_contrato_especificacion_va_a_to_spec(self):
        for palabra in ("contrato", "especificación", "especificaciones"):
            self.assertEqual(hab.tarjeta_para(tarea(prompt=palabra))["id"], "to-spec")

    def test_sin_palabras_da_none(self):
        self.assertIsNone(hab.tarjeta_para(tarea("mundo", "estilo armónico")))
        self.assertIsNone(hab.tarjeta_para(None))

    def test_datos_del_contrato(self):
        self.assertEqual(hab.TITULO, "CÓMO TRABAJAR (habilidad de Matt Pocock, MIT)")
        self.assertEqual([t["id"] for t in hab.TARJETAS], ["tdd", "diagnosing-bugs", "codebase-design", "to-spec"])
        for id_h, _cl in hab.PALABRAS:
            self.assertIsNotNone(hab.tarjeta_de(id_h))
        for t in hab.TARJETAS:
            # La TARJETA ≤ 60 palabras (contrato §5), todo en texto.
            self.assertLessEqual(len((t["tarjeta"] or "").split()), 60)


class LayaTest(unittest.TestCase):
    def test_forma_real_de_laya_choice_score_y_noul(self):
        # Un `choice` con answer_confidence alta decide; un `score` o un `noul` donde toca
        # `choice`, o un id fuera del catálogo, NO deciden (contrato §1).
        self.assertEqual(hab.id_de_respuesta(CHOICE_OK), "tdd")
        self.assertIsNone(hab.id_de_respuesta(dict(CHOICE_OK, choice="otra")))
        self.assertIsNone(hab.id_de_respuesta(SCORE_OK))
        self.assertIsNone(hab.id_de_respuesta(NOUL_OK))
        self.assertIsNone(hab.id_de_respuesta(None))
        self.assertIsNone(hab.id_de_respuesta("tdd"))
        # En español la calibrada baja (contrato §2): entonces NO decide.
        self.assertIsNone(hab.id_de_respuesta(dict(CHOICE_OK, answer_confidence=0.61)))

    def test_laya_decide_en_vez_de_las_palabras(self):
        vista = {}
        def preguntar(estado, pregunta, opciones):
            vista.update(estado=estado, pregunta=pregunta, opciones=opciones)
            return CHOICE_OK
        t = tarea("Prueba de salas", "módulo puro")  # por palabras no saldría tdd
        c = hab.elegir_con_laya(t, preguntar=preguntar, reloj=lambda: 0.0)
        self.assertEqual(c["id"], "tdd")
        self.assertIn("tdd", vista["opciones"])

    def test_tardanza_o_duda_va_a_palabras(self):
        otra = dict(CHOICE_OK, choice="codebase-design")
        pasos = iter([0.0, 4.0])  # arranca puntual y responde fuera de los 3 s del plazo
        c = hab.elegir_con_laya(tarea(prompt="prueba"), preguntar=lambda *_: otra, reloj=lambda: next(pasos))
        self.assertEqual(c["id"], "tdd")  # a destiempo, la tarjeta la eligen las palabras
        baja = dict(CHOICE_OK, choice="diagnosing-bugs", answer_confidence=0.4)  # duda
        d = hab.elegir_con_laya(tarea(prompt="prueba"), preguntar=lambda *_: baja, reloj=lambda: 0.0)
        self.assertEqual(d["id"], "tdd")  # con esa confianza, también deciden las palabras

    def test_transporte_none_o_error_va_a_palabras(self):
        def mal(estado, pregunta, opciones):
            raise RuntimeError("sin servidor")
        t = tarea(prompt="refactor")
        for preguntar in (None, mal, lambda *_: None):
            self.assertEqual((hab.elegir_con_laya(t, preguntar=preguntar, reloj=lambda: 0.0) or {}).get("id"), "codebase-design")
        self.assertIsNone(hab.elegir_con_laya(tarea("mundo"), preguntar=None, reloj=lambda: 0.0))


class ConHabilidadTest(unittest.TestCase):
    def test_la_tarjeta_va_al_final_con_su_titulo(self):
        prompt = hab.con_habilidad("Cuerpo", tarea(prompt="fallo"))
        self.assertTrue(prompt.startswith("Cuerpo\n\n" + hab.TITULO))
        self.assertIn("«Diagnóstico de fallos difíciles»", prompt)
        self.assertIn("bucle de realimentación", prompt)
        self.assertIn("MIT", prompt)

    def test_prompt_sin_tarjeta_queda_igual_y_tarjeta_inyectada_manda(self):
        self.assertEqual(hab.con_habilidad("Cuerpo", tarea("mundo")), "Cuerpo")
        prompt = hab.con_habilidad("", tarea(prompt="prueba"), tarjeta=hab.tarjeta_de("to-spec"))
        self.assertIn("«De la conversación a la especificación»", prompt)


if __name__ == "__main__":
    unittest.main()
