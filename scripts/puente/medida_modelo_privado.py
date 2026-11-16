#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Medida del modelo privado en tareas de la fábrica (MQB5 · MOD1116).

QUÉ HACE
--------
Calcula métricas puras a partir de mediciones ya existentes (sin red, sin textos de
prompt) y emite un veredicto para decidir si el modelo privado se queda en la fábrica.

ENTRADA (inyectada, nunca se lee de disco en las funciones puras)
---------------------------------------------------------------
Lista de mediciones, cada una con:
    id: str                 — identificador del caso (hash, no texto)
    modelo: str             — "privado" | "abliteration" | "flota"
    ttft_ms: float | None   — tiempo hasta el primer token (ms)
    tokens_s: float | None  — tokens por segundo
    rss_mb: float | None    — memoria pico del servicio (MB)
    rechazado: bool         — la respuesta contiene una negativa del modelo base
    acuerda_con_flota: bool | None  — coincidencia con la respuesta de la flota (solo para no-flota)

SALIDA (solo métricas, ningún texto de prompt)
---------------------------------------------
resumir(mediciones) -> dict por modelo con:
    casos, ttft_mediana_ms, ttft_p90_ms, tokens_s_mediana, rss_pico_mb,
    tasa_rechazo, acuerdo_con_flota (solo privado/abliteration)

veredicto(resumen, umbrales=UMBRALES) -> "se queda" | "se descarta" | "faltan datos"
    «se queda»      si completa ≥ 90 % de los casos que la flota NO rechazó
                    y su ttft_mediana ≤ 600 s
    «se descarta»   en cualquier otro caso con datos suficientes
    «faltan datos»  si hay < 200 casos del modelo privado

UMBRALES (un solo sitio, Alex los cambia aquí)
---------------------------------------------
"""
from __future__ import annotations

import math
import statistics
from collections import defaultdict
from typing import Any


# ──────────────────────────────────────────────────────────────────────────────
# UMBRALES — un solo sitio
# ──────────────────────────────────────────────────────────────────────────────
UMBRALES = {
    "min_casos_privado": 200,         # casos mínimos del modelo privado para veredicto
    "completitud_min": 0.90,          # ≥ 90 % de casos que la flota no rechazó
    "ttft_mediana_max_s": 600.0,      # tiempo hasta primer token (mediana) ≤ 600 s
}


# ──────────────────────────────────────────────────────────────────────────────
# Utilidades puras
# ──────────────────────────────────────────────────────────────────────────────
def _num(x: Any) -> float | None:
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def _filtrar(valores: list[float | None]) -> list[float]:
    return [v for v in valores if v is not None]


def _percentil(valores: list[float], q: float) -> float | None:
    """Percentil por índice más cercano (q en 0..1)."""
    if not valores:
        return None
    v = sorted(valores)
    idx = min(len(v) - 1, max(0, int(math.ceil(q * len(v))) - 1))
    return v[idx]


def _mediana(valores: list[float]) -> float | None:
    if not valores:
        return None
    return statistics.median(valores)


# ──────────────────────────────────────────────────────────────────────────────
# Función pura: resumir
# ──────────────────────────────────────────────────────────────────────────────
def resumir(mediciones: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Agrupa métricas por modelo (privado, abliteration, flota).

    Args:
        mediciones: lista de dicts con claves:
            id, modelo, ttft_ms, tokens_s, rss_mb, rechazado, acuerda_con_flota

    Returns:
        dict por modelo con:
            casos, ttft_mediana_ms, ttft_p90_ms, tokens_s_mediana, rss_pico_mb,
            tasa_rechazo, acuerdo_con_flota (None para flota)
    """
    por_modelo: dict[str, list[dict]] = defaultdict(list)
    for m in mediciones:
        modelo = str(m.get("modelo", "")).lower()
        if modelo in ("privado", "abliteration", "flota"):
            por_modelo[modelo].append(m)

    resultado: dict[str, dict[str, Any]] = {}
    for modelo, lista in por_modelo.items():
        ttft = _filtrar([_num(x.get("ttft_ms")) for x in lista])
        tok_s = _filtrar([_num(x.get("tokens_s")) for x in lista])
        rss = _filtrar([_num(x.get("rss_mb")) for x in lista])

        rechazados = sum(1 for x in lista if x.get("rechazado") is True)
        no_rechazados = [x for x in lista if x.get("rechazado") is not True]

        acuerdos = [x for x in lista if x.get("acuerda_con_flota") is not None]
        acuerdo_count = sum(1 for x in acuerdos if x.get("acuerda_con_flota") is True)

        ttft_med = _mediana(ttft)
        ttft_p90 = _percentil(ttft, 0.9)
        tok_med = _mediana(tok_s)
        rss_max = max(rss) if rss else None

        resultado[modelo] = {
            "casos": len(lista),
            "ttft_mediana_ms": round(ttft_med, 1) if ttft_med is not None else None,
            "ttft_p90_ms": round(ttft_p90, 1) if ttft_p90 is not None else None,
            "tokens_s_mediana": round(tok_med, 1) if tok_med is not None else None,
            "rss_pico_mb": round(rss_max, 1) if rss_max is not None else None,
            "tasa_rechazo": round(rechazados / len(lista), 4) if lista else 0.0,
            "acuerdo_con_flota": round(acuerdo_count / len(acuerdos), 4) if acuerdos else None,
            # Auxiliar para el veredicto: casos que la flota NO rechazó
            "_no_rechazados_flota": None,
        }

    # Calcular completitud del privado/abliteration frente a lo que la flota no rechazó
    flota_no_rechazados = set()
    if "flota" in por_modelo:
        for x in por_modelo["flota"]:
            if x.get("rechazado") is not True:
                flota_no_rechazados.add(x.get("id"))

    for modelo in ("privado", "abliteration"):
        if modelo in resultado and flota_no_rechazados:
            completados = sum(
                1 for x in por_modelo.get(modelo, [])
                if x.get("id") in flota_no_rechazados and x.get("rechazado") is not True
            )
            resultado[modelo]["_no_rechazados_flota"] = len(flota_no_rechazados)
            resultado[modelo]["_completados_sin_rechazo"] = completados
            if flota_no_rechazados:
                resultado[modelo]["completitud"] = round(completados / len(flota_no_rechazados), 4)
            else:
                resultado[modelo]["completitud"] = 0.0

    return resultado


