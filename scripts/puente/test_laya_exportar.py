# -*- coding: utf-8 -*-
"""Pruebas puras para laya_exportar.py.

(CONTRATO: architecture/laya-y-habilidades.md)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
import unittest
from laya_exportar import comparar_respuestas, resumir_resultados

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