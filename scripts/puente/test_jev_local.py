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
        # Con assertEqual esta prueba fallaba por 0.30000000000000004 != 0.3: comparar
        # flotantes por igualdad exacta no prueba nada util y rompe sola. (2026-09-20)
        valores = [0, math.log(2), math.log(3), math.log(4)]
        for salida, esperado in zip(jev_local._softmax(valores), [0.1, 0.2, 0.3, 0.4]):
            self.assertAlmostEqual(salida, esperado)

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
        # La confianza ES la probabilidad de la opcion ganadora, y con estos logprobs
        # (-2,0 · -0,2 · -1,0) sale 0,619, no «mas de 0,7»: el 0,7 del primer intento era
        # aritmetica equivocada de la prueba, no un fallo del modulo. Se fija el numero
        # real y, sobre todo, lo que de verdad importa: que gana la opcion del medio.
        self.assertAlmostEqual(respuesta["confidence"], 0.6193, places=3)
        self.assertEqual(respuesta["confidence"], max(respuesta["probabilities"].values()))
        self.assertAlmostEqual(sum(respuesta["probabilities"].values()), 1.0)


class JevLocalSeApartaEnConversacion(unittest.TestCase):
    """Con Alex hablando con Astraura, Jev local no ocupa el hueco de BitNet."""

    def setUp(self):
        import json, tempfile, time
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, "conversacion.json")
        with open(self.ruta, "w") as f:
            json.dump({"desde": time.time(), "hasta": time.time() + 60}, f)
        self.antes = jev_local.CONCESION
        jev_local.CONCESION = self.ruta
        jev_local.TRANSPORTE = None

    def tearDown(self):
        jev_local.CONCESION = self.antes

    def test_conversando_lee_la_concesion(self):
        self.assertTrue(jev_local.conversando())
        self.assertFalse(jev_local.conversando(ahora=10**12))
        self.assertFalse(jev_local.conversando(ruta=os.path.join(self.dir, "no")))

    def test_decidir_y_disponible_se_apartan(self):
        preguntas = {"q": {"type": "noul", "instructions": "¿sí?"}}
        self.assertIsNone(jev_local.decidir({"a": 1}, preguntas))
        self.assertFalse(jev_local.disponible())


if __name__ == "__main__":
    unittest.main()
