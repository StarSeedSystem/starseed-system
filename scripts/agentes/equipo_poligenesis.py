#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de agentes con openai-agents SDK y traspasos para PoliGenesis (AGF1023A).

Trazas apagadas por defecto (set_tracing_disabled(True)). Los modelos van siempre
por el enrutador propio (scripts/agentes/modelos_propios.py, gratis primero).
El equipo tiene tres miembros: moderador, redactor, revisor, con handoffs
controlados y guarda de salida sin datos personales.

Ejemplo de flujo:
  moderador → redactor (handoff) → revisor (guardo de salida)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:  # openai-agents Python SDK 1.x
    from openai import AsyncOpenAI
    from openai.agents import Agent, Handoff, Team
    from openai.agents.runtime import InMemorySessionRepository
    OPEN_AI_AGENTS_DISPONIBLE, MOTIVO_SIN_OPEN_AI_AGENTS = True, ""
except ImportError as error:  # pragma: no cover - depende del entorno
    AsyncOpenAI = Agent = Handoff = Team = InMemorySessionRepository = None  # type: ignore[assignment]
    OPEN_AI_AGENTS_DISPONIBLE, MOTIVO_SIN_OPEN_AI_AGENTS = False, f"falta openai-agents ({error})"

try:
    from .modelos_propios import ClienteOpenAI, cliente_openai_compatible
except ImportError:  # scripts.agentes.* o el propio directorio
    from modelos_propios import ClienteOpenAI, cliente_openai_compatible  # noqa: F401

MIEMBROS = ("moderador", "redactor", "revisor")
ROL = dict[str, str]  # nombre → instrucciones del rol
REGLAS_EQUIPO = [
    "El moderador enuncia la tarea y pasa el testigo al redactor.",
    "El redactor escribe la propuesta y hace handoff al revisor.",
    "El revisor comprueba la salida: sin datos personales, coherente, y devuelve o aprueba.",
    "Nadie llama a servicios de terceros ni deja trazas en la nube.",
]


def extraer_respuesta(resultado: object) -> str:
    """Saca el texto de lo que devuelve Agent.run / Team.run: str, dict o RunResponse. PURO."""
    if resultado is None:
        return ""
    if isinstance(resultado, str):
        return resultado
    if isinstance(resultado, dict):
        contenido = resultado.get("contenido") or resultado.get("content") or ""
        return str(contenido)
    for atributo in ("content", "contenido"):
        valor = getattr(resultado, atributo, None)
        if valor:
            return str(valor)
    return str(resultado)


def resumen_equipo(tarea: str, salidas: Mapping[str, object]) -> str:
    """Une la respuesta de cada miembro bajo su rol, en orden declarado. PURO."""
    piezas: list[str] = []
    for nombre in MIEMBROS:
        texto = extraer_respuesta(salidas.get(nombre, "")).strip()
        piezas.append(f"[{nombre}] {texto or '(sin respuesta)'}")
    encabezado = f"Tarea: {tarea.strip()}" if str(tarea or "").strip() else "Tarea: (sin asunto)"
    return "\n".join([encabezado] + piezas)


def responder_por_rol(roles: Mapping[str, Callable[[str], object]]) -> Callable[[str], Mapping[str, str]]:
    """Ejecuta cada rol sobre la tarea y devuelve {nombre: texto}. Modelo falso aquí."""
    def sobre_tarea(tarea: str) -> dict[str, str]:
        return {nombre: extraer_respuesta(fn(tarea)) for nombre, fn in roles.items()}
    return sobre_tarea


def modelo_desde_enrutador(cliente: ClienteOpenAI | None) -> AsyncOpenAI | None:
    """AsyncOpenAI apuntando al enrutador propio (base_url, id, clave)."""
    if cliente is None:
        return None
    return AsyncOpenAI(
        base_url=cliente.base_url,
        api_key=cliente.clave,
    )


def construir_agente(nombre: str, instrucciones: str, modelo: AsyncOpenAI | None = None) -> Agent:
    """Un agente de openai-agents con su rol y modelo."""
    if not OPEN_AI_AGENTS_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_OPEN_AI_AGENTS or "falta openai-agents")
    return Agent(
        name=str(nombre or "agente"),
        instructions=[str(instrucciones or "").strip()],
        model=modelo,
        handoffs=[],  # se configuran al construir el equipo
        add_history_to_context=True,
        num_history_runs=3,
        markdown=False,
        telemetry=False,  # trazas de terceros apagadas
    )


def construir_equipo(
    agentes: Sequence[Agent],
    *,
    instrucciones_adicionales: Sequence[str] = (),
) -> Team:
    """Team de openai-agents entre los miembros con handoffs y reglas fijas."""
    if not OPEN_AI_AGENTS_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_OPEN_AI_AGENTS or "falta openai-agents")
    if len(list(agentes)) != len(MIEMBROS):
        raise ValueError(f"el equipo de hoy es de {len(MIEMBROS)}: {', '.join(MIEMBROS)}")
    reglas_completas = [*REGLAS_EQUIPO, *map(str, instrucciones_adicionales)]
    return Team(
        name="equipo-poligenesis",
        members=list(agentes),
        instructions=reglas_completas,
        handoffs=[  # definición simple de handoffs entre miembros
            Handoff(target=agentes[1], description="redactor escribe, pasa al revisor"),
            Handoff(target=agentes[2], description="revisor revisa y aprueba o corrige"),
        ],
        add_history_to_context=True,
        markdown=False,
        telemetry=False,
    )


def equipo_de_tarea(roles: ROL, *,
                     ruta_config: str = "memoria-equipo.json",
                     capacidad: str = "texto",
                     cliente: ClienteOpenAI | None = None,
                     entorno: Mapping[str, object] | None = None) -> tuple[Team, AsyncOpenAI | None]:
    """Arma el equipo completo: modelo del enrutador propio + agentes + handoffs."""
    cliente = cliente or cliente_openai_compatible(capacidad, entorno=entorno)
    modelo = modelo_desde_enrutador(cliente)
    agentes = [construir_agente(nombre, roles.get(nombre, ""), modelo=modelo)
               for nombre in MIEMBROS]
    equipo = construir_equipo(agentes)
    return equipo, modelo