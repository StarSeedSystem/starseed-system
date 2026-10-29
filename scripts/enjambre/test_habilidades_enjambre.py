# -*- coding: utf-8 -*-
"""Pruebas de las tarjetas de habilidad del enjambre (Ola 1018L · tarea L).
Sin red y sin cargar modelos: la respuesta de Laya va como dato dentro de la prueba,
con su forma real (`choice`, `probabilities`, `answer_confidence`, `score`, `noul`).
"""
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import habilidades_enjambre as H  # noqa: E402

RESPUESTA = {"answers": {"habilidad": {
    "choice": "codebase-design", "answer_confidence": 0.88, "score": 0.73, "noul": 0.9,
    "probabilities": {"codebase-design": 0.81, "tdd": 0.08, "diagnosing-bugs": 0.06,
                      "to-spec": 0.03, "ninguna": 0.02}}}}


def tarea(titulo="", prompt=""):
    return {"titulo": titulo, "prompt": prompt}


def con_confianza(valor, **extra):
    answer = {"choice": "tdd", "probabilities": {"tdd": 0.9, "ninguna": 0.1},
              "answer_confidence": valor, "score": 0.5, "noul": 0.8}
    answer.update(extra)
    return {"answers": {"habilidad": answer}}


class TarjetaPorPalabrasTest(unittest.TestCase):
    def test_prueba_elige_tdd(self):
        self.assertEqual(H.tarjeta_para(tarea(prompt="Escribe una prueba de lo puro.")), "tdd")
    def test_error_fallo_y_arreglar_eligen_diagnostico(self):
        self.assertEqual(H.tarjeta_para(tarea(prompt="Hay un error que arreglar.")), "diagnosing-bugs")
        self.assertEqual(H.tarjeta_para(tarea(prompt="El fallo viene de la caché.")), "diagnosing-bugs")
    def test_modulo_con_y_sin_acento_elige_diseno(self):
        self.assertEqual(H.tarjeta_para(tarea(prompt="Separar el módulo profundo.")), "codebase-design")
        self.assertEqual(H.tarjeta_para(tarea(prompt="Separar el modulo profundo.")), "codebase-design")
    def test_contrato_elige_especificacion(self):
        self.assertEqual(H.tarjeta_para(tarea(prompt="Escribe el contrato de la sala.")), "to-spec")
    def test_la_prioridad_es_prueba_antes_que_error(self):
        self.assertEqual(H.tarjeta_para(tarea(prompt="Prueba que falla por un error.")), "tdd")
    def test_sin_palabras_no_hay_tarjeta(self):
        self.assertIsNone(H.tarjeta_para(tarea(prompt="Pinta el fondo del dock.")))
        self.assertIsNone(H.tarjeta_para(dict()))
        self.assertIsNone(H.tarjeta_para(None))


class PreguntaLayaTest(unittest.TestCase):
    def test_es_choice_con_las_cuatro_y_ninguna(self):
        pregunta = H.pregunta_habilidad()
        self.assertEqual(pregunta["type"], "choice")
        self.assertEqual(set(pregunta["criteria"]), set(H.HABILIDADES) | {"ninguna"})
        for criterio in pregunta["criteria"].values():
            self.assertTrue(criterio.strip())
    def test_los_textos_no_llevan_rutas_ips_ni_claves(self):
        textos = [c for h in H.HABILIDADES.values() for c in (h["nombre"], h["cuando"], h["tarjeta"])]
        for texto in textos + [H.ATRIBUCION, H.TITULO]:
            self.assertNotRegex(texto, r"/Users/|/home/|https?://|\b\d{1,3}(\.\d{1,3}){3}\b|sk-[A-Za-z0-9]")


class ElegirConLayaTest(unittest.TestCase):
    def test_laya_manda_sobre_las_palabras(self):
        def elegir(t):
            return H.elegir_con_laya(t, lambda estado, pregunta: RESPUESTA)
        prompt = H.con_habilidad("Prompt del escritor.", tarea(prompt="Escribe una prueba."), elegir=elegir)
        self.assertIn("Diseño de módulos profundos", prompt)
        self.assertNotIn("TDD · Desarrollo guiado por pruebas", prompt)
    def test_justo_tres_segundos_si_decide_y_mas_no(self):
        justo = iter([10.0, 13.0])
        self.assertEqual(H.elegir_con_laya(tarea(), lambda e, p: RESPUESTA, ahora=lambda: next(justo)),
                         "codebase-design")
        tarde = iter([10.0, 13.001])
        self.assertIsNone(H.elegir_con_laya(tarea(), lambda e, p: RESPUESTA, ahora=lambda: next(tarde)))
    def test_decide_con_answer_confidence_y_no_con_confidence(self):
        self.assertIsNone(H.elegir_con_laya(tarea(), lambda e, p: con_confianza(0.30, confidence=0.99)))
        self.assertEqual(H.elegir_con_laya(tarea(), lambda e, p: con_confianza(0.80, confidence=0.10)), "tdd")
    def test_sin_answer_confidence_no_decide(self):
        respuesta = con_confianza(0.9)
        del respuesta["answers"]["habilidad"]["answer_confidence"]
        self.assertIsNone(H.elegir_con_laya(tarea(), lambda e, p: respuesta))
    def test_una_excepcion_no_decide(self):
        def rompe(estado, pregunta):
            raise RuntimeError("Laya no está")
        self.assertIsNone(H.elegir_con_laya(tarea(), rompe))
    def test_ninguna_se_respeta_y_eleccion_desconocida_no(self):
        self.assertEqual(H.elegir_con_laya(tarea(), lambda e, p: con_confianza(0.9, choice="ninguna")), "ninguna")
        self.assertIsNone(H.elegir_con_laya(tarea(), lambda e, p: con_confianza(0.9, choice="inventada")))


class ConHabilidadTest(unittest.TestCase):
    def test_anade_titulo_tarjeta_y_atribucion_al_final(self):
        prompt = H.con_habilidad("Prompt original.", tarea(prompt="Prueba nueva."))
        self.assertTrue(prompt.startswith("Prompt original.\n\n## "))
        self.assertIn("## " + H.TITULO, prompt)
        self.assertIn(H.HABILIDADES["tdd"]["tarjeta"], prompt)
        self.assertIn("MIT", prompt)
    def test_sin_tarjeta_deja_el_prompt_igual(self):
        self.assertEqual(H.con_habilidad("Prompt.", tarea(prompt="Dock azul.")), "Prompt.")
        self.assertEqual(H.con_habilidad("", tarea(prompt="prueba")), "")
    def test_es_idempotente(self):
        una = H.con_habilidad("Prompt.", tarea(prompt="prueba"))
        self.assertEqual(H.con_habilidad(una, tarea(prompt="prueba")), una)
    def test_si_elegir_falla_caen_las_palabras(self):
        def rompe(t):
            raise RuntimeError("sin Laya")
        self.assertIn("TDD · Desarrollo guiado por pruebas",
                      H.con_habilidad("Prompt.", tarea(prompt="prueba"), elegir=rompe))


if __name__ == "__main__":
    unittest.main()
