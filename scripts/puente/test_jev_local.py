"""jev_local: decisiones tipadas contra BitNet, sin red en las pruebas."""

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import jev_local


class JevLocal(unittest.TestCase):
    def setUp(self):
        jev_local.TRANSPORTE = None

    def tearDown(self):
        jev_local.TRANSPORTE = None

    def test_softmax_dos_letras(self):
        self.assertEqual(jev_local._softmax([0, 0]), [0.5, 0.5])
        self.assertAlmostEqual(jev_local._softmax([0, math.log(3)])[0], 0.25)

    def test_softmax_cuatro_letras(self):
        valores = [0, math.log(2), math.log(3), math.log(4)]
        self.assertEqual(jev_local._softmax(valores), [0.1, 0.2, 0.3, 0.4])

    def test_prompt_repite_estado_y_termina_en_respuesta(self):
        recibido = []

        def transporte(cuerpo):
            recibido.append(cuerpo)
            return {
                "completion_probabilities": [
                    [
                        {"token": " A", "logprob": -1.0},
                        {"token": " B", "logprob": -2.0},
                    ]
                ]
            }

        estado = {"tarea": "JV6", "archivos": ["a.py"]}
        preguntas = {
            "uno": {
                "type": "choice",
                "instructions": "¿se integra?",
                "criteria": {"si": "sí", "no": "no"},
            },
            "dos": {
                "type": "choice",
                "instructions": "¿se espera?",
                "criteria": {"si": "sí", "no": "no"},
            },
        }
        jev_local.TRANSPORTE = transporte
        self.assertEqual(set(jev_local.decidir(estado, preguntas)), {"uno", "dos"})
        self.assertEqual(len(recibido), 2)
        for cuerpo in recibido:
            self.assertEqual(
                set(cuerpo),
                {"prompt", "n_predict", "n_probs", "temperature", "cache_prompt"},
            )
            self.assertEqual(cuerpo["n_predict"], 1)
            self.assertEqual(cuerpo["n_probs"], 20)
            self.assertEqual(cuerpo["temperature"], 0)
            self.assertTrue(cuerpo["cache_prompt"])
            self.assertTrue(
                cuerpo["prompt"].startswith('{"archivos": ["a.py"], "tarea": "JV6"}')
            )
            self.assertTrue(cuerpo["prompt"].endswith("Respuesta: "))
        self.assertEqual(
            recibido[0]["prompt"].split("\n\n", 1)[0],
            recibido[1]["prompt"].split("\n\n", 1)[0],
        )

    def test_sin_letra_valida_devuelve_none(self):
        def transporte(cuerpo):
            return {"completion_probabilities": [[{"token": " C", "logprob": -0.1}]]}

        jev_local.TRANSPORTE = transporte
        pregunta = {"type": "noul", "instructions": "¿continuar?"}
        self.assertIsNone(jev_local.decidir({"x": 1}, {"q": pregunta}))

    def test_transporte_con_excepcion_devuelve_none(self):
        def transporte(cuerpo):
            raise OSError("sin servidor")

        jev_local.TRANSPORTE = transporte
        pregunta = {"type": "noul", "instructions": "¿continuar?"}
        self.assertIsNone(jev_local.decidir({"x": 1}, {"q": pregunta}))

    def test_score_devuelve_nivel_mas_probable_y_confianza(self):
        def transporte(cuerpo):
            return {
                "completion_probabilities": [
                    [
                        {"token": " A", "logprob": -2.0},
                        {"token": " B", "logprob": -0.2},
                        {"token": " C", "logprob": -1.0},
                    ]
                ]
            }

        jev_local.TRANSPORTE = transporte
        pregunta = {
            "type": "score",
            "instructions": "prioridad",
            "criteria": ["baja", "media", "alta"],
        }
        respuesta = jev_local.decidir({"x": 1}, {"q": pregunta})["q"]
        self.assertEqual(respuesta["score"], 1.0)
        self.assertEqual(respuesta["probabilities"].keys(), {"0", "1", "2"})
        self.assertGreater(respuesta["confidence"], 0.7)
        self.assertAlmostEqual(sum(respuesta["probabilities"].values()), 1.0)


if __name__ == "__main__":
    unittest.main()
