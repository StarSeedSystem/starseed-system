#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de dos agentes Agno con memoria compartida en SQLite local (AGF1023G).

SOP ``architecture/repos-3d-oido-agentes-1023.md`` §3: un contrato de agente y
varios motores. Aquí ``agno`` (Apache-2.0): dos miembros comparten UNA base
SQLite local, sin AgentOS en la nube ni servicios de agno.com; trazas de
terceros apagadas (``AGNO_TELEMETRY``). El modelo sale SIEMPRE del puente del
enrutador propio (``modelos_propios.py``, AGF1023B): gratis primero, relevo
ante 429/402, jamás una clave en el código. Parte pura hasta ``montar_equipo``,
que acepta el módulo agno inyectable (falso en las pruebas): si falta la
dependencia, la prueba se salta con motivo.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

try:  # admite ``import equipo_agno`` y ``scripts.agentes.equipo_agno``
    from .modelos_propios import ClienteOpenAI  # type: ignore[no-redef]
except ImportError:  # pragma: no cover
    from modelos_propios import ClienteOpenAI  # type: ignore[assignment]

TELEMETRIA = "AGNO_TELEMETRY"


@dataclass(frozen=True)
class Miembro:
    """Un miembro del equipo: quién es (rol) y qué hace (instrucciones)."""

    nombre: str
    rol: str
    instrucciones: tuple[str, ...]
    capacidad: str = "texto"


@dataclass(frozen=True)
class EspecEquipo:
    """Lo que el contrato pide al motor, ANTES de tocar la biblioteca agno."""

    nombre: str
    miembros: tuple[Miembro, ...]
    ruta_memoria: str
    cliente: ClienteOpenAI


def ruta_memoria(directorio: str, nombre: str) -> str:
    """Ruta de la base SQLite del equipo: ``memoria-<slug>.sqlite``. PURA."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(nombre or "equipo").lower()).strip("-") or "equipo"
    return str(Path(directorio) / f"memoria-{slug}.sqlite")


def especificar_equipo(nombre: str, escritor: Miembro, verificador: Miembro,
                       cliente: ClienteOpenAI, directorio_memoria: str) -> EspecEquipo:
    """Especificación pura del equipo de dos. PURA."""
    return EspecEquipo(nombre, (escritor, verificador),
                       ruta_memoria(directorio_memoria, nombre), cliente)


def apagar_telemetria(entorno: dict[str, str] | None = None) -> None:
    """Trazas de terceros apagadas (SOP §3): ``AGNO_TELEMETRY=False``."""
    destino = os.environ if entorno is None else entorno
    destino[TELEMETRIA] = "False"


def modelo_del_cliente(modulo: object, cliente: ClienteOpenAI) -> object:
    """OpenAIChat de agno desde el cliente del enrutador propio (AGF1023B).

    Nunca agno.com; si el cliente viene del servidor propio sin token, no se
    manda ninguna clave.
    """
    return getattr(modulo, "OpenAIChat")(
        id=cliente.modelo, base_url=cliente.base_url, api_key=cliente.clave or None)


def memoria_sqlite(modulo: object, ruta: str) -> object:
    """La memoria compartida: UN archivo SQLite del disco local, nada más."""
    return getattr(modulo, "SqliteDb")(db_file=str(ruta))


def kwargs_miembro(miembro: Miembro, modelo: object, memoria: object) -> dict[str, object]:
    """Argumentos de cada miembro del equipo. PURA."""
    return {"name": miembro.nombre, "role": miembro.rol,
            "instructions": list(miembro.instrucciones),
            "model": modelo, "db": memoria}


def kwargs_equipo(spec: EspecEquipo, modelo: object, memoria: object,
                  miembros: list[object]) -> dict[str, object]:
    """Argumentos del Team: dos miembros todos con la MISMA memoria. PURA."""
    return {"name": spec.nombre, "model": modelo, "members": miembros,
            "db": memoria,
            "instructions": ["Dos agentes: uno escribe, el otro verifica; la "
                             "memoria se comparte entre todos en el mismo SQLite."]}


def _agno_real() -> object:
    """Importa agno a un espacio de nombres fungible; si falta, se avisa."""
    try:
        from agno.agent import Agent
        from agno.db.sqlite import SqliteDb
        from agno.models.openai import OpenAIChat
        from agno.team import Team
    except ImportError as e:  # motivo del salto en la prueba
        raise ImportError("agno no está instalado (pip install agno)") from e
    from types import SimpleNamespace
    return SimpleNamespace(Agent=Agent, SqliteDb=SqliteDb,
                           OpenAIChat=OpenAIChat, Team=Team)


def montar_equipo(spec: EspecEquipo, modulo_agno: object | None = None,
                  modelo: object | None = None) -> object:
    """Equipo vivo: dos miembros, memoria SQLite local y modelo del puente.

    ``modulo_agno`` es el módulo agno (o uno falso en las pruebas). Sin modelo
    dado, se construye del cliente del enrutador propio; nunca una nube de los
    autores.
    """
    modulo = modulo_agno or _agno_real()
    apagar_telemetria()
    memoria = memoria_sqlite(modulo, spec.ruta_memoria)
    modelo = modelo or modelo_del_cliente(modulo, spec.cliente)
    miembros = [getattr(modulo, "Agent")(**kwargs_miembro(m, modelo, memoria))
                for m in spec.miembros]
    return getattr(modulo, "Team")(**kwargs_equipo(spec, modelo, memoria, miembros))
