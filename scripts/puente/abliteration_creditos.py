"""Módulo puro para gestionar créditos de abliteration.ai.

Sin red, sin disco, sin reloj propio: todo inyectado.

API de abliteration.ai (verificado 2026-11-16):
  - POST https://api.abliteration.ai/v1/chat/completions
  - GET  https://api.abliteration.ai/v1/credits → {"data": {"total_credits": n, "total_usage": n}}
  - Clave: ABLITERATION_API_KEY
  - Modelo: ablitated-model (256K contexto, texto e imagen, herramientas)
  - Precios: $1 entrada / $0.10 entrada en caché / $3 salida por millón de tokens
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any
from typing import Optional


Estado = dict[str, Any]


def saldo_usd(respuesta: dict[str, Any]) -> Optional[float]:
    """Calcula el saldo disponible en USD.

    Args:
        respuesta: JSON decodificado de GET /v1/credits (clave 'data')

    Returns:
        Saldo = total_credits - total_usage, redondeado a 6 decimales,
        o None si falta algún campo o el resultado es negativo.
    """
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


def registrar(estado: Optional[Estado], saldo: float, ahora_iso: str) -> Estado:
    """Actualiza el estado con un nuevo saldo.

    Args:
        estado: Estado anterior (puede ser None)
        saldo: Saldo actual en USD
        ahora_iso: Timestamp ISO 8601 del momento de la lectura

    Returns:
        Nuevo estado con las claves:
        - dia: AAAA-MM-DD en UTC
        - saldo_inicio_dia: saldo del primer registro del día
        - saldo_ultimo: saldo conocido anterior
        - leido: timestamp ISO de la última lectura
    """
    fecha = datetime.fromisoformat(ahora_iso.replace("Z", "+00:00")).strftime("%Y-%m-%d")

    nuevo = {
        "dia": fecha,
        "saldo_inicio_dia": saldo,
        "saldo_ultimo": saldo,
        "leido": ahora_iso,
    }

    if estado is None:
        return nuevo

    dia_anterior = estado.get("dia")
    if dia_anterior == fecha:
        nuevo["saldo_inicio_dia"] = estado.get("saldo_inicio_dia", saldo)

    return nuevo


def gasto_del_dia(estado: Optional[Estado]) -> float:
    """Calcula el gasto consumido en el día actual.

    Args:
        estado: Estado conocido

    Returns:
        Gasto = saldo_inicio_dia - saldo_ultimo, valor >= 0.
        Si el saldo sube (recarga), devuelve 0 (gasto no negativo).
    """
    if not estado:
        return 0.0

    inicio = estado.get("saldo_inicio_dia")
    ultimo = estado.get("saldo_ultimo")

    if not isinstance(inicio, (int, float)) or not isinstance(ultimo, (int, float)):
        return 0.0

    gasto = inicio - ultimo
    return max(0.0, round(gasto, 6))


def permitido(
    estado: Optional[Estado],
    ahora_iso: str,
    tope_dia_usd: float,
    margen_min_usd: float = 0.5,
    frescura_s: int = 21600,
) -> tuple[bool, str]:
    """Verifica si está permitido usar la API con los límites actuales.

    Args:
        estado: Estado conocido con saldos
        ahora_iso: Timestamp ISO de ahora
        tope_dia_usd: Límite máximo de gasto por día en USD
        margen_min_usd: Margen de seguridad (saldo mínimo requerido)
        frescura_s: Edad máxima aceptable de la última lectura en segundos

    Returns:
        (bool, motivo) donde motivo es una cadena descriptiva
    """
    if estado is None:
        return (False, "sin lectura")

    leido = estado.get("leido")
    if not leido or not isinstance(leido, str):
        return (False, "sin lectura")

    ahora = datetime.fromisoformat(ahora_iso.replace("Z", "+00:00"))
    leido_dt = datetime.fromisoformat(leido.replace("Z", "+00:00"))

    edad_seg = (ahora - leido_dt).total_seconds()
    if edad_seg > frescura_s:
        return (False, "lectura vieja (más de 6 h)")

    saldo_ultimo = estado.get("saldo_ultimo")
    if not isinstance(saldo_ultimo, (int, float)):
        return (False, "sin lectura")

    if saldo_ultimo < margen_min_usd:
        return (False, "saldo bajo el margen")

    gasto = gasto_del_dia(estado)
    if gasto >= tope_dia_usd:
        return (False, "tope del día alcanzado")

    return (True, "ok")