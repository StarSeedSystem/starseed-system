#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Flujo largo de MetaGenesis con LangGraph, sin LangChain ni LangSmith (AGF1023E).

Planificar → escribir → verificar → persona en el bucle si falla dos veces. Un
checkpointer SQLite local lo hace reanudable con `reanudar`; los nodos son
funciones inyectadas y las pruebas no tocan modelos ni red.
"""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Mapping

try:  # admite ``import flujo_langgraph`` y ``scripts.agentes.flujo_langgraph``
    from .flujo_langgraph_reglas import (
        LIMITE_FALLOS, Estado, Nodo, aplicar_decision, configuracion,
        decidir_tras_persona, decidir_tras_verificar, estado_inicial,
        normalizar_decision,
    )
except ImportError:
    from flujo_langgraph_reglas import (  # type: ignore[no-redef]
        LIMITE_FALLOS, Estado, Nodo, aplicar_decision, configuracion,
        decidir_tras_persona, decidir_tras_verificar, estado_inicial,
        normalizar_decision,
    )

try:  # sin la dependencia, las reglas puras se pueden probar igual
    from langgraph.checkpoint.sqlite import SqliteSaver
    from langgraph.graph import END, START, StateGraph
    from langgraph.types import Command, interrupt

    _ERROR = ""
except ImportError as exc:  # pragma: no cover - depende de la máquina
    END = START = StateGraph = Command = interrupt = SqliteSaver = None
    _ERROR = f"falta langgraph o langgraph-checkpoint-sqlite: {exc}"
HAY_LANGGRAPH = HAY_CHECKPOINTER_SQLITE = not _ERROR
MOTIVO_SIN_LANGGRAPH = _ERROR

def _envolver(nombre: str, funcion: Nodo, *, cuenta_intento: bool = False) -> Nodo:
    def nodo(estado: Mapping[str, Any]) -> dict[str, Any]:
        cambios = dict(funcion(dict(estado)) or {})
        cambios["historial"] = list(estado.get("historial") or []) + [nombre]
        if cuenta_intento:
            cambios["intentos"] = int(estado.get("intentos") or 0) + 1
        veredicto = cambios.get("veredicto") or estado.get("veredicto") or {}
        if nombre == "verificar" and isinstance(veredicto, Mapping) and veredicto.get("ok"):
            cambios["resultado"] = str(cambios.get("borrador") or estado.get("borrador") or "")
            cambios["estado"] = "terminado"
        else:
            cambios.setdefault("estado", "en_curso")
        return cambios

    return nodo


def _nodo_persona(persona: Nodo | None) -> Nodo:
    def humano(estado: Mapping[str, Any]) -> dict[str, Any]:
        veredicto = estado.get("veredicto") or {}
        pregunta = {"motivo": str(veredicto.get("motivo") or "sin visto bueno"),
                    "intentos": int(estado.get("intentos") or 0),
                    "borrador": str(estado.get("borrador") or "")}
        respuesta = persona(dict(estado)) if persona is not None else interrupt(pregunta)
        cambios = aplicar_decision(estado, respuesta)
        cambios["historial"] = list(estado.get("historial") or []) + ["persona"]
        return cambios

    return humano


def crear_flujo(planificar: Nodo, escribir: Nodo, verificar: Nodo,
                persona: Nodo | None = None, *, checkpointer: Any) -> Any:
    if not HAY_LANGGRAPH:
        raise RuntimeError(MOTIVO_SIN_LANGGRAPH or "LangGraph no está instalado")
    if checkpointer is None:
        raise ValueError("hace falta un checkpointer para poder reanudar")
    grafo = StateGraph(Estado)
    grafo.add_node("planificar", _envolver("planificar", planificar))
    grafo.add_node("escribir", _envolver("escribir", escribir, cuenta_intento=True))
    grafo.add_node("verificar", _envolver("verificar", verificar))
    grafo.add_node("persona", _nodo_persona(persona))
    grafo.add_edge(START, "planificar")
    grafo.add_edge("planificar", "escribir")
    grafo.add_edge("escribir", "verificar")
    grafo.add_conditional_edges("verificar", decidir_tras_verificar,
                                {"escribir": "escribir", "persona": "persona", "fin": END})
    grafo.add_conditional_edges("persona", decidir_tras_persona,
                                {"escribir": "escribir", "fin": END})
    return grafo.compile(checkpointer=checkpointer)


@contextmanager
def abrir_checkpointer(ruta: str = ":memory:") -> Iterator[Any]:
    if not HAY_CHECKPOINTER_SQLITE:
        raise RuntimeError(MOTIVO_SIN_LANGGRAPH or "falta el checkpointer SQLite")
    if ruta != ":memory:":
        Path(ruta).expanduser().parent.mkdir(parents=True, exist_ok=True)
    with SqliteSaver.from_conn_string(ruta) as saver:
        yield saver


def ejecutar(grafo: Any, tarea: str, hilo: str,
             contexto: Mapping[str, Any] | None = None) -> Mapping[str, Any]:
    return grafo.invoke(estado_inicial(tarea, contexto), config=configuracion(hilo))


def reanudar(grafo: Any, hilo: str, respuesta: object) -> Mapping[str, Any]:
    if not HAY_LANGGRAPH:
        raise RuntimeError(MOTIVO_SIN_LANGGRAPH or "LangGraph no está instalado")
    return grafo.invoke(Command(resume=respuesta), config=configuracion(hilo))


def estado_guardado(grafo: Any, hilo: str) -> Any:
    return grafo.get_state(configuracion(hilo))
