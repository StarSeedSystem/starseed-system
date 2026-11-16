#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo puro de desenlaces para Jev/Laya: qué cuenta como verdad.

Regla de verdad (§3 de architecture/jev-entrena-laya.md): el maestro no es Jev; es el
**desenlace**. Jev se equivoca. Un ejemplo sin desenlace se guarda marcado
«etiqueta débil de Jev» y no entra en el afinado ni en la evaluación.

Este módulo NO lee disco: las filas llegan por argumento.
"""

from __future__ import annotations

from typing import Any


def desenlace_de(fila: dict[str, Any]) -> dict[str, Any]:
    """Determina el desenlace real de una fila ya leída.

    Args:
        fila: Dict con la información de la decisión y su resultado posterior.
              Tipos soportados:
              - "veredicto_bloqueada": veredicto de tarea atascada con resultado_posterior
              - "progreso": tarea integrada/revertida en progreso
              - "aprobacion": aprobación sola con sha integrado/revertido
              - "publicacion": publicación con despliegue verde/rojo
              - "correccion": corrección explícita de Alex (corregida_por: alex)
              - "jev_opinion": opinión de Jev (NUNCA es desenlace)
              - otros: desconocido

    Returns:
        Dict con:
        - "verdad": True | False | None
        - "fuente": str (identifica la fuente del desenlace)
    """
    if not isinstance(fila, dict) or not fila:
        return {"verdad": None, "fuente": "desconocida"}

    tipo = fila.get("tipo")

    if tipo == "veredicto_bloqueada":
        resultado = fila.get("resultado_posterior")
        if resultado == "integrada":
            return {"verdad": True, "fuente": "veredicto_bloqueada"}
        if resultado == "revertida":
            return {"verdad": False, "fuente": "veredicto_bloqueada"}
        return {"verdad": None, "fuente": "veredicto_bloqueada"}

    if tipo == "progreso":
        estado = fila.get("estado")
        if estado == "integrada":
            return {"verdad": True, "fuente": "progreso"}
        if estado == "revertida":
            return {"verdad": False, "fuente": "progreso"}
        return {"verdad": None, "fuente": "progreso"}

    if tipo == "aprobacion":
        if fila.get("integrado") is True:
            return {"verdad": True, "fuente": "aprobacion"}
        if fila.get("revertido") is True or fila.get("integrado") is False:
            return {"verdad": False, "fuente": "aprobacion"}
        return {"verdad": None, "fuente": "aprobacion"}

    if tipo == "publicacion":
        despliegue = fila.get("despliegue")
        if despliegue == "verde":
            return {"verdad": True, "fuente": "publicacion"}
        if despliegue == "rojo":
            return {"verdad": False, "fuente": "publicacion"}
        return {"verdad": None, "fuente": "publicacion"}

    if tipo == "correccion":
        if fila.get("corregida_por") == "alex":
            correcto = fila.get("correcto")
            if correcto is True:
                return {"verdad": True, "fuente": "correccion_alex"}
            if correcto is False:
                return {"verdad": False, "fuente": "correccion_alex"}
        return {"verdad": None, "fuente": "correccion_alex"}

    if tipo == "jev_opinion":
        # La opinión de Jev NUNCA es desenlace
        return {"verdad": None, "fuente": "jev_opinion"}

    return {"verdad": None, "fuente": "desconocida"}


def etiqueta_de(exp: dict[str, Any] | None, desenlace: dict[str, Any] | None) -> str:
    """Etiqueta una experiencia según su desenlace.

    Args:
        exp: La experiencia (dict con al menos 'id' y 'tipo'), o None.
        desenlace: Resultado de `desenlace_de`, o None.

    Returns:
        - "verdad": hay desenlace real (verdad True o False)
        - "debil": solo opinión de Jev (fuente 'jev_opinion')
        - "sin_dato": sin desenlace conocido (verdad None, fuente distinta de jev_opinion)
    """
    if not exp or not isinstance(exp, dict):
        return "sin_dato"

    if not desenlace or not isinstance(desenlace, dict):
        return "sin_dato"

    verdad = desenlace.get("verdad")
    fuente = desenlace.get("fuente")

    if verdad is True or verdad is False:
        return "verdad"

    if fuente == "jev_opinion":
        return "debil"

    return "sin_dato"