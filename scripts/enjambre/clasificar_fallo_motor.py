#!/usr/bin/env python3
"""Clasifica la salida de un motor sin depender del orquestador."""

from __future__ import annotations

import re
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
PISTAS_PASARELA = ("405 not allowed",)
#: (2026-10-22) Frases de cuota con su contexto de error. Antes bastaba la palabra «quota» o los
#: dígitos «402»/«429» EN CUALQUIER SITIO de la salida, y la salida de opencode trae lo que el
#: agente leyó y escribió: un archivo que habla de cupos, una línea «1429» o una hora «14:29:02».
#: Medido en el A1 el 22-10: opencode (Zen), freellmapi, google y openrouter llevaban «sin cupo
#: 24 h» con motivo «> build · glm-5.3-flash-free → Read src/lib/avata…» (una transcripción
#: normal), y la tarea RTCB1013X esperó 40 min «a que vuelva algún proveedor» con todos vivos.
PISTAS_CUOTA = (
    "quota exceeded", "exceeded your current quota", "exceeded quota", "insufficient_quota",
    "insufficient quota", "out of credits", "insufficient credits", "insufficient balance",
    "payment required", "too many requests", "rate limit exceeded", "rate limit reached",
    "rate_limit_exceeded", "daily limit", "check-in required", "resource has been exhausted",
    "resource_exhausted",
)
#: Líneas que son la transcripción de herramientas de opencode (leer, buscar, editar), no un error.
_HERRAMIENTA = re.compile(r"^\s*(?:[→✱←⚙•│|>$+]|@@|-{3}|\d+\s*[│|])")
_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
_CODIGO_CUOTA = re.compile(r"(?<![\w.:/-])(?:402|429)(?![\w.:/-])")
_CODIGO_PASARELA = re.compile(r"(?<![\w.:/-])(?:502|503|504)(?![\w.:/-])")
_CONTEXTO_ERROR = re.compile(
    r"error|http|status|code|too many requests|payment required|rate limit|bad gateway|"
    r"service unavailable|gateway timeout|exceeded|quota", re.I)
_EMPIEZA_POR_CODIGO = re.compile(r"^\W*(?:http\s*)?(?:402|429|502|503|504)\b", re.I)
#: Los errores del motor salen al FINAL: solo se miran las últimas líneas que no son herramientas.
LINEAS_DE_COLA = 30


def _cola(texto: str) -> list[str]:
    filas = [l for l in _ANSI.sub("", texto).splitlines() if l.strip()]
    return [l for l in filas[-LINEAS_DE_COLA:] if not _HERRAMIENTA.match(l)]


def _hay_codigo(lineas: list[str], patron: re.Pattern[str]) -> bool:
    """Un código HTTP cuenta si va en una línea de error o la línea empieza por él («429»)."""
    return any(
        patron.search(l) and (_EMPIEZA_POR_CODIGO.match(l.strip()) or _CONTEXTO_ERROR.search(l))
        for l in lineas
    )


def clasificar(salida: str | None, segundos: float) -> ClaseFallo:
    """Clasifica la salida; ``None`` o texto vacío representan una salida válida."""
    _ = segundos  # Se conserva para enriquecer la heurística sin romper el contrato.
    if not (salida or "").strip():
        return "ok"
    lineas = _cola(salida or "")
    texto = "\n".join(lineas).lower()

    if any(pista in texto for pista in PISTAS_RED):
        return "red"

    if any(pista in texto for pista in PISTAS_PASARELA) or _hay_codigo(lineas, _CODIGO_PASARELA) or (
        "nginx" in texto and ("<html" in texto or "<!doctype html" in texto)
    ):
        return "pasarela"

    if any(pista in texto for pista in PISTAS_CUOTA) or _hay_codigo(lineas, _CODIGO_CUOTA):
        return "cuota"
    return "sin_cambios"
