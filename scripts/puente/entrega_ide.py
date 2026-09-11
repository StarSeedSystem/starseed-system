# -*- coding: utf-8 -*-
"""Entrega honesta de notificaciones entre IDE: acuses y reintentos acotados.

Módulo puro, sin IO ni subprocess. Un código de salida 0 de la CLI solo prueba
que el mensaje quedó encolado; nunca que fue recibido ni leído.
"""

from typing import Any

ESTADOS = ("encolado", "recibido", "leido", "error", "timeout", "no_verificado")
RETRASOS = (5, 15, 45, 120, 300)  # segundos para los intentos 1..5
MAX_INTENTOS = 5
# codex y astra son el mismo emisor: no se notifica a sí mismo.
ALIASES_ORIGEN = {"astra": "codex"}


def _canon(origen: str) -> str:
    o = (origen or "").strip().lower()
    return ALIASES_ORIGEN.get(o, o)


def evaluar_entrega(codigo: int | None, timeout: bool = False) -> dict[str, Any]:
    """Traduce el resultado de invocar una CLI de IDE a un acuse honesto.

    codigo == 0 sin timeout -> 'encolado' (no 'recibido'; la recepción es cosa
    del acuse del otro lado, no de la salida de la CLI).
    """
    if timeout:
        return {"estado": "timeout", "reintentable": True}
    if codigo is None or isinstance(codigo, bool) or not isinstance(codigo, int):
        return {"estado": "no_verificado", "reintentable": True}
    if codigo == 0:
        return {"estado": "encolado", "reintentable": False}
    return {"estado": "error", "reintentable": True}


def siguiente_reintento(intentos: int, ahora: float) -> float | None:
    """Instante del próximo reintento, o None si ya no se reintenta.

    `intentos` es el número de intentos ya hechos (1..5 reintentan con retrasos
    5, 15, 45, 120, 300 s). intentos < 0 es un dato inválido.
    """
    if not isinstance(intentos, int) or isinstance(intentos, bool) or intentos < 0:
        raise ValueError("intentos debe ser un entero >= 0")
    if intentos < 1 or intentos > MAX_INTENTOS:
        return None
    return float(ahora) + RETRASOS[intentos - 1]


def destinos_pendientes(evento: dict, destinos: list[str], acuses: dict) -> list[str]:
    """Destinos a los que aún falta notificar, sin eco al origen ni duplicados.

    Se omite el origen del evento (con alias astra=codex) y cualquier destino
    con acuse terminal o en curso (encolado/recibido/leido); error y
    no_verificado siguen pendientes. No muta las entradas.
    """
    origen = _canon(str((evento or {}).get("quien", "")))
    vistos: set[str] = set()
    try:
        claves_acuse = {_canon(str(k)): v for k, v in (acuses or {}).items()}
    except Exception:
        claves_acuse = {}
    pendientes: list[str] = []
    for destino in destinos or []:
        clave = _canon(str(destino))
        if not clave or clave == origen or clave in vistos:
            continue
        vistos.add(clave)
        acuse = claves_acuse.get(clave) or {}
        estado = str(acuse.get("estado", "") if isinstance(acuse, dict) else "").lower()
        if estado in ("encolado", "recibido", "leido"):
            continue
        pendientes.append(str(destino))
    return pendientes
