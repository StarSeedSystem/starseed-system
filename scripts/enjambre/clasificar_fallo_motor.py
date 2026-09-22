#!/usr/bin/env python3
"""Clasifica la salida de un motor sin depender del orquestador."""

from __future__ import annotations

from typing import Literal


ClaseFallo = Literal["red", "pasarela", "cuota", "sin_cambios", "ok"]

PISTAS_RED = (
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
PISTAS_PASARELA = ("405 not allowed", "502", "503", "504")
PISTAS_CUOTA = ("402", "429", "quota", "check-in required")


def clasificar(salida: str | None, segundos: float) -> ClaseFallo:
    """Clasifica la salida; ``None`` o texto vacío representan una salida válida."""
    _ = segundos  # Se conserva para enriquecer la heurística sin romper el contrato.
    texto = (salida or "").strip().lower()
    if not texto:
        return "ok"

    if any(pista in texto for pista in PISTAS_RED):
        return "red"

    if any(pista in texto for pista in PISTAS_PASARELA) or (
        "nginx" in texto and ("<html" in texto or "<!doctype html" in texto)
    ):
        return "pasarela"

    if any(pista in texto for pista in PISTAS_CUOTA):
        return "cuota"
    return "sin_cambios"
