import unittest
# Assuming the functions are in a module called laya_exportar in the same directory
# If this module doesn't exist, the test will fail with ImportError, indicating missing code
try:
    from laya_exportar import comparar_respuestas, resumir_resultados
except ImportError:
    # Fallback: define dummy functions to allow test creation, but tests will fail
    # This is just to allow the file to be created; the import error will be reported when running
    def comparar_respuestas(*args, **kwargs):
        raise NotImplementedError("Function comparar_respuestas not implemented")
    
    def resumir_resultados(*args, **kwargs):
        raise NotImplementedError("Function resumir_resultados not implemented")

class TestLayaExportar(unittest.TestCase):
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