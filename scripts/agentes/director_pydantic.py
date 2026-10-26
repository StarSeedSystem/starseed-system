#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director tipado de ejemplo (AGF1023C) sobre el puente de modelos propio.

Contrato (``architecture/repos-3d-oido-agentes-1023.md`` §3): un solo contrato de agente y
varios motores; los modelos entran SIEMPRE por el enrutador propio —servidor propio de IA →
pasarela de Experiential → OpenRouter solo ``:free``—. Este director no enciende trazas de
terceros ni habla con nubes de los autores: Pydantic AI solo valida la salida.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, Field

try:
    from .modelos_propios import cliente_openai_compatible
except ImportError:
    from modelos_propios import cliente_openai_compatible

ACCIONES = ("reintentar", "transformar", "pedir-a-alex")
CAMPOS_TAREA = ("id", "ola", "titulo", "motivo", "ultimo_error", "archivos", "depende")

INSTRUCCIONES = (
    "Eres el director de tareas bloqueadas de StarSeed. Recibes una tarea que no pudo "
    "avanzar y decides qué hacer con ella. Devuelve una prioridad de 0 a 1 (1 es lo más "
    "urgente), un motivo breve de como mucho 200 caracteres y una acción: 'reintentar' si "
    "el fallo parece pasajero, 'transformar' si hay que cambiar el enfoque o el alcance, o "
    "'pedir-a-alex' si hace falta una decisión humana. No inventes datos que no estén en la "
    "tarea."
)


class DecisionTarea(BaseModel):
    """Decisión validada: el motor no puede devolver otra forma."""

    prioridad: float = Field(ge=0.0, le=1.0, description="Urgencia de 0 a 1.")
    motivo: str = Field(min_length=1, max_length=200, description="Razón breve, ≤ 200 caracteres.")
    accion: Literal["reintentar", "transformar", "pedir-a-alex"] = Field(
        description="Qué hacer con la tarea bloqueada."
    )


class SinProveedorDeModelo(RuntimeError):
    """No hay ninguna fuente del enrutador propio disponible."""


def texto_tarea(tarea: object) -> str:
    """Convierte una tarea (dict o texto) en el prompt del director. PURO."""
    if isinstance(tarea, str):
        return tarea.strip()
    if isinstance(tarea, Mapping):
        lineas = [f"{campo}: {tarea[campo]}" for campo in CAMPOS_TAREA if tarea.get(campo)]
        return "\n".join(lineas) or str(dict(tarea))
    return str(tarea).strip()


def modelo_desde_cliente(cliente: Any) -> Any:
    """Adapta el cliente del enrutador propio al modelo de Pydantic AI (sin red aquí)."""
    if cliente is None:
        raise SinProveedorDeModelo("el enrutador propio no tiene fuentes disponibles")
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    proveedor = OpenAIProvider(base_url=cliente.base_url, api_key=cliente.clave or "sin-clave")
    return OpenAIChatModel(cliente.modelo, provider=proveedor)


def crear_director(modelo: Any = None, *, cliente: Any = None, reintentos: int = 1) -> Any:
    """Agente Pydantic AI con salida ``DecisionTarea``; el modelo, siempre el propio."""
    from pydantic_ai import Agent

    if modelo is None:
        modelo = modelo_desde_cliente(cliente or cliente_openai_compatible("decision"))
    return Agent(
        modelo,
        output_type=DecisionTarea,
        system_prompt=INSTRUCCIONES,
        retries=reintentos,
        name="director-tareas",
    )


def decidir_tarea(tarea: object, *, modelo: Any = None, cliente: Any = None) -> DecisionTarea:
    """Devuelve la decisión validada para una tarea bloqueada. Sin red si ``modelo`` se inyecta."""
    return crear_director(modelo, cliente=cliente).run_sync(texto_tarea(tarea)).output
