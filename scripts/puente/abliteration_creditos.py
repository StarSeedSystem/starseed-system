#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo puro para gestionar créditos de abliteration.ai.

Sin red ni disco: todo se inyecta. Provee:
  - saldo_usd: calcula el saldo disponible a partir de la respuesta de /v1/credits
  - registrar: actualiza el estado al cambiar de día o recargar
  - gasto_del_dia: calcula el gasto consumido hoy
  - permitido: verifica si se puede usar el servicio (tope del día, margen, frescura)

Contrato API (verificado 2026-11-16):
  - POST https://api.abliteration.ai/v1/chat/completions
  - GET  https://api.abliteration.ai/v1/credits → {"data": {"total_credits": n, "total_usage": n}}
  - Clave: variable de entorno ABLITERATION_API_KEY

Precios: $1 entrada / $0,10 entrada en caché / $3 salida por millón de tokens.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple


def saldo_usd(respuesta: Dict[str, Any]) -> Optional[float]:
    """Calcula el saldo disponible a partir de la respuesta ya decodificada de /v1/credits.
    
    Devuelve total_credits - total_usage redondeado a 6 decimales,
    o None si falta algún campo o el saldo sale negativo.
    """
    if not isinstance(respuesta, dict):
        return None
    
    data = respuesta.get("data")
    if not isinstance(data, dict):
        return None
    
    total_credits = data.get("total_credits")
    total_usage = data.get("total_usage")
    
    if not isinstance(total_credits, (int, float)) or not isinstance(total_usage, (int, float)):
        return None
    
    saldo = total_credits - total_usage
    
    if saldo < 0:
        return None
    
    return round(saldo, 6)


def registrar(estado: Dict[str, Any], saldo: Optional[float], ahora_iso: str) -> Dict[str, Any]:
    """Actualiza el estado al cambiar de día o recargar saldo.
    
    Estado nuevo con:
      - dia: AAAA-MM-DD en UTC
      - saldo_inicio_dia: saldo del primer registro del día (el último saldo conocido al cambiar de día)
      - saldo_ultimo: el saldo proporcionado
      - leido: ISO del momento actual
    
    Al cambiar de día, saldo_inicio_dia pasa a ser el último saldo conocido (saldo_ultimo anterior).
    Si el saldo SUBE (recarga), gasto_del_dia no se vuelve negativo.
    """
    if saldo is None or not isinstance(saldo, (int, float)) or saldo < 0:
        return estado
    
    ahora = datetime.fromisoformat(ahora_iso.replace("Z", "+00:00"))
    dia_actual = ahora.strftime("%Y-%m-%d")
    
    estado_existente = estado or {}
    dia_anterior = estado_existente.get("dia")
    saldo_inicio_dia_anterior = estado_existente.get("saldo_inicio_dia")
    saldo_ultimo_anterior = estado_existente.get("saldo_ultimo")
    
    nuevo_estado = dict(estado_existente)
    
    if dia_anterior != dia_actual:
        nuevo_estado["dia"] = dia_actual
        if isinstance(saldo_ultimo_anterior, (int, float)):
            nuevo_estado["saldo_inicio_dia"] = saldo_ultimo_anterior
        elif isinstance(saldo_inicio_dia_anterior, (int, float)):
            nuevo_estado["saldo_inicio_dia"] = saldo_inicio_dia_anterior
        else:
            nuevo_estado["saldo_inicio_dia"] = saldo
    elif "saldo_inicio_dia" not in estado_existente:
        nuevo_estado["saldo_inicio_dia"] = saldo
    
    nuevo_estado["saldo_ultimo"] = saldo
    nuevo_estado["leido"] = ahora_iso
    
    return nuevo_estado


def gasto_del_dia(estado: Dict[str, Any]) -> float:
    """Calcula el gasto consumido hoy (>= 0).
    
    Gasto = saldo_inicio_dia - saldo_ultimo (si no hubo recarga).
    Si el saldo subió, el gasto del día se mantiene en 0 o positivo.
    """
    if not isinstance(estado, dict):
        return 0.0
    
    saldo_inicio = estado.get("saldo_inicio_dia")
    saldo_ultimo = estado.get("saldo_ultimo")
    
    if not isinstance(saldo_inicio, (int, float)) or not isinstance(saldo_ultimo, (int, float)):
        return 0.0
    
    gasto = saldo_inicio - saldo_ultimo
    
    return max(0.0, round(gasto, 6))


def permitido(
    estado: Dict[str, Any],
    ahora_iso: str,
    tope_dia_usd: float,
    margen_min_usd: float = 0.5,
    frescura_s: int = 21600
) -> Tuple[bool, str]:
    """Verifica si se permite usar el servicio.
    
    Motivos posibles:
      - "sin lectura": estado vacío o sin saldo_ultimo
      - "lectura vieja (más de 6 h)": frescura excedida
      - "saldo bajo el margen": saldo menos que margen_min_usd
      - "tope del día alcanzado": gasto_del_dia >= tope_dia_usd
      - "ok": todo dentro de límites
    """
    ahora = datetime.fromisoformat(ahora_iso.replace("Z", "+00:00"))
    
    if not isinstance(estado, dict) or "saldo_ultimo" not in estado:
        return (False, "sin lectura")
    
    saldo_ultimo = estado.get("saldo_ultimo")
    leido = estado.get("leido")
    
    if not isinstance(saldo_ultimo, (int, float)):
        return (False, "sin lectura")
    
    if isinstance(leido, str):
        try:
            leido_dt = datetime.fromisoformat(leido.replace("Z", "+00:00"))
            if (ahora - leido_dt).total_seconds() > frescura_s:
                return (False, "lectura vieja (más de 6 h)")
        except (ValueError, TypeError):
            return (False, "sin lectura")
    
    if saldo_ultimo < margen_min_usd:
        return (False, "saldo bajo el margen")
    
    gasto = gasto_del_dia(estado)
    if gasto >= tope_dia_usd:
        return (False, "tope del día alcanzado")
    
    return (True, "ok")