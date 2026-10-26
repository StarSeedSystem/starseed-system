#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de dos agentes con agno y memoria compartida en SQLite local (AGF1023G).

Nada de AgentOS en la nube ni de servicios de agno.com: la memoria vive en un
archivo SQLite de la máquina. Los modelos van SIEMPRE por el enrutador propio
(``scripts/agentes/modelos_propios.py``, gratis primero). El equipo se arma con
miembros y modelos inyectados: las pruebas no tocan red ni llaman a ningún
modelo (modelo falso).
"""
from __future__ import annotations

from typing import Callable, Mapping, Sequence

try:  # agno 3.x
    from agno.agent import Agent
    from agno.db.sqlite import SqliteDb
    from agno.models.openai import OpenAIChat
    from agno.team import Team
    AGNO_DISPONIBLE, MOTIVO_SIN_AGNO = True, ""
except ImportError as error:  # pragma: no cover - depende del entorno
    Agent = Team = SqliteDb = OpenAIChat = None  # type: ignore[assignment]
    AGNO_DISPONIBLE, MOTIVO_SIN_AGNO = False, f"falta agno ({error})"

try:
    from .modelos_propios import ClienteOpenAI, cliente_openai_compatible
except ImportError:  # scripts.agentes.* o el propio directorio
    from modelos_propios import ClienteOpenAI, cliente_openai_compatible  # noqa: F401

MIEMBROS = ("redactor", "revisor")
ROL = dict[str, str]           # nombre → instrucciones del rol
REGLAS_EQUIPO = [
    "El redactor escribe la respuesta y el revisor la comprueba y la corrige.",
    "Solo manda al revisor lo que mejore el resultado; nada de traza ni de nube de agno.com.",
]


def extraer_respuesta(resultado: object) -> str:
    """Saca el texto de lo que devuelve Team/Agent.run: str, dict o RunResponse. PURO."""
    if resultado is None:
        return ""
    if isinstance(resultado, str):
        return resultado
    if isinstance(resultado, Mapping):
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


def memoria_sqlite(ruta_db: str):
    """SqliteDb local de agno; fuera de la máquina no hay memoria."""
    if not AGNO_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_AGNO or "falta agno")
    return SqliteDb(db_file=str(ruta_db or "").strip() or "memoria-equipo.sqlite")


def modelo_desde_enrutador(cliente):
    """agno OpenAIChat apuntando al enrutador propio (base_url, id, clave)."""
    if not AGNO_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_AGNO or "falta agno")
    if cliente is None:
        return None
    return OpenAIChat(id=cliente.modelo, base_url=cliente.base_url, api_key=cliente.clave)


def construir_agente(nombre: str, instrucciones: str, modelo, db=None):
    """Un agente de agno con su rol, el modelo del enrutador y la memoria local."""
    if not AGNO_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_AGNO or "falta agno")
    return Agent(
        name=str(nombre or "agente"),
        role=f"{str(nombre or 'agente').strip()}",
        instructions=[str(instrucciones or "").strip()],
        model=modelo,
        db=db,
        markdown=False,
        telemetry=False,   # trazas de terceros apagadas
        add_history_to_context=True,
        num_history_runs=3,
    )


def construir_equipo(miembros: Sequence, db, instrucciones: Sequence[str] = ()):
    """Team de agno entre los dos miembros con memoria compartida y reglas fijas."""
    if not AGNO_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_AGNO or "falta agno")
    if len(list(miembros)) != 2:
        raise ValueError("el equipo de hoy es de dos: redactor y revisor")
    return Team(
        name="equipo-atraura",
        members=list(miembros),
        instructions=[*REGLAS_EQUIPO, *map(str, instrucciones)],
        db=db,
        markdown=False,
        telemetry=False,
    )


def equipo_de_tarea(roles: ROL, *,
                    ruta_db: str = "memoria-equipo.sqlite",
                    capacidad: str = "texto",
                    cliente=None,
                    entorno: Mapping[str, object] | None = None):
    """Arma el equipo completo: modelo del enrutador propio + agentes + memoria."""
    cliente = cliente or cliente_openai_compatible(capacidad, entorno=entorno)
    db = memoria_sqlite(ruta_db)
    agentes = [construir_agente(nombre, roles.get(nombre, ""), cliente, db=db)
               for nombre in MIEMBROS]
    return construir_equipo(agentes, db), cliente
