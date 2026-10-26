#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de PoliGenesis con OpenAI Agents SDK (AGF1023A) sobre el enrutador propio.

Contrato (``architecture/repos-3d-oido-agentes-1023.md`` §3): moderador → redactor de
propuesta → revisor. Los modelos entran SIEMPRE por el enrutador propio (AGF1023B) con un
``AsyncOpenAI`` de base_url propia; las trazas de terceros quedan apagadas y la guarda del
revisor veta cualquier salida con datos personales. Sin red si se inyecta el modelo.
"""
from __future__ import annotations

import re
from typing import Any

from agents import (
    Agent,
    GuardrailFunctionOutput,
    OpenAIChatCompletionsModel,
    RunConfig,
    Runner,
    output_guardrail,
    set_tracing_disabled,
)
from openai import AsyncOpenAI

try:
    from .modelos_propios import ClienteOpenAI, cliente_openai_compatible
except ImportError:
    from modelos_propios import ClienteOpenAI, cliente_openai_compatible

INSTRUCCIONES_MODERADOR = (
    "Eres el moderador de PoliGenesis. Escucha la petición de la persona, ordénala y "
    "traslada el encargo al redactor de propuesta sin añadir datos personales ni inventar "
    "hechos que no estén en la petición."
)
INSTRUCCIONES_REDACTOR = (
    "Eres el redactor de propuestas de PoliGenesis. Escribe una propuesta breve, concreta y "
    "accionable a partir del encargo del moderador. No incluyas correos, teléfonos, DNI, "
    "NIE ni IBAN; describe a las personas por su papel."
)
INSTRUCCIONES_REVISOR = (
    "Eres el revisor de PoliGenesis. Comprueba que la propuesta responde al encargo, que no "
    "contiene datos personales y que se puede ejecutar. Si algo falla, dilo con claridad; si "
    "está bien, devuelve la propuesta aprobada."
)

PATRONES = (
    ("correo", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("teléfono", re.compile(r"(?<!\d)(?:\+34[\s.-]?)?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)")),
    ("DNI/NIE", re.compile(r"\b(?:\d{8}[A-Za-z]|[XYZxyz]\d{7}[A-Za-z])\b")),
    ("IBAN", re.compile(r"\bES\d{2}[\s-]?(?:\d{4}[\s-]?){5}\b")),
)


class SinProveedorDeModelo(RuntimeError):
    """El enrutador propio no tiene ninguna fuente disponible."""


def tipos_datos_personales(texto: object) -> list[str]:
    """Tipos de dato personal encontrados en el texto, sin repetir. PURO."""
    cuerpo = str(texto or "")
    return [nombre for nombre, patron in PATRONES if patron.search(cuerpo)]


def modelo_desde_cliente(cliente: ClienteOpenAI | None = None) -> Any:
    """Modelo del SDK apuntando al cliente del enrutador propio (sin red aquí)."""
    cliente = cliente or cliente_openai_compatible("texto")
    if cliente is None:
        raise SinProveedorDeModelo("el enrutador propio no tiene fuentes disponibles")
    set_tracing_disabled(True)
    conexion = AsyncOpenAI(base_url=cliente.base_url, api_key=cliente.clave or "sin-clave")
    return OpenAIChatCompletionsModel(model=cliente.modelo, openai_client=conexion)


@output_guardrail(name="sin_datos_personales")
def guarda_sin_datos_personales(contexto: Any, agente: Agent[Any], salida: Any) -> GuardrailFunctionOutput:
    """Veta la salida final del revisor si contiene datos personales."""
    tipos = tipos_datos_personales(getattr(salida, "output", salida))
    return GuardrailFunctionOutput(output_info={"tipos": tipos}, tripwire_triggered=bool(tipos))


def crear_equipo(modelo: Any = None, *, cliente: ClienteOpenAI | None = None) -> Agent[Any]:
    """Equipo con traspasos moderador → redactor → revisor (este con guarda)."""
    if modelo is None:
        modelo = modelo_desde_cliente(cliente)
    revisor = Agent(
        name="revisor",
        handoff_description="Revisa la propuesta y veta los datos personales.",
        instructions=INSTRUCCIONES_REVISOR,
        model=modelo,
        output_guardrails=[guarda_sin_datos_personales],
    )
    redactor = Agent(
        name="redactor",
        handoff_description="Redacta la propuesta a partir del encargo.",
        instructions=INSTRUCCIONES_REDACTOR,
        model=modelo,
        handoffs=[revisor],
    )
    return Agent(
        name="moderador",
        handoff_description="Ordena la petición y la pasa al redactor.",
        instructions=INSTRUCCIONES_MODERADOR,
        model=modelo,
        handoffs=[redactor],
    )


def atender(peticion: str, *, modelo: Any = None, cliente: ClienteOpenAI | None = None,
            max_turnos: int = 8) -> Any:
    """Ejecuta el equipo de principio a fin; las trazas quedan apagadas. Devuelve RunResult."""
    set_tracing_disabled(True)
    equipo = crear_equipo(modelo, cliente=cliente)
    return Runner.run_sync(equipo, peticion, max_turns=max_turnos,
                           run_config=RunConfig(tracing_disabled=True))
