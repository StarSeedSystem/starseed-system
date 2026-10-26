# -*- coding: utf-8 -*-
"""director_pydantic: esquema validado y motores simulados de Pydantic AI, sin red."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from pydantic_ai.exceptions import UnexpectedModelBehavior
    from pydantic_ai.messages import ModelResponse, ToolCallPart
    from pydantic_ai.models.function import AgentInfo, FunctionModel
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.models.test import TestModel

    import director_pydantic as D
    from modelos_propios import ClienteOpenAI
except ImportError as exc:  # p. ej. falta pydantic-ai-slim[openai] en esta máquina
    MOTIVO_SALTO = "falta pydantic-ai-slim[openai]: %s" % exc
else:
    MOTIVO_SALTO = None


@unittest.skipIf(MOTIVO_SALTO is not None, MOTIVO_SALTO or "")
class Esquema(unittest.TestCase):
    def test_decision_valida(self):
        decision = D.DecisionTarea(prioridad=0.5, motivo="Bloqueada por cupo", accion="reintentar")
        self.assertEqual(decision.accion, "reintentar")

    def test_prioridad_fuera_de_rango(self):
        from pydantic import ValidationError

        for mala in (-0.1, 1.1):
            with self.assertRaises(ValidationError):
                D.DecisionTarea(prioridad=mala, motivo="x", accion="reintentar")

    def test_motivo_demasiado_largo(self):
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            D.DecisionTarea(prioridad=0.5, motivo="a" * 201, accion="transformar")

    def test_accion_desconocida(self):
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            D.DecisionTarea(prioridad=0.5, motivo="x", accion="ignorar")

    def test_texto_tarea_es_puro(self):
        self.assertEqual(D.texto_tarea("  bloqueada  "), "bloqueada")
        texto = D.texto_tarea({"id": "T1", "titulo": "Contrato", "archivos": ["a.py"], "vacio": ""})
        self.assertIn("id: T1", texto)
        self.assertIn("archivos: ['a.py']", texto)
        self.assertNotIn("vacio", texto)


@unittest.skipIf(MOTIVO_SALTO is not None, MOTIVO_SALTO or "")
class Director(unittest.TestCase):
    def test_test_model_devuelve_decision_validada(self):
        modelo = TestModel(custom_output_args={
            "prioridad": 0.73, "motivo": "Cupo agotado en dos proveedores", "accion": "transformar",
        })
        decision = D.decidir_tarea({"id": "T1", "titulo": "Contrato"}, modelo=modelo)
        self.assertIsInstance(decision, D.DecisionTarea)
        self.assertEqual(decision.prioridad, 0.73)
        self.assertEqual(decision.accion, "transformar")

    def test_function_model_rellena_el_esquema(self):
        def respuesta(mensajes: object, info: AgentInfo) -> ModelResponse:
            nombre = info.output_tools[0].name
            parte = ToolCallPart(nombre, {
                "prioridad": 0.9, "motivo": "Hace falta una decisión de Alex", "accion": "pedir-a-alex",
            })
            return ModelResponse(parts=[parte])

        decision = D.decidir_tarea("bloqueada por permisos", modelo=FunctionModel(respuesta))
        self.assertEqual(decision.accion, "pedir-a-alex")
        self.assertEqual(decision.prioridad, 0.9)

    def test_funcion_model_invalida_se_rechaza(self):
        def respuesta(mensajes: object, info: AgentInfo) -> ModelResponse:
            nombre = info.output_tools[0].name
            parte = ToolCallPart(nombre, {"prioridad": 9, "motivo": "x", "accion": "ignorar"})
            return ModelResponse(parts=[parte])

        director = D.crear_director(FunctionModel(respuesta), reintentos=0)
        with self.assertRaises(UnexpectedModelBehavior):
            director.run_sync("bloqueada")

    def test_modelo_desde_cliente_usa_la_base_del_enrutador(self):
        cliente = ClienteOpenAI("http://127.0.0.1:4480/v1", "qwen-coder", "clave-falsa")
        modelo = D.modelo_desde_cliente(cliente)
        self.assertIsInstance(modelo, OpenAIChatModel)
        self.assertEqual(modelo.model_name, "qwen-coder")
        self.assertEqual(str(modelo.client.base_url).rstrip("/"), "http://127.0.0.1:4480/v1")
        self.assertNotIn("clave-falsa", repr(cliente))

    def test_sin_cliente_avisa(self):
        with self.assertRaises(D.SinProveedorDeModelo):
            D.modelo_desde_cliente(None)


if __name__ == "__main__":
    unittest.main()
