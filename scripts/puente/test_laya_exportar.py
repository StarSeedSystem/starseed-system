# -*- coding: utf-8 -*-
"""Pruebas puras para laya_exportar.py: sin red, sin disco y sin cargar modelos.

Las respuestas de ejemplo tienen la forma real de system_one:
choice/probabilities/answer_confidence, score y noul.
(CONTRATO: architecture/laya-y-habilidades.md §2 y §7-O)
"""
import os
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from laya_exportar import (  # noqa: E402
    MENSAJES_EJEMPLO,
    PREGUNTAS,
    comparar_respuestas,
    extraer_respuesta,
    evaluar,
    inferir_laya,
    medir_latencia,
    resumir_resultados,
)

# Respuesta real de system_one de Laya: answers con choice/probabilities/answer_confidence, score y noul
RESULTADO_LAYA_REAL = {
    "answers": {
        "herramienta": {
            "choice": "chat",
            "probabilities": {"chat": 0.71, "voz": 0.05, "tarea": 0.24},
            "confidence": 0.68,
            "answer_confidence": 0.83,
        },
        "dificultad": {
            "score": 1.5,
            "probabilities": [0.4, 0.45, 0.15],
            "confidence": 0.52,
            "answer_confidence": 0.7,
        },
        "basta_pequeno": {
            "noul": 0.42,
            "confidence": 0.44,
            "answer_confidence": 0.61,
        },
    },
    "usage": {"input_tokens": 120, "output_tokens": 0},
}


class RespuestaPlanaReal(unittest.TestCase):
    def test_extraer_respuesta_aplanada(self):
        plana = extraer_respuesta(RESULTADO_LAYA_REAL)
        self.assertEqual(plana["choice"], "chat")
        self.assertEqual(plana["score"], 1.5)
        self.assertEqual(plana["noul"], 0.42)
        # media de las tres answer_confidence calibradas
        self.assertAlmostEqual(plana["answer_confidence"], (0.83 + 0.7 + 0.61) / 3, places=6)
        self.assertEqual(plana["probabilities"], RESULTADO_LAYA_REAL["answers"]["herramienta"]["probabilities"])

    def test_inferir_laya_con_agente_falso(self):
        agente = type("AgenteFalso", (), {"system_one": staticmethod(lambda texto, preguntas: RESULTADO_LAYA_REAL)})()
        plana = inferir_laya(agente, "Hola, ¿cómo estás?")
        self.assertEqual(plana["choice"], "chat")
        self.assertEqual(plana["noul"], 0.42)

    def test_respuesta_sin_answers(self):
        plana = extraer_respuesta({"answers": {}})
        self.assertIsNone(plana["choice"])
        self.assertEqual(plana["answer_confidence"], 0.0)

    def test_comparar_con_decision_divergente(self):
        fp32 = dict(extraer_respuesta(RESULTADO_LAYA_REAL))
        int8 = dict(fp32, choice="voz")
        res = comparar_respuestas(fp32, int8)
        self.assertFalse(res["choice_coincide"])
        self.assertTrue(res["noul_coincide"])
        self.assertEqual(res["diferencia_confianza"], 0.0)


class Muestreo32(unittest.TestCase):
    def test_mensajes_ejemplo_son_30(self):
        self.assertEqual(len(MENSAJES_EJEMPLO), 30)
        for mensaje in MENSAJES_EJEMPLO:
            self.assertIsInstance(mensaje, str)

    def test_preguntas_tipadas_del_contrato(self):
        self.assertEqual(PREGUNTAS["herramienta"]["type"], "choice")
        self.assertEqual(PREGUNTAS["dificultad"]["type"], "score")
        self.assertEqual(PREGUNTAS["basta_pequeno"]["type"], "noul")


class MedidaInyectada(unittest.TestCase):
    """evaluar y medir_latencia con reloj y modelos falsos: la misma subida sin cargar nada."""

    @staticmethod
    def _modelo(choice, confianza=0.83):
        return lambda texto: {"choice": choice, "score": 1.5, "noul": 0.42, "answer_confidence": confianza, "probabilities": {}}

    def test_evaluar_cuenta_latencias_con_reloj_falso(self):
        tics = iter([0.0, 1.0, 2.0, 2.5, 4.0, 5.0, 6.0, 6.5])  # fp32 1000 ms, int8 500 ms, por mensaje
        filas = evaluar(
            ["uno", "dos"],
            {"fp32": self._modelo("chat"), "int8": self._modelo("chat")},
            reloj=lambda: next(tics),
        )
        self.assertEqual(len(filas), 2)
        self.assertAlmostEqual(filas[0]["latencia_fp32_ms"], 1000.0)
        self.assertAlmostEqual(filas[0]["latencia_int8_ms"], 500.0)
        self.assertAlmostEqual(filas[1]["latencia_fp32_ms"], 1000.0)
        self.assertTrue(filas[1]["comparacion"]["choice_coincide"])

    def test_evaluar_registra_coincidencia_y_divergencia(self):
        filas = evaluar(
            ["Mi correo es usuario@ejemplo.com."],
            {"fp32": self._modelo("chat"), "int8": self._modelo("tarea", confianza=0.79)},
            reloj=lambda: 0.0,
        )
        self.assertFalse(filas[0]["comparacion"]["choice_coincide"])
        self.assertAlmostEqual(filas[0]["comparacion"]["diferencia_confianza"], 0.04)
        resumen = resumir_resultados(filas)
        self.assertEqual(resumen["choice_aciertos"], 0)
        self.assertAlmostEqual(resumen["latencia_promedio_int8_ms"], 0.0)

    def test_medir_latencia_reloj_inyectado(self):
        tics = iter([1.0, 1.25])
        resultado, latencia = medir_latencia(lambda: "hecho", reloj=lambda: next(tics))
        self.assertEqual(resultado, "hecho")
        self.assertAlmostEqual(latencia, 250.0)


class TestLayaPuras(unittest.TestCase):
    def test_comparar_respuestas(self):
        fp32 = {"choice": "A", "score": 0.8, "noul": 0.2, "answer_confidence": 0.9}
        int8 = {"choice": "A", "score": 0.8, "noul": 0.2, "answer_confidence": 0.8}
        res = comparar_respuestas(fp32, int8)
        self.assertTrue(res["choice_coincide"])
        self.assertAlmostEqual(res["diferencia_confianza"], 0.1)

    def test_resumir_resultados(self):
        res_list = [{
            "comparacion": {
                "choice_coincide": True,
                "score_coincide": True,
                "noul_coincide": True,
                "confianza_fp32": 0.9,
                "confianza_int8": 0.8,
                "diferencia_confianza": 0.1
            },
            "latencia_fp32_ms": 10.0,
            "latencia_int8_ms": 5.0
        }]
        res = resumir_resultados(res_list)
        self.assertEqual(res["total_mensajes"], 1)
        self.assertEqual(res["choice_precision"], 1.0)
        self.assertEqual(res["latencia_promedio_fp32_ms"], 10.0)


if __name__ == "__main__":
    unittest.main()
