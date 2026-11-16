#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo puro de créditos abliteration.ai (MOD1116).

Proporciona funciones para gestionar el saldo y gasto del día a partir
de la respuesta de GET /v1/credits. Todo es inyectado: no hay red, ni
disco, ni reloj propio.

Usage from tests:
    from scripts.puente.abliteration_creditos import saldo_usd, registrar,
        gasto_del_dia, permitido

    resp = {"data": {"total_credits": 100.0, "total_usage": 42.5}}
    saldo_usd(resp)  # → 57.5
"""

from __future__ import annotations

from datetime import datetime, date, timezone, timedelta


def saldo_usd(respuesta: dict) -> float | None:
    """Devolver saldo neto: total_credits - total_usage, redondeado a 6 decimales.

    Retorna None si falta algún campo, no es número o el saldo sale negativo.
    """
    try:
        data = respuesta.get("data") or respuesta
        total_credits = data.get("total_credits")
        total_usage = data.get("total_usage")
        if total_credits is None or total_usage is None:
            return None
        if not isinstance(total_credits, (int, float)) or not isinstance(total_usage, (int, float)):
            return None
        s = round(total_credits - total_usage, 6)
        if s < 0:
            return None
        return s
    except Exception:
        return None


def _dia_hoy(ahora_iso: str) -> str:
    """Extrair el día AAAA-MM-DD de una cadena ISO."""
    try:
        dt = datetime.fromisoformat(ahora_iso)
        return dt.date().isoformat()
    except Exception:
        return ""


def registrar(estado: dict, saldo: float | None, ahora_iso: str) -> dict:
    """Registrar el estado de créditos, actualizando día si cambia.

    estado: dict con claves `dia`, `saldo_inicio_dia`, `saldo_ultimo`, `leido`.
    saldo: valor numérico o None.
    ahora_iso: cadena ISO con la fecha/hora actual.
    """
    dia_hoy = _dia_hoy(ahora_iso)
    if not dia_hoy:
        return estado

    if estado.get("dia") != dia_hoy:
        # Cambio de día: saldo_inicio_dia pasa a ser el último saldo conocido
        nuevo = dict(estado)
        nuevo["dia"] = dia_hoy
        nuevo["saldo_inicio_dia"] = nuevo.get("saldo_ultimo")
        nuevo["saldo_ultimo"] = saldo
        nuevo["leido"] = ahora_iso
        return nuevo

    # Mismo día: actualizar último saldo
    nuevo = dict(estado)
    nuevo["saldo_ultimo"] = saldo
    nuevo["leido"] = ahora_iso
    return nuevo


def gasto_del_dia(estado: dict) -> float:
    """Devolver el gasto del día (siempre ≥ 0).

    El gasto = saldo_inicio_dia - saldo_ultimo (si ambos existen).
    """
    saldo_inicio = estado.get("saldo_inicio_dia")
    saldo_ultimo = estado.get("saldo_ultimo")
    if saldo_inicio is None or saldo_ultimo is None:
        return 0.0
    gasto = float(saldo_inicio) - float(saldo_ultimo)
    return max(gasto, 0.0)


def permitido(
    estado: dict,
    ahora_iso: str,
    tope_dia_usd: float,
    margen_min_usd: float = 0.5,
    frescura_s: int = 21600,
) -> tuple[bool, str]:
    """Verificar si el saldo está dentro de límites permitidos.

    Retorna (bool, motivo) donde motivo es uno de:
      - "sin lectura": no hay fecha de lectura
      - "lectura vieja (más de 6 h)": la lectura es antigua
      - "saldo bajo el margen": saldo bajo respecto al tope
      - "tope del día alcanzado": se llegó al tope diario
      - "ok": todo bien
    """
    dia_hoy = _dia_hoy(ahora_iso)
    if not dia_hoy:
        return False, "sin lectura"

    # Determinar la hora de la última lectura desde el estado
    leido = estado.get("leido")
    if leido is None:
        return False, "sin lectura"

    try:
        dt_now = datetime.fromisoformat(ahora_iso)
        dt_leido = datetime.fromisoformat(leido)
    except Exception:
        return False, "lectura vieja (más de 6 h)"

    # Comprobar frescura: si la lectura tiene más de frescura_s segundos, es vieja
    diferencia = (dt_now - dt_leido).total_seconds()
    if diferencia > frescura_s:
        return False, "lectura vieja (más de 6 h)"

    # Comprobar tope del día: gasto desde inicio de día >= tope
    saldo_ultimo = estado.get("saldo_ultimo")
    saldo_inicio = estado.get("saldo_inicio_dia")
    if saldo_ultimo is not None and saldo_inicio is not None:
        gasto = float(saldo_inicio) - float(saldo_ultimo)
        if gasto >= tope_dia_usd:
            return False, "tope del día alcanzado"

    # Comprobar saldo bajo el margen
    if saldo_ultimo is not None:
        if saldo_ultimo < margen_min_usd:
            return False, "saldo bajo el margen"

    return True, "ok"


# MQA8: Constantes del plan gratuito de abliteration.ai y límites de la fábrica
PLAN_RPM = 60
PLAN_TPM = 1_000_000
PLAN_PETICIONES_DIA = 10_000
PLAN_A_LA_VEZ = 4

FABRICA_RPM = 30
FABRICA_PETICIONES_DIA = 5_000
FABRICA_A_LA_VEZ = 2


def cabe_peticion(
    hechas_hoy: int | None,
    en_el_ultimo_minuto: int | None,
    en_curso: int | None,
) -> tuple[bool, str]:
    """Verificar si la petición cabe dentro de los límites permitidos por la fábrica."""
    if hechas_hoy is None:
        return False, "dato None: hechas_hoy"
    if en_el_ultimo_minuto is None:
        return False, "dato None: en_el_ultimo_minuto"
    if en_curso is None:
        return False, "dato None: en_curso"

    if hechas_hoy >= FABRICA_PETICIONES_DIA:
        return False, "límite peticiones al día alcanzado"
    if en_el_ultimo_minuto >= FABRICA_RPM:
        return False, "límite peticiones por minuto (RPM) alcanzado"
    if en_curso >= FABRICA_A_LA_VEZ:
        return False, "límite peticiones simultáneas alcanzado"

    return True, "ok"


def _es_url_remota_imagen(obj, es_imagen: bool = False) -> bool:
    if isinstance(obj, str):
        if es_imagen:
            s = obj.strip().lower()
            if s.startswith("http://") or s.startswith("https://"):
                return True
        return False

    if isinstance(obj, dict):
        tipo = str(obj.get("type", "")).lower()
        es_img = es_imagen or tipo in ("image", "image_url", "input_image")
        for k, v in obj.items():
            k_lower = str(k).lower()
            es_campo_img = es_img or k_lower in ("image", "image_url", "image_urls", "url_imagen")
            if k_lower == "url" and es_img:
                es_campo_img = True
            if _es_url_remota_imagen(v, es_campo_img):
                return True
        return False

    if isinstance(obj, list):
        for item in obj:
            if _es_url_remota_imagen(item, es_imagen):
                return True
        return False

    return False


def solo_texto(mensajes: list | dict | str | None) -> bool:
    """Devolver True si no hay imágenes por URL remota (http:// o https://)."""
    if mensajes is None:
        return True
    return not _es_url_remota_imagen(mensajes)
