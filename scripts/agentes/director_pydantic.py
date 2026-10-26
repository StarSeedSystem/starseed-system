#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director tipado de ejemplo (AGF1023C): pydantic-ai sobre el puente de AGF1023B.

De una tarea bloqueada devuelve una ``DecisionTarea`` VALIDADA por pydantic:
prioridad 0–1, motivo ≤ 200 caracteres y acción ∈ {reintentar, transformar,
pedir-a-alex}. Los modelos llegan SIEMPRE por el enrutador propio (AGF1023B,
``modelos_propios``); nada de nubes de los autores. Sin la dependencia instalada,
``DISPONIBLE`` queda en False con el motivo y las pruebas se saltan: no se
instala aquí.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Callable, Literal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:  # admite la carpeta plana de scripts/agentes o el paquete scripts.agentes
    from .modelos_propios import ClienteOpenAI, cliente_openai_compatible
except ImportError:
    from modelos_propios import ClienteOpenAI, cliente_openai_compatible

try:
    from pydantic import BaseModel, Field, ValidationError
    from pydantic_ai import Agent
    from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart  # noqa: F401
    from pydantic_ai.models.function import FunctionModel
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.models.test import TestModel
    from pydantic_ai.providers.openai import OpenAIProvider
    DISPONIBLE = True
    MOTIVO_INDISPONIBLE = ""
except ImportError as exc:  # el módulo sigue importable; solo falla al usarlo
    BaseModel = Field = ValidationError = Agent = None  # type: ignore[assignment]
    ModelMessage = ModelResponse = TextPart = FunctionModel = None  # type: ignore[assignment]
    OpenAIChatModel = TestModel = OpenAIProvider = None  # type: ignore[assignment]
    DISPONIBLE = False
    MOTIVO_INDISPONIBLE = str(exc)

ACCIONES = ("reintentar", "transformar", "pedir-a-alex")

INSTRUCCIONES = (
    "Eres el director de tareas bloqueadas del enjambre StarSeed. Recibes el JSON de una tarea "
    "bloqueada y decides: «reintentar» ante fallo transitorio (red, cuotas, 429/402); "
    "«transformar» si la tarea cabe partida o con menos alcance; «pedir-a-alex» si hace falta "
    "una decisión humana. La prioridad (0–1) refleja el daño de seguir bloqueada; el motivo, "
    "200 caracteres como mucho, explica por qué. Responde solo la decisión."
)

if not DISPONIBLE:
    DecisionTarea = crear_director = modelo_desde_cliente = decidir = None  # type: ignore[misc]
else:

    class DecisionTarea(BaseModel):
        """Decisión validada del director sobre una tarea bloqueada."""

        accion: Literal["reintentar", "transformar", "pedir-a-alex"] = "reintentar"
        prioridad: float = Field(default=0.5, ge=0.0, le=1.0)
        motivo: str = Field(default="sin motivo dado", max_length=200)

    def modelo_desde_cliente(cliente: ClienteOpenAI) -> OpenAIChatModel:
        """Modelo pydantic-ai sobre un cliente OpenAI-compatible del enrutador propio."""
        # El SDK de OpenAI exige una cadena de api_key aunque no se use: "-" no revela nada.
        return OpenAIChatModel(
            cliente.modelo,
            provider=OpenAIProvider(base_url=cliente.base_url, api_key=cliente.clave or "-"),
        )

    def crear_director(
        modelo: "object | None" = None,
        *,
        obtener_cliente: Callable[[str], "ClienteOpenAI | None"] = cliente_openai_compatible,
    ) -> "Agent":
        """Director con salida tipada; sin modelo explícito va por el puente de AGF1023B."""
        if modelo is None:
            cliente = obtener_cliente("decision")
            if cliente is None:
                raise RuntimeError("el enrutador propio no tiene cliente disponible "
                                   "(servidor de IA, Experiential ni OpenRouter :free)")
            modelo = modelo_desde_cliente(cliente)
        return Agent(modelo, instructions=INSTRUCCIONES, output_type=DecisionTarea)

    async def decidir(
        tarea: "dict[str, object]",
        modelo: "object | None" = None,
        *,
        obtener_cliente: Callable[[str], "ClienteOpenAI | None"] = cliente_openai_compatible,
    ) -> DecisionTarea:
        """Decide qué hacer con una tarea bloqueada; la salida llega validada."""
        agente = crear_director(modelo, obtener_cliente=obtener_cliente)
        resultado = await agente.run(json.dumps(tarea, ensure_ascii=False))
        return resultado.output

if __name__ == "__main__":
    if not DISPONIBLE:
        raise SystemExit("pydantic-ai-slim[openai] no está instalado: " + MOTIVO_INDISPONIBLE)
    datos = json.loads(sys.stdin.read() or "{}")
    decision = asyncio.run(decidir(datos))
    print(json.dumps(decision.model_dump(mode="json"), ensure_ascii=False, sort_keys=True))
