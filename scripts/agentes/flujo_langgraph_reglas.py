#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reglas puras del flujo LangGraph de MetaGenesis (AGF1023E).

Sin LangGraph, red ni disco: el grafo las usa y las pruebas pueden comprobarlas
aunque la dependencia no esté instalada en la máquina.
"""
from __future__ import annotations

import unicodedata
from typing import Any, Callable, Mapping, TypedDict

LIMITE_FALLOS = 2
DECISIONES = ("aceptar", "reintentar", "abortar")


class Estado(TypedDict, total=False):
    """Estado que viaja entre nodos y queda guardado en el checkpointer."""

    tarea: str
    contexto: dict[str, Any]
    plan: list[str]
    borrador: str
    veredicto: dict[str, Any]
    intentos: int
    decision: str
    historial: list[str]
    estado: str
    resultado: str


Nodo = Callable[[Mapping[str, Any]], Mapping[str, Any]]


def _plano(texto: object) -> str:
    """Minúsculas sin acentos, para leer una decisión escrita a mano. PURO."""
    sin = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return sin.lower().strip()


def normalizar_decision(respuesta: object) -> str:
    """Acepta texto o ``{"decision": …}``; lo desconocido aborta. PURO."""
    if isinstance(respuesta, Mapping):
        respuesta = respuesta.get("decision") or respuesta.get("respuesta") or ""
    decision = _plano(respuesta)
    return decision if decision in DECISIONES else "abortar"


def decidir_tras_verificar(estado: Mapping[str, Any]) -> str:
    """Buen veredicto → fin; dos fallos → persona; si no → escribir. PURO."""
    veredicto = estado.get("veredicto") or {}
    if isinstance(veredicto, Mapping) and veredicto.get("ok"):
        return "fin"
    return "persona" if int(estado.get("intentos") or 0) >= LIMITE_FALLOS else "escribir"


def decidir_tras_persona(estado: Mapping[str, Any]) -> str:
    """Reintentar vuelve a escribir; lo demás cierra. PURO."""
    return "escribir" if estado.get("decision") == "reintentar" else "fin"


def estado_inicial(tarea: str, contexto: Mapping[str, Any] | None = None) -> Estado:
    """Punto de partida de una tarea larga. PURO."""
    return Estado(tarea=tarea, contexto=dict(contexto or {}), plan=[], borrador="",
                  veredicto={}, intentos=0, historial=[], estado="en_curso", resultado="")


def configuracion(hilo: str) -> dict[str, dict[str, str]]:
    """Un ``thread_id`` = una tarea reanudable."""
    return {"configurable": {"thread_id": str(hilo)}}


def aplicar_decision(estado: Mapping[str, Any], respuesta: object) -> dict[str, Any]:
    """Traduce la respuesta de la persona a cambios de estado. PURO."""
    decision = normalizar_decision(respuesta)
    cambios: dict[str, Any] = {"decision": decision}
    if decision == "reintentar":
        cambios.update(intentos=0, estado="en_curso")
    elif decision == "aceptar":
        cambios.update(estado="terminado", resultado=str(estado.get("borrador") or ""))
    else:
        cambios.update(estado="abortado")
    return cambios