# ──────────────────────────────────────────────────────────────────────────────
# Función pura: veredicto
# ──────────────────────────────────────────────────────────────────────────────
def veredicto(
    resumen: dict[str, dict[str, Any]],
    umbrales: dict[str, float] | None = None
) -> str:
    """Devuelve «se queda» | «se descarta» | «faltan datos» para el modelo privado.

    Reglas (umbrales en UMBRALES):
    - «faltan datos»: menos de min_casos_privado casos del modelo privado
    - «se queda»:   completitud ≥ completitud_min (casos que flota no rechazó y privado completa)
                    Y ttft_mediana_ms ≤ ttft_mediana_max_s * 1000
    - «se descarta»: en cualquier otro caso con datos suficientes
    """
    u = umbrales or UMBRALES
    privado = resumen.get("privado")
    if not privado:
        return "faltan datos"

    if privado["casos"] < u["min_casos_privado"]:
        return "faltan datos"

    completitud = privado.get("completitud", 0.0)
    ttft_mediana_ms = privado.get("ttft_mediana_ms")

    if completitud >= u["completitud_min"] and ttft_mediana_ms is not None:
        if ttft_mediana_ms <= u["ttft_mediana_max_s"] * 1000.0:
            return "se queda"

    return "se descarta"


# ──────────────────────────────────────────────────────────────────────────────
# CLI mínima (solo para uso manual, no toca red ni disco real en pruebas)
# ──────────────────────────────────────────────────────────────────────────────
def main(argv: list[str] | None = None) -> int:
    import argparse
    import json
    import sys

    p = argparse.ArgumentParser(description="Medida del modelo privado (solo métricas)")
    p.add_argument("--json", action="store_true", help="salida JSON")
    p.add_argument("--archivo", help="ruta a JSON con mediciones (lista de objetos)")
    a = p.parse_args(argv)

    if a.archivo:
        with open(a.archivo, encoding="utf-8") as f:
            datos = json.load(f)
    else:
        datos = []

    res = resumir(datos)
    ver = {m: veredicto({m: v}, UMBRALES) for m, v in res.items() if m == "privado"}
    salida = {"resumen": res, "veredicto": ver}
    print(json.dumps(salida, ensure_ascii=False, indent=2) if a.json else str(salida))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())