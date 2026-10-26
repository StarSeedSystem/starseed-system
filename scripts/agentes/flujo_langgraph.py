#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Flujo LangGraph con reanudación para tareas largas de MetaGenesis (AGF1023E).
planificar → escribir → verificar → persona (si falla dos veces). Nodos inyectados:
aquí NO se llama a ningún modelo; el llamador pasa los suyos (enrutador propio).
Solo langgraph: ni LangChain ni LangSmith.
"""
from __future__ import annotations
import os
import sqlite3
from collections.abc import Callable, Mapping
from contextlib import contextmanager
from typing import Any, TypedDict
MAX_INTENTOS = 2

class EstadoFlujo(TypedDict, total=False):
    tarea: dict[str, Any]
    plan: list[str]
    borrador: str
    verificacion: dict[str, Any]
    intentos: int
    max_intentos: int
    aprobacion: dict[str, Any] | None
    resultado: str

def estado_inicial(tarea: Mapping[str, Any] | str, max_intentos: int = MAX_INTENTOS) -> EstadoFlujo:
    datos = dict(tarea) if isinstance(tarea, Mapping) else {"objetivo": str(tarea or "")}
    return {"tarea": datos, "plan": [], "borrador": "", "verificacion": {},
            "intentos": 0, "max_intentos": max(1, int(max_intentos)),
            "aprobacion": None, "resultado": ""}

def normalizar_verificacion(valor: Any) -> dict[str, Any]:
    if isinstance(valor, Mapping):
        motivos = valor.get("motivos") or valor.get("errores") or []
        motivos = [motivos] if isinstance(motivos, str) else [str(m) for m in motivos]
        return {"ok": bool(valor.get("ok", valor.get("valido", False))), "motivos": motivos}
    return {"ok": bool(valor), "motivos": []}

def normalizar_aprobacion(valor: Any) -> dict[str, Any]:
    if isinstance(valor, Mapping):
        aprobado = bool(valor.get("aprobado", valor.get("ok", False)))
        return {"aprobado": aprobado,
                "comentario": str(valor.get("comentario") or valor.get("motivo") or "")}
    return {"aprobado": bool(valor), "comentario": ""}

def decidir_tras_verificar(estado: Mapping[str, Any]) -> str:
    """Ruta pura: listo · escribir (reintento) · persona (dos fallos por defecto)."""
    if bool((estado.get("verificacion") or {}).get("ok")):
        return "listo"
    intentos = int(estado.get("intentos") or 0)
    return "persona" if intentos >= int(estado.get("max_intentos") or MAX_INTENTOS) else "escribir"

def decidir_tras_persona(estado: Mapping[str, Any]) -> str:
    return "listo" if bool((estado.get("aprobacion") or {}).get("aprobado")) else "escribir"

@contextmanager
def checkpointer_sqlite(ruta: str):
    """Checkpointer SQLite local; crea la carpeta padre si falta."""
    from langgraph.checkpoint.sqlite import SqliteSaver
    if ruta != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    with SqliteSaver.from_conn_string(ruta) as guardado:
        guardado.setup()
        yield guardado

def reanudar(grafo, config: Mapping[str, Any], respuesta: Any = None):
    """Retoma un hilo parado en la persona (``interrupt``) con su respuesta."""
    from langgraph.types import Command
    return grafo.invoke(Command(resume=respuesta), config)

def _nodo_planificar(fn: Callable):
    return lambda estado: {"plan": [str(p) for p in (fn(dict(estado)) or [])]}

def _nodo_escribir(fn: Callable):
    return lambda estado: {"borrador": str(fn(dict(estado)) or "")}

def _nodo_verificar(fn: Callable):
    def nodo(estado):
        return {"verificacion": normalizar_verificacion(fn(dict(estado))),
                "intentos": int(estado.get("intentos") or 0) + 1}
    return nodo

def _nodo_persona(fn: Callable | None):
    def nodo(estado):
        if fn is None:
            from langgraph.types import interrupt
            motivos = (estado.get("verificacion") or {}).get("motivos") or []
            respuesta = interrupt({"pregunta": "La verificación falló dos veces: ¿se aprueba?",
                                   "tarea": estado.get("tarea") or {},
                                   "borrador": estado.get("borrador") or "", "motivos": motivos})
        else:
            respuesta = fn(dict(estado))
        return {"aprobacion": normalizar_aprobacion(respuesta)}
    return nodo

def _nodo_listo(estado):
    aprobado = bool((estado.get("aprobacion") or {}).get("aprobado"))
    return {"resultado": "aprobado-por-persona" if aprobado else "verificado"}

def construir_grafo(*, planificar: Callable, escribir: Callable, verificar: Callable,
                    persona: Callable | None = None, checkpointer: Any = None):
    """Compila el grafo; con ``persona=None`` usa ``interrupt`` y exige checkpointer."""
    from langgraph.graph import END, START, StateGraph
    if persona is None and checkpointer is None:
        raise ValueError("la persona en el bucle (interrupt) necesita un checkpointer")
    grafo = StateGraph(EstadoFlujo)
    grafo.add_node("planificar", _nodo_planificar(planificar))
    grafo.add_node("escribir", _nodo_escribir(escribir))
    grafo.add_node("verificar", _nodo_verificar(verificar))
    grafo.add_node("persona", _nodo_persona(persona))
    grafo.add_node("listo", _nodo_listo)
    grafo.add_edge(START, "planificar")
    grafo.add_edge("planificar", "escribir")
    grafo.add_edge("escribir", "verificar")
    grafo.add_conditional_edges("verificar", decidir_tras_verificar,
                                {"escribir": "escribir", "persona": "persona", "listo": "listo"})
    grafo.add_conditional_edges("persona", decidir_tras_persona,
                                {"escribir": "escribir", "listo": "listo"})
    grafo.add_edge("listo", END)
    return grafo.compile(checkpointer=checkpointer)
