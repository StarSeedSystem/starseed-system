#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Desenlaces de decisiones: qué cuenta como verdad para la libreta de Jev→Laya.

(2026-11-16, JLA1116A) Un desenlace es el resultado REAL de una decisión, no la
opinión de Jev. Las cinco fuentes de verdad son:
- veredicto de bloqueada con su resultado posterior
- tarea integrada o revertida en el progreso
- aprobación sola con su sha integrado o revertido
- publicación con su despliegue verde o rojo
- corrección explícita de Alex (corregida_por: alex)

Regla de oro: la opinión de Jev NUNCA es desenlace; sin dato → verdad: None.
"""

from __future__ import annotations

from typing import Any, Mapping


def _es_verdad(valor: Any) -> bool | None:
    """Convierte valores de verdad comunes a True/False/None."""
    if valor is None:
        return None
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ("true", "verdadero", "si", "sí", "yes", "y", "1", "integrado", "verde", "aprobado", "acierto"):
            return True
        if v in ("false", "falso", "no", "revertido", "rojo", "rechazado", "fallo", "error"):
            return False
    return None


def _tiene_dato(fila: Mapping[str, Any] | None, *claves: str) -> bool:
    """True si alguna de las claves existe y tiene valor no nulo/no vacío."""
    if not fila:
        return False
    for c in claves:
        v = fila.get(c)
        if v not in (None, "", [], {}):
            return True
    return False


def desenlace_de(fila: Mapping[str, Any] | None) -> dict:
    """Extrae el desenlace real de una fila ya leída (dict).

    Args:
        fila: Diccionario con los campos de una decisión y su resultado.

    Returns:
        {"verdad": True|False|None, "fuente": str}
        - verdad: True si se confirmó acierto, False si se confirmó fallo, None si no hay dato.
        - fuente: nombre de la fuente que dio el desenlace, o "" si none.
    """
    if not isinstance(fila, dict):
        return {"verdad": None, "fuente": ""}

    # 1) Corrección explícita de Alex
    if fila.get("corregida_por") == "alex":
        v = _es_verdad(fila.get("resultado_alex") or fila.get("verdad"))
        if v is not None:
            return {"verdad": v, "fuente": "correccion_alex"}

    # 2) Publicación con despliegue verde/rojo
    if _tiene_dato(fila, "despliegue", "deployment", "build_result"):
        v = _es_verdad(fila.get("despliegue") or fila.get("deployment") or fila.get("build_result"))
        if v is not None:
            return {"verdad": v, "fuente": "publicacion"}

    # 3) Aprobación sola con sha integrado/revertido
    if _tiene_dato(fila, "sha_integrado", "sha_revertido", "aprobacion_sha"):
        if fila.get("sha_revertido"):
            return {"verdad": False, "fuente": "aprobacion"}
        if _tiene_dato(fila, "sha_integrado", "aprobacion_sha"):
            return {"verdad": True, "fuente": "aprobacion"}

    # 4) Tarea integrada o revertida en el progreso
    if _tiene_dato(fila, "estado_tarea", "progreso_estado", "integrada", "revertida"):
        estado = (fila.get("estado_tarea") or fila.get("progreso_estado") or "").lower()
        if estado in ("integrada", "integrado", "merged", "hecho", "done", "completada"):
            return {"verdad": True, "fuente": "tarea_integrada"}
        if estado in ("revertida", "revertido", "reverted", "deshecha", "cancelada"):
            return {"verdad": False, "fuente": "tarea_revertida"}

    # 5) Veredicto de bloqueada con su resultado posterior
    if _tiene_dato(fila, "veredicto", "resultado_veredicto", "bloqueada_resultado"):
        v = _es_verdad(fila.get("resultado_veredicto") or fila.get("bloqueada_resultado"))
        if v is not None:
            return {"verdad": v, "fuente": "veredicto_bloqueada"}

    # Sin dato de ninguna fuente
    return {"verdad": None, "fuente": ""}


def etiqueta_de(exp: Mapping[str, Any] | None, desenlace: Mapping[str, Any] | None) -> str:
    """Etiqueta una experiencia según su desenlace.

    Args:
        exp: Experiencia (dict con campos como capa, confianza, etc.).
        desenlace: Salida de `desenlace_de`.

    Returns:
        "verdad"   — hay desenlace real (True/False)
        "debil"    — solo opinión de Jev (capa=="jev" y desenlace existe pero sin verdad)
        "sin_dato" — fila vacía o sin info usable
    """
    if not isinstance(exp, dict) or not exp:
        return "sin_dato"

    if desenlace and desenlace.get("verdad") is not None and desenlace.get("fuente"):
        return "verdad"

    # Solo opinión de Jev (capa jev con desenlace que existe pero no tiene verdad)
    if desenlace and exp.get("capa") == "jev" and desenlace.get("verdad") is None:
        return "debil"

    return "sin_dato"