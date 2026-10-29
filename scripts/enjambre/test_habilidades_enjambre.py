# -*- coding: utf-8 -*-
"""Pruebas de las tarjetas de habilidad para el escritor (Ola 1018L · contratos §5 y §2).

Puras: sin red, sin disco, sin modelos cargados. Las respuestas de Laya son EJEMPLOS con
la forma real de un System One `choice`: {"type": "choice", "choice": <id>,
"probabilities": {...}, "answer_confidence": <calibrada>} (como en `decisiones.ts` y el
servidor de 127.0.0.1:4470). Sin `vi.mock`, sin `any`.
"""

import pathlib
import sys
import types
import unittest

DIRECTORIO = pathlib.Path(__file__).resolve().parent
if str(DIRECTORIO) not in sys.path:
    sys.path.insert(0, str(DIRECTORIO))

import habilidades_enjambre as h

RESPUESTA_TDD = {
    "type": "choice",
    "choice": "tdd",
    "probabilities": {"tdd": 0.78, "diagnosing-bugs": 0.07, "codebase-design": 0.05,
                      "to-spec": 0.02, "ninguna": 0.08},
    "answer_confidence": 0.9,
}

TITULO = h.TITULO_PROMPT
TARJ_TDD = "%s — %s" % (h.TARJETAS["tdd"]["nombre"], h.TARJETAS["tdd"]["texto"])
TARJ_DIAG = "%s — %s" % (h.TARJETAS["diagnosing-bugs"]["nombre"], h.TARJETAS["diagnosing-bugs"]["texto"])


def nombre_de(tarjeta):
    """El nombre de la tarjeta; en las pruebas el None ya lo cubre assertIsNotNone."""
    return (tarjeta or {}).get("nombre")


class HabilidadPorPalabras(unittest.TestCase):
    def test_escoge_por_palabras_de_la_tarea(self):
        casos = [
            ("Escribe la suite de pruebas del depósito", "tdd"),
            ("arregla el error del latido", "diagnosing-bugs"),
            ("Módulo puro nuevo para la interfaz del mando", "codebase-design"),
            ("Contrato y especificación de salas", "to-spec"),
        ]
        for texto, esperado in casos:
            # tarjetas completas (dict), comparadas por si acaso son dict nuevos
            self.assertEqual(h.tarjeta_para({"titulo": texto, "prompt": ""}),
                             h.TARJETAS[esperado], texto)

    def test_con_acentos_y_sin_comillas_encaja_bien(self):
        encontrada = h.tarjeta_para({"titulo": "MÓDulo pequeño", "prompt": ""})
        self.assertIsNotNone(encontrada)
        self.assertEqual(nombre_de(encontrada), h.TARJETAS["codebase-design"]["nombre"])

    def test_tarea_general_sin_habilidad(self):
        self.assertIsNone(h.tarjeta_para({"titulo": "Añadir el campo color al panel", "prompt": ""}))

    def test_las_cuatro_tarjetas_caben_en_sesenta_palabras(self):
        for id_tarj, tarjeta in h.TARJETAS.items():
            self.assertLessEqual(len(tarjeta["texto"].split()), 60, id_tarj)
        self.assertEqual(set(h.TARJETAS), {"tdd", "diagnosing-bugs", "codebase-design", "to-spec"})


class EleccionDeLaya(unittest.TestCase):
    """Respuestas de ejemplo con la forma real (choice / probabilities / answer_confidence)."""

    def test_forma_real_choice_se_acepta(self):
        self.assertEqual(nombre_de(h.elegir_con_laya(RESPUESTA_TDD)), h.TARJETAS["tdd"]["nombre"])

    def test_respuesta_envuelta_por_la_clave_de_pregunta(self):
        # decidir_con_laya devuelve {clave_de_pregunta: answer…} + «motor»
        envuelta = {"hab": RESPUESTA_TDD, "motor": "laya-local"}
        self.assertEqual(nombre_de(h.elegir_con_laya(envuelta)), h.TARJETAS["tdd"]["nombre"])

    def test_umbra_decision_con_answer_confidence_calibrada(self):
        dudosa = {"type": "choice", "choice": "tdd", "probabilities": {"tdd": 0.4},
                  "answer_confidence": 0.45}
        self.assertIsNone(h.elegir_con_laya(dudosa))

    def test_answer_confidence_ausente_no_se_arregla_con_confidence(self):
        # (contrato §1) La calibrada manda: sin `answer_confidence` no se decide, aunque
        # llegue una `confidence` no calibrada alta.
        otros = {"type": "choice", "choice": "tdd", "confidence": 0.99}
        self.assertIsNone(h.elegir_con_laya(otros))

    def test_ninguna_y_basura_devuelven_none(self):
        self.assertIsNone(h.elegir_con_laya({"type": "choice", "choice": "ninguna",
                                             "answer_confidence": 0.95}))
        self.assertIsNone(h.elegir_con_laya({"type": "score", "score": 3,
                                             "answer_confidence": 0.9}))
        self.assertIsNone(h.elegir_con_laya(None))
        self.assertIsNone(h.elegir_con_laya("rojo"))


