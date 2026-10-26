#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de dos agentes Agno con memoria compartida en SQLite local (AGF1023G)."""
from __future__ import annotations
import os
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
try:
    from .modelos_propios import ClienteOpenAI, cliente_openai_compatible
except ImportError:
    from modelos_propios import ClienteOpenAI, cliente_openai_compatible
RAIZ = "starseed_memory_root/agno"
NOMBRE_DB = "equipo.sqlite3"
ENTORNO_LOCAL = {"AGNO_TELEMETRY": "false", "OTEL_SDK_DISABLED": "true"}
@dataclass(frozen=True)
class AgenteDelEquipo:
    id: str
    name: str
    persona: str
    description: str = ""
    capabilities: tuple[str, ...] = ()
    role: str = "member"
    capacity: str = "texto"
    temperature: float | None = None
    @classmethod
    def desde_contrato(cls, datos: Mapping[str, object]) -> "AgenteDelEquipo":
        prefs = datos.get("model") if isinstance(datos.get("model"), Mapping) else {}
        caps = datos.get("capabilities")
        validas = caps if isinstance(caps, (list, tuple)) else ()
        return cls(
            id=_texto(datos.get("id"), "agente"),
            name=_texto(datos.get("name"), "Agente"),
            persona=_texto(datos.get("persona"), ""),
            description=_texto(datos.get("description"), ""),
            capabilities=tuple(c for c in validas if isinstance(c, str)),
            role=_texto(datos.get("role"), "member"),
            capacity=_texto(datos.get("capacity"), "texto"),
            temperature=_temperatura(prefs.get("temperature")),
        )
def _texto(valor: object, defecto: str) -> str:
    return valor.strip() if isinstance(valor, str) and valor.strip() else defecto
def _temperatura(valor: object) -> float | None:
    if isinstance(valor, (int, float)) and not isinstance(valor, bool) and 0 <= valor <= 2:
        return float(valor)
    return None
def ruta_memoria(raiz: str | Path | None = None) -> Path:
    base = raiz or os.environ.get("STARSEED_AGNO_DIR") or RAIZ
    return Path(base).expanduser() / NOMBRE_DB
def equipo_por_defecto() -> tuple[AgenteDelEquipo, AgenteDelEquipo]:
    return (
        AgenteDelEquipo("agno-planifica", "Planificador",
                        "Descompones el encargo en pasos y repartes el trabajo.",
                        "Coordina al equipo y decide el siguiente paso.",
                        ("research", "pm"), "lead", "razon"),
        AgenteDelEquipo("agno-ejecuta", "Ejecutor",
                        "Resuelves el paso encomendado y devuelves el resultado.",
                        "Ejecuta el paso y comparte lo aprendido.",
                        ("research",), "member", "texto"),
    )
def aplicar_entorno_local(entorno: dict[str, str] | None = None) -> dict[str, str]:
    destino = os.environ if entorno is None else entorno
    for clave, valor in ENTORNO_LOCAL.items():
        destino[clave] = valor
    return {clave: destino[clave] for clave in ENTORNO_LOCAL}
@dataclass
class EquipoAgno:
    team: object
    db: object
    memoria: object
    agentes: tuple[object, ...]
    ruta: Path
    def responder(self, mensaje: str) -> str:
        salida = self.team.run(mensaje)
        return str(getattr(salida, "content", "") or "")
def _modelo_de(cliente: ClienteOpenAI, agente: AgenteDelEquipo) -> object:
    from agno.models.openai import OpenAILike
    return OpenAILike(id=cliente.modelo, base_url=cliente.base_url,
                      api_key=cliente.clave or "no-hace-falta",
                      temperature=agente.temperature)
def _cliente_del_enrutador(entorno: Mapping[str, object] | None):
    return lambda agente: cliente_openai_compatible(agente.capacity, entorno=entorno)
def construir_equipo(
    agentes: Sequence[AgenteDelEquipo] | None = None, *,
    ruta_db: str | Path | None = None,
    entorno: Mapping[str, object] | None = None,
    fabrica_cliente: Callable[[AgenteDelEquipo], ClienteOpenAI | None] | None = None,
    fabrica_modelo: Callable[[ClienteOpenAI, AgenteDelEquipo], object] | None = None,
    user_id: str = "starseed",
) -> EquipoAgno:
    aplicar_entorno_local()
    from agno.agent import Agent
    from agno.db.sqlite import SqliteDb
    from agno.memory import MemoryManager
    from agno.team import Team, TeamMode
    elegidos = tuple(agentes or equipo_por_defecto())
    if len(elegidos) != 2:
        raise ValueError("el equipo de prueba es de dos agentes")
    ruta = ruta_memoria(ruta_db)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    db = SqliteDb(db_file=str(ruta))
    cliente_de = fabrica_cliente or _cliente_del_enrutador(entorno)
    crear_modelo = fabrica_modelo or _modelo_de
    modelos: list[object] = []
    for agente in elegidos:
        cliente = cliente_de(agente)
        if cliente is None:
            raise RuntimeError("sin modelo en el enrutador propio para " + agente.id)
        modelos.append(crear_modelo(cliente, agente))
    memoria = MemoryManager(model=modelos[0], db=db)
    miembros = tuple(Agent(id=a.id, name=a.name, description=a.description,
                           instructions=[a.persona], model=m, db=db,
                           memory_manager=memoria, telemetry=False,
                           add_history_to_context=True, user_id=user_id)
                    for a, m in zip(elegidos, modelos))
    team = Team(members=list(miembros), model=modelos[0], name="Equipo Agno local",
                db=db, memory_manager=memoria, mode=TeamMode.coordinate,
                instructions=["Coordinas a dos agentes y compartes lo aprendido."],
                telemetry=False, add_history_to_context=True, user_id=user_id)
    return EquipoAgno(team=team, db=db, memoria=memoria, agentes=miembros, ruta=ruta)
