#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Planificación de MetaGeminis: enfriamiento por sitio y reparto de intentos.

Funciones puras sin red, sin reloj real, sin efectos laterales.
Contrato: architecture/metageminis.md §2 (L3), §4, §11 (MGS-PLAN).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


DIAS_ENFRIAMIENTO = 14
ESTADO_PARA_APROBAR = "para_aprobar"
ESTADO_ENVIADO = "enviado"
ESTADO_DESCARTADO = "descartado"


def _parse_iso(fecha: str) -> datetime | None:
    """Parsea una fecha ISO 8601 a datetime con zona horaria UTC. None si no es legible."""
    try:
        # Soporta tanto '2026-11-07T11:51:00Z' como '2026-11-07T11:51:00+00:00'
        if fecha.endswith("Z"):
            fecha = fecha[:-1] + "+00:00"
        return datetime.fromisoformat(fecha)
    except Exception:
        return None


def en_enfriamiento(sitio_id: str, filas: list[dict[str, Any]], ahora: str, dias: int = DIAS_ENFRIAMIENTO) -> tuple[bool, str]:
    """Devuelve (True, motivo) si el sitio está en enfriamiento.

    Un sitio está en enfriamiento si alguna fila de la cola para ese sitio está:
    - enviada (estado == "enviado") con fecha dentro de los últimos `dias` días.

    Los borradores pendientes de aprobar (estado == "para_aprobar") se gestionan
    mediante el mecanismo existente de `en_espera` en `ciclo()`; no enfrían aquí.
    Un borrador descartado (estado == "descartado") NO enfría.
    Una fila sin fecha legible no enfría.
    El motivo dice cuánto falta: "enfriamiento: último borrador hace 3 días; vuelve en 11".
    """
    ahora_dt = _parse_iso(ahora)
    if ahora_dt is None:
        return False, ""

    ultima_fecha: datetime | None = None
    for f in filas:
        if f.get("sitio_id") != sitio_id:
            continue
        estado = f.get("estado", ESTADO_PARA_APROBAR)
        if estado == ESTADO_DESCARTADO:
            continue
        if estado == ESTADO_ENVIADO:
            # Enviado: enfría si está dentro de la ventana
            enviado_en = f.get("enviado_en")
            if enviado_en:
                dt = _parse_iso(enviado_en)
                if dt and (ultima_fecha is None or dt > ultima_fecha):
                    ultima_fecha = dt

    if ultima_fecha is None:
        return False, ""

    diff_dias = (ahora_dt - ultima_fecha).days
    if diff_dias < dias:
        queda = dias - diff_dias
        return True, f"enfriamiento: último borrador hace {diff_dias} días; vuelve en {queda}"
    return False, ""


def repartir_intentos(estadisticas: dict[str, dict[str, int]], total: int, minimo: int = 1) -> dict[str, int]:
    """Reparte `total` intentos entre las claves según sus estadísticas.

    estadisticas = {clave: {"enviados": int, "respondidos": int}}

    - Si alguna clave tiene menos de 10 envíos medidos → reparto igual ("sin conclusión").
    - Si todas tienen 10 o más → proporcional a tasa de respuesta suavizada:
      (respondidos + 1) / (enviados + 2), nunca por debajo de `minimo`.
    - La suma es exactamente `total` (restos a claves mayores, desempate por clave: determinista).
    - Si `total` no llega para el mínimo de todas → reparto igual.
    """
    if not estadisticas or total <= 0:
        return {}

    claves = sorted(estadisticas.keys())
    n = len(claves)

    # Verificar si alguna clave tiene < 10 envíos
    sin_conclusion = any(estadisticas[k].get("enviados", 0) < 10 for k in claves)

    if sin_conclusion:
        # Reparto igual
        base = total // n
        resto = total % n
        resultado = {k: base for k in claves}
        for i in range(resto):
            resultado[claves[i]] += 1
        return resultado

    # Todas tienen >= 10 envíos: reparto por tasa suavizada
    tasas = {}
    for k in claves:
        e = estadisticas[k].get("enviados", 0)
        r = estadisticas[k].get("respondidos", 0)
        tasas[k] = (r + 1) / (e + 2)

    # Asignar mínimo a cada uno primero
    asignado = {k: minimo for k in claves}
    restante = total - minimo * n

    if restante < 0:
        # No alcanza para el mínimo de todos → reparto igual (sin mínimo)
        base = total // n
        resto = total % n
        resultado = {k: base for k in claves}
        for i in range(resto):
            resultado[claves[i]] += 1
        return resultado

    # Repartir lo restante proporcionalmente a las tasas
    suma_tasas = sum(tasas.values())
    if suma_tasas == 0:
        # Todas las tasas son 0 → reparto igual del resto
        base = restante // n
        resto = restante % n
        for i, k in enumerate(claves):
            asignado[k] += base
            if i < resto:
                asignado[k] += 1
        return asignado

    # Calcular partes proporcionales
    partes = {}
    for k in claves:
        partes[k] = tasas[k] / suma_tasas * restante

    # Asignar parte entera
    for k in claves:
        asignado[k] += int(partes[k])

    # Repartir restos (mayor parte fraccionaria primero, desempate por clave)
    restante_despues = total - sum(asignado.values())
    if restante_despues > 0:
        # Ordenar por parte fraccionaria descendente, luego por clave
        claves_ordenadas = sorted(claves, key=lambda k: (-(partes[k] - int(partes[k])), k))
        for i in range(restante_despues):
            asignado[claves_ordenadas[i]] += 1

    return asignado


def motivo_reparto(estadisticas: dict[str, dict[str, int]]) -> str:
    """Devuelve el motivo del reparto: 'sin conclusión: …' o 'por tasa de respuesta'."""
    if not estadisticas:
        return "sin conclusión: sin estadísticas"
    claves = sorted(estadisticas.keys())
    sin_conclusion = any(estadisticas[k].get("enviados", 0) < 10 for k in claves)
    if sin_conclusion:
        claves_menos_10 = [k for k in claves if estadisticas[k].get("enviados", 0) < 10]
        return f"sin conclusión: {', '.join(claves_menos_10)} con menos de 10 envíos"
    return "por tasa de respuesta"