#!/usr/bin/env python3
"""Clasifica la salida de un motor sin depender del orquestador."""

from __future__ import annotations

from typing import Literal


ClaseFallo = Literal["red", "pasarela", "cuota", "sin_cambios", "ok"]


def clasificar(salida: str | None, segundos: float) -> ClaseFallo:
    """Distingue fallos de infraestructura de una salida normal sin cambios."""
    texto = (salida or "").strip().lower()
    _ = segundos  # Se conserva para enriquecer la heurística sin romper el contrato.
    if not texto:
        return "ok"

    red = (
        "unable to connect",
        "failed to fetch",
        "typo in the url",
        "econnrefused",
        "enotfound",
        "etimedout",
        "getaddrinfo",
        "connection reset by peer",
        "network is unreachable",
        "certificate verify failed",
        "name or service not known",
    )
    if any(pista in texto for pista in red):
        return "red"

    pasarela = ("405 not allowed", "502", "503", "504")
    if any(pista in texto for pista in pasarela) or (
        "nginx" in texto and ("<html" in texto or "<!doctype html" in texto)
    ):
        return "pasarela"

    cuota = ("402", "429", "quota", "check-in required")
    if any(pista in texto for pista in cuota):
        return "cuota"
    return "sin_cambios"
