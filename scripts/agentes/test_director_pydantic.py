# -*- coding: utf-8 -*-
"""director_pydantic: decisiones validadas con TestModel/FunctionModel, sin red."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_pydantic as D  # noqa: E402

try:
    import pydantic_ai  # noqa: F401
    HAY_PYDANTIC_AI = True
except ImportError:
    HAY_PYDANTIC_AI = False

SIN_DEPENDENCIA = (
    "pydantic-ai no está instalado (pip install 'pydantic-ai-slim[openai]'); "
    "esta prueba se salta sin instalar nada"
)

class Decision(unittest.TestCase):
    def test_valida_y_normaliza(self):
        d = D.DecisionTarea(0.8, "  el fallo era pasajero  ", "reintentar")
        self.assertEqual(d.prioridad, 0.8)
        self.assertEqual(d.motivo, "el fallo era pasajero")
        self.assertEqual(d.accion, "reintentar")
        self.assertEqual(d.como_dict()["accion"], "reintentar")

    def test_prioridad_fuera_de_rango(self):
        for valor in (-0.1, 1.1, True, "alta", None):
            with self.assertRaises(ValueError):
                D.DecisionTarea(valor, "motivo", "transformar")  # type: ignore[arg-type]

    def test_motivo_vacio_o_demasiado_largo(self):
        with self.assertRaises(ValueError):
            D.DecisionTarea(0.5, "   ", "reintentar")
        with self.assertRaises(ValueError):
            D.DecisionTarea(0.5, "x" * (D.MAX_MOTIVO + 1), "reintentar")
        self.assertEqual(len(D.DecisionTarea(0.5, "x" * D.MAX_MOTIVO, "reintentar").motivo), 200)

    def test_accion_desconocida(self):
        with self.assertRaises(ValueError):
            D.DecisionTarea(0.5, "motivo", "ignorar")  # type: ignore[arg-type]

class Indicacion(unittest.TestCase):
    def test_incluye_la_ficha_y_las_acciones(self):
        texto = D.construir_indicacion(
            {"id": "AGF1", "titulo": "Directorio", "motivo": "tsc rojo", "intentos": 2}
        )
        self.assertIn("Id: AGF1", texto)
        self.assertIn("Título: Directorio", texto)
        self.assertIn("Motivo del bloqueo: tsc rojo", texto)
        self.assertIn("Intentos: 2", texto)
        self.assertIn("pedir-a-alex", texto)

    def test_acepta_texto_plano_y_corta_los_campos(self):
        self.assertIn("Tarea bloqueada", D.construir_indicacion("  se colgó  "))
        texto = D.construir_indicacion({"titulo": "x" * 2000})
        self.assertLessEqual(len(texto.split("Título: ", 1)[1]), D.MAX_TEXTO)

class Conversion(unittest.TestCase):
    def test_desde_dict_modelo_y_objeto(self):
        plano = {"prioridad": 0.25, "motivo": "reduce el alcance", "accion": "transformar"}
        self.assertEqual(D.a_decision(plano).accion, "transformar")

        class ConDump:
            def model_dump(self):
                return plano

        class ConCampos:
            prioridad = 0.25
            motivo = "reduce el alcance"
            accion = "transformar"

        self.assertEqual(D.a_decision(ConDump()).prioridad, 0.25)
        self.assertEqual(D.a_decision(ConCampos()).motivo, "reduce el alcance")

    def test_salida_invalida_se_rechaza(self):
        with self.assertRaises(ValueError):
            D.a_decision({"prioridad": 2, "motivo": "x", "accion": "reintentar"})
        with self.assertRaises(ValueError):
            D.a_decision({"prioridad": 0.4, "motivo": "x", "accion": "ignorar"})

@unittest.skipUnless(HAY_PYDANTIC_AI, SIN_DEPENDENCIA)
class ConPydanticAI(unittest.TestCase):
    def test_test_model_devuelve_una_decision_valida(self):
        from pydantic_ai.models.test import TestModel

        args = {"prioridad": 0.9, "motivo": "la cuota se reinició", "accion": "reintentar"}
        modelo = TestModel(custom_output_args=args)
        agente = D.crear_agente(modelo)
        decision = D.decidir_tarea({"id": "AGF1", "motivo": "429"}, agente=agente)
        self.assertEqual(decision.prioridad, 0.9)
        self.assertEqual(decision.accion, "reintentar")
        self.assertLessEqual(len(decision.motivo), D.MAX_MOTIVO)

    def test_function_model_respeta_el_esquema(self):
        from pydantic_ai.messages import ModelResponse, ToolCallPart
        from pydantic_ai.models.function import FunctionModel

        def responder(_mensajes, info):
            salidas = getattr(info, "output_tools", None) or []
            nombre = getattr(salidas[0], "name", "final_result") if salidas else "final_result"
            args = {"prioridad": 0.3, "motivo": "hace falta una decisión humana",
                    "accion": "pedir-a-alex"}
            return ModelResponse(parts=[ToolCallPart(nombre, args)])

        agente = D.crear_agente(FunctionModel(responder))
        decision = D.decidir_tarea({"id": "AGF2", "titulo": "Revisión"}, agente=agente)
        self.assertEqual(decision.como_dict()["accion"], "pedir-a-alex")
        self.assertEqual(decision.prioridad, 0.3)

if __name__ == "__main__":
    unittest.main()