class ConHabilidad(unittest.TestCase):
    TAREA = {"titulo": "Arreglar el error del latido", "prompt": "x"}

    def test_laya_rapida_decide_en_lugar_de_las_palabras(self):
        prompt = h.con_habilidad("Base del prompt", {"titulo": "Sin palabras clave", "prompt": ""},
                                 respuesta_laya=RESPUESTA_TDD, t_laya=2.0)
        # Laya eligió TDD aunque las palabras no decían nada.
        self.assertIn(TARJ_TDD, prompt)

    def test_laya_laboriosa_no_cuenta_las_palabras_mandan(self):
        prompt = h.con_habilidad("Base", {"titulo": "arregla el error", "prompt": ""},
                                 respuesta_laya=RESPUESTA_TDD, t_laya=3.4)
        self.assertIn(TARJ_DIAG, prompt)

    def test_tarjeta_al_final_con_su_titulo(self):
        prompt = h.con_habilidad("Base", {"titulo": "prueba nueva", "prompt": ""})
        self.assertIn("Cómo trabajar (habilidad de Matt Pocock, MIT)", prompt)
        self.assertTrue(prompt.index("Base") < prompt.index(TITULO))  # el final manda
        self.assertTrue(prompt.rstrip().endswith(h.TARJETAS["tdd"]["texto"]))

    def test_sin_habilidad_y_el_prompt_queda_igual(self):
        prompt = "Texto sin cambiar"
        self.assertEqual(h.con_habilidad(prompt, {"titulo": "campo color al panel", "prompt": ""}), prompt)
        # Laya contestó pero demasiado tarde (3,4 s > tope) y las palabras tampoco sirven.
        self.assertEqual(h.con_habilidad(prompt, {"titulo": "campo color al panel", "prompt": ""},
                                         respuesta_laya=RESPUESTA_TDD, t_laya=9.0), prompt)

    def test_estado_laya_recorta_el_prompt(self):
        estado = h.estado_laya({"titulo": "t", "prompt": "a" * 5000})
        self.assertEqual(len(estado["tarea"]["prompt"]), 600)


class HabilidadViva(unittest.TestCase):
    """`con_habilidad_viva` con un `jev` FALSO en memoria (sin red ni modelos)."""

    def setUp(self):
        self.viejo = sys.modules.get("jev")
        self.vistas = []

    def tearDown(self):
        if self.viejo is not None:
            sys.modules["jev"] = self.viejo
        else:
            sys.modules.pop("jev", None)

    def falso_jev(self, respuesta):
        """Módulo `jev` falso en sys.modules: sin modelos, sin red, sin tocar disco."""
        falso = types.ModuleType("jev")

        def decidir_con_laya(estado, preguntas, timeout=1.5, url=None):
            self.vistas.append((estado, list(preguntas.items()), timeout))
            return respuesta

        setattr(falso, "decidir_con_laya", decidir_con_laya)
        sys.modules["jev"] = falso

    def test_con_local_rapido_decide_su_eleccion(self):
        self.falso_jev({"hab": RESPUESTA_TDD, "motor": "laya-local"})
        prompt = h.con_habilidad_viva("Base", {"titulo": "sin palabras clave", "prompt": ""})
        self.assertIn(TARJ_TDD, prompt)
        estado, preguntas, tope = self.vistas[0]
        self.assertEqual(estado["tarea"]["prompt"], "")
        self.assertEqual(preguntas[0][0], "hab")
        self.assertEqual(preguntas[0][1]["type"], "choice")
        self.assertLessEqual(tope, 1.5)  # dos locales ⇒ ≤ 3 s (contrato §2)

    def test_sin_local_deciden_las_palabras(self):
        self.falso_jev(None)  # sin locales arriba, o hablando con Astraura
        prompt = h.con_habilidad_viva("Base", {"titulo": "arregla el error", "prompt": ""})
        self.assertIn(TARJ_DIAG, prompt)


if __name__ == "__main__":
    unittest.main()

