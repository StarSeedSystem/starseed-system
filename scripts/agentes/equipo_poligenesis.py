#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de ejemplo de PoliGenesis con el SDK de OpenAI Agents (AGF1023D).

Moderador → redactor de propuesta → revisor con guarda de salida sin datos
personales. Trazas del SDK apagadas (``set_tracing_disabled(True)``) y modelos
siempre por el puente de AGF1023B: nada de LangSmith ni nubes de los autores
(SOP §3, architecture/repos-3d-oido-agentes-1023.md). Si falta la dependencia
``openai-agents``, el módulo carga igual: solo falla la construcción, y la
prueba correspondiente salta con motivo.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

try:
    from .modelos_propios import ClienteOpenAI
except ImportError:  # ejecución como script suelto
    from modelos_propios import ClienteOpenAI

# ── Parte pura: sin SDK, sin red ─────────────────────────────────────────────

ROLES = ("moderador", "redactor", "revisor")

INSTRUCCIONES: dict[str, str] = {
    "moderador": (
        "Recibe la petición de la persona, la acota a lo que pide y "
        "la traspasa al redactor sin añadir tu opinión."
    ),
    "redactor": (
        "Escribe una propuesta breve y concreta con lo que el moderador "
        "te traspasó. Sin datos personales letra por letra; pasa al revisor."
    ),
    "revisor": (
        "Revisa la propuesta: tono cuidado y cero datos personales. "
        "Devuélvela corregida como respuesta final."
    ),
}

PATRONES_DATOS = (
    r"[\w.+-]+@[\w-]+\.[\w.-]+",           # correo
    r"(?<!\d)(\d[ -]?){8,11}\d(?!\d)",     # teléfono (9 dígitos españoles o más)
    r"(?<!\d)\d{7,8}[ -]?[A-Za-z](?!\w)",  # documento con letra final
)


def datos_personales_presentes(texto: str) -> bool:
    """Correos, teléfonos o documentos en el texto: guarda sin datos personales."""
    t = str(texto or "")
    return any(re.search(p, t) for p in PATRONES_DATOS)


@dataclass(frozen=True)
class Traspaso:
    """Lazo de la cadena del equipo: quién se lo pasa a quién."""

    desde: str
    hacia: str


def traspasos_del_equipo() -> tuple[Traspaso, ...]:
    """Cadena de ejemplo: moderador → redactor → revisor. PURO."""
    return (Traspaso("moderador", "redactor"), Traspaso("redactor", "revisor"))


def modelos_por_rol(especificados: Mapping[str, str] | Sequence[str] | None,
                    por_defecto: str) -> dict[str, str]:
    """Modelo por rol: dict con huecos, secuencia por orden de ROLES o el defecto."""
    roles = ROLES
    if isinstance(especificados, dict):
        return {r: especificados.get(r) or por_defecto for r in roles}
    lista = list(especificados or [])
    return {r: (lista[i] if i < len(lista) and lista[i] else por_defecto)
            for i, r in enumerate(roles)}


# ── Parte con SDK: se importa al construir, no al cargar el módulo ───────────


def _guarda_salida_sdk():
    """Guarda de salida del equipo: bloquea si hay datos personales."""
    from agents import GuardrailFunctionOutput, OutputGuardrail

    async def revisar_salida(_ctx, _agente, salida):  # firma del SDK
        texto = getattr(salida, "final_output", salida)
        presente = datos_personales_presentes(str(texto))
        return GuardrailFunctionOutput(
            output_info={"datos_personales": presente},
            tripwire_triggered=presente,
        )

    return OutputGuardrail(guardrail_function=revisar_salida)


def equipo_poligenesis(
    base_url: str | None = None,
    api_key: str = "",
    modelos: Mapping[str, str] | Sequence[str] | None = None,
    *,
    puente: Callable[..., ClienteOpenAI | None] | None = None,
):
    """Construye moderador → redactor → revisor y devuelve el moderador.

    ``puente`` se llama como ``cliente_openai_compatible`` del puente de
    AGF1023B; si no hay ni ``base_url`` ni ``puente``, ValueError.
    """
    from agents import Agent, set_default_openai_client, set_tracing_disabled
    from openai import AsyncOpenAI

    if base_url:
        cliente = AsyncOpenAI(base_url=base_url, api_key=api_key or "sin-clave")
        por_defecto = ""
    elif puente is not None:
        hallado = puente("texto")
        if hallado is None:
            raise RuntimeError("el puente no devolvió ningún modelo: sin relevo")
        cliente = AsyncOpenAI(base_url=hallado.base_url, api_key=hallado.clave or "sin-clave")
        por_defecto = hallado.modelo
    else:
        raise ValueError("sin base_url ni puente no hay a dónde mandar los modelos")
    set_default_openai_client(cliente)
    set_tracing_disabled(True)  # trazas del SDK apagadas (SOP §3)

    por_rol = modelos_por_rol(modelos, por_defecto)
    guarda = _guarda_salida_sdk()
    revisor = Agent(
        name="revisor",
        instructions=INSTRUCCIONES["revisor"],
        model=por_rol["revisor"],
        output_guardrails=[guarda],
    )
    redactor = Agent(
        name="redactor",
        instructions=INSTRUCCIONES["redactor"],
        model=por_rol["redactor"],
        handoffs=[revisor],
        output_guardrails=[guarda],
    )
    return Agent(
        name="moderador",
        instructions=INSTRUCCIONES["moderador"],
        model=por_rol["moderador"],
        handoffs=[redactor],
    )
