#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MetaGenesis: planificar → escribir → verificar con LangGraph, persona tras dos fallos
y estado reanudable por thread_id en un SqliteSaver local (AGF1023A)."""
from __future__ import annotations

from typing import Callable, TypedDict

try:
    from langgraph.graph import END, START, StateGraph
    GRAFO_DISPONIBLE, MOTIVO_SIN_GRAFO = True, ""
except ImportError as error:  # pragma: no cover - depende del entorno
    END = START = StateGraph = None  # type: ignore[assignment]
    GRAFO_DISPONIBLE, MOTIVO_SIN_GRAFO = False, f"falta langgraph ({error})"

try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    SQLITE_DISPONIBLE, MOTIVO_SIN_SQLITE = True, ""
except ImportError as error:  # pragma: no cover - depende del entorno
    SqliteSaver = None  # type: ignore[assignment]
    SQLITE_DISPONIBLE, MOTIVO_SIN_SQLITE = False, f"falta langgraph-checkpoint-sqlite ({error})"

DISPONIBLE, MOTIVO_NO_DISPONIBLE = GRAFO_DISPONIBLE and SQLITE_DISPONIBLE, MOTIVO_SIN_GRAFO or MOTIVO_SIN_SQLITE
MAX_INTENTOS, HILO_POR_DEFECTO = 2, "metagenesis"
EstadoFlujo = TypedDict("EstadoFlujo", {
    "tarea": str, "contexto": str, "plan": str, "borrador": str, "veredicto": str,
    "aprobado": bool, "intentos": int, "revisor": str, "motivo": str}, total=False)


def normalizar_aprobacion(valor: object) -> bool:
    """Acepta bool, texto o un dict con ``aprobado``/``ok``. PURO."""
    if isinstance(valor, dict):
        return next((bool(valor[c]) for c in ("aprobado", "ok", "aceptado", "valido")
                     if c in valor), False)
    if isinstance(valor, str):
        limpio = valor.strip().lower()
        return limpio in {"ok", "aprobado", "aprobada", "valido", "válido", "true", "si", "sí"}
    return bool(valor)


def decision_de_persona(valor: object, borrador: str) -> EstadoFlujo:
    """Convierte lo que devuelve la persona en cambios de estado. PURO."""
    if isinstance(valor, dict):
        aprobado = bool(valor.get("aprobado", valor.get("aceptar", False)))
        nuevo = str(valor.get("borrador") or valor.get("texto") or borrador)
        motivo = str(valor.get("motivo") or "")
    elif isinstance(valor, str):
        aprobado, nuevo, motivo = bool(valor.strip()), valor.strip() or borrador, ""
    else:
        aprobado, nuevo, motivo = bool(valor), borrador, ""
    return {"aprobado": aprobado, "borrador": nuevo, "motivo": motivo, "revisor": "persona"}

def siguiente_paso(estado: EstadoFlujo, max_intentos: int = MAX_INTENTOS) -> str:
    """Aprobado termina; al llegar al tope de intentos decide la persona. PURO."""
    if estado.get("aprobado"):
        return "terminar"
    if int(estado.get("intentos") or 0) >= max(1, int(max_intentos)):
        return "persona"
    return "escribir"


def construir_grafo(planificar: Callable[[EstadoFlujo], str],
                    escribir: Callable[[EstadoFlujo], str],
                    verificar: Callable[[EstadoFlujo], object],
                    persona: Callable[[EstadoFlujo], object], *,
                    max_intentos: int = MAX_INTENTOS, checkpointer=None):
    """Arma el grafo con funciones inyectadas. No llama a ningún modelo."""
    if not GRAFO_DISPONIBLE:
        raise RuntimeError(MOTIVO_SIN_GRAFO or "falta langgraph")

    def nodo_planificar(estado: EstadoFlujo) -> EstadoFlujo:
        return {"plan": str(planificar(estado) or "")}

    def nodo_escribir(estado: EstadoFlujo) -> EstadoFlujo:
        return {"borrador": str(escribir(estado) or "")}

    def nodo_verificar(estado: EstadoFlujo) -> EstadoFlujo:
        resultado = verificar(estado)
        motivo = (resultado.get("motivo") or resultado.get("veredicto")) if isinstance(
            resultado, dict) else resultado
        return {"veredicto": str(motivo or ""), "aprobado": normalizar_aprobacion(resultado),
                "intentos": int(estado.get("intentos") or 0) + 1, "revisor": "verificador"}

    def nodo_persona(estado: EstadoFlujo) -> EstadoFlujo:
        return decision_de_persona(persona(estado), str(estado.get("borrador") or ""))

    grafo = StateGraph(EstadoFlujo)
    grafo.add_node("planificar", nodo_planificar)
    grafo.add_node("escribir", nodo_escribir)
    grafo.add_node("verificar", nodo_verificar)
    grafo.add_node("persona", nodo_persona)
    grafo.add_edge(START, "planificar")
    grafo.add_edge("planificar", "escribir")
    grafo.add_edge("escribir", "verificar")
    grafo.add_conditional_edges("verificar", lambda e: siguiente_paso(e, max_intentos),
                                {"terminar": END, "persona": "persona", "escribir": "escribir"})
    grafo.add_edge("persona", END)
    return grafo.compile(checkpointer=checkpointer)


def ejecutar(grafo, tarea: str, *, thread_id: str = HILO_POR_DEFECTO, contexto: str = "",
             extra: dict | None = None) -> EstadoFlujo:
    """Empieza (o continúa, si el hilo ya tiene estado) una tarea larga."""
    entrada = {"tarea": tarea, "contexto": contexto, "intentos": 0, "aprobado": False}
    if extra:
        entrada.update(extra)
    return dict(grafo.invoke(entrada, config={"configurable": {"thread_id": thread_id}}))


def reanudar(grafo, *, thread_id: str = HILO_POR_DEFECTO,
             valores: dict | None = None) -> EstadoFlujo:
    """Retoma el hilo desde el último punto guardado, sin repetir lo ya hecho."""
    return dict(grafo.invoke(valores, config={"configurable": {"thread_id": thread_id}}))


def leer_estado(grafo, thread_id: str = HILO_POR_DEFECTO) -> EstadoFlujo:
    """Lo que hay guardado ahora mismo en el hilo."""
    return dict(grafo.get_state({"configurable": {"thread_id": thread_id}}).values)
