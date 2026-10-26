# -*- coding: utf-8 -*-
"""Director tipado pydantic: esquema validado y ejecución con TestModel/FunctionModel, sin red."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import director_pydantic as D
except ModuleNotFoundError as exc:  # por si cambia la ruta de la carpeta
    if __name__ != "__main__":
        raise unittest.SkipTest("director_pydantic no importable: " + str(exc))
    print("SKIPPED · director_pydantic no importable:", exc)
    raise SystemExit(0)

if not D.DISPONIBLE:
    _MOTIVO = ("pydantic-ai-slim[openai] no está instalado: se salta (no se instala en "
               "las pruebas) — " + D.MOTIVO_INDISPONIBLE)
    if __name__ != "__main__":
        raise unittest.SkipTest(_MOTIVO)
    print("SKIPPED ·", _MOTIVO)
    raise SystemExit(0)

TAREA = {"id": "aX1", "motivo_bloqueo": "tsc roto en salas.ts", "intentos": 2}

def _modelo_de_json(decision: dict[str, object]) -> "D.FunctionModel":
    """FunctionModel que responde siempre ese JSON: decisión controlada y cero red."""
    def _manejador(messages: "list[object]", _info: object = None) -> "D.ModelResponse":
        del messages, _info
        return D.ModelResponse(parts=[D.TextPart(
            content=json.dumps(decision, ensure_ascii=False),
        )])
    return D.FunctionModel(_manejador)


class Esquema(unittest.TestCase):
    """El esquema de la decisión: prioridad 0–1, motivo ≤ 200, acción del conjunto."""

    def test_acepta_una_decision_valida(self):
        d = D.DecisionTarea.model_validate(
            {"accion": "transformar", "prioridad": 0.7, "motivo": "tsc roto; se parte en dos"})
        self.assertEqual(d.accion, "transformar")
        self.assertAlmostEqual(d.prioridad, 0.7)

    def test_prioridad_fuera_de_0_1_se_rechaza(self):
        for mala in (-0.1, 1.5):
            with self.assertRaises(D.ValidationError):
                D.DecisionTarea.model_validate({"accion": "reintentar", "prioridad": mala, "motivo": "m"})

    def test_accion_desconocida_se_rechaza(self):
        with self.assertRaises(D.ValidationError):
            D.DecisionTarea.model_validate({"accion": "vender", "prioridad": 0.5, "motivo": "m"})

    def test_motivo_de_mas_de_200_se_rechaza(self):
        with self.assertRaises(D.ValidationError):
            D.DecisionTarea.model_validate({"accion": "reintentar", "prioridad": 0.5, "motivo": "x" * 201})

    def test_motivo_de_200_exacto_pasa(self):
        d = D.DecisionTarea.model_validate({"accion": "reintentar", "prioridad": 0.5, "motivo": "x" * 200})
        self.assertEqual(len(d.motivo), 200)


class Ejecucion(unittest.TestCase):
    """El director corre con TestModel y FunctionModel de pydantic-ai, sin red."""

    def test_function_model_devuelve_la_decision_validada(self):
        decision = {"accion": "transformar", "prioridad": 0.7, "motivo": "tsc roto: capa extra de tipado"}
        salida = asyncio.run(D.decidir(TAREA, modelo=_modelo_de_json(decision)))
        self.assertIsInstance(salida, D.DecisionTarea)
        self.assertEqual((salida.accion, salida.prioridad, salida.motivo),
                         ("transformar", 0.7, "tsc roto: capa extra de tipado"))

    def test_test_model_cabe_en_el_esquema(self):
        salida = asyncio.run(D.decidir(TAREA, modelo=D.TestModel()))
        self.assertIn(salida.accion, D.ACCIONES)
        self.assertTrue(0.0 <= salida.prioridad <= 1.0)
        self.assertLessEqual(len(salida.motivo), 200)


class Puente(unittest.TestCase):
    """Los modelos llegan por el puente de AGF1023B, nunca escritos a mano."""

    def test_el_enrutador_da_un_modelo_openai(self):
        cliente = D.ClienteOpenAI("http://127.0.0.1:4480/v1", "ollama/qwen2.5:7b", "clave-x")
        modelo = D.modelo_desde_cliente(cliente)
        self.assertIsInstance(modelo, D.OpenAIChatModel)
        self.assertEqual(modelo.model_name, "ollama/qwen2.5:7b")

    def test_cliente_sin_clave_tambien_monta_modelo(self):
        cliente = D.ClienteOpenAI("http://127.0.0.1:4480/v1", "bitnet/bitnet-b1.58")
        self.assertIsInstance(D.modelo_desde_cliente(cliente), D.OpenAIChatModel)

    def test_sin_puente_y_sin_modelo_avisa_claro(self):
        with self.assertRaises(RuntimeError) as ctx:
            D.crear_director(obtener_cliente=lambda _capacidad: None)
        self.assertIn("enrutador", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2, argv=["test_director_pydantic"])
