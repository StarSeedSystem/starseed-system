#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Salud de proveedores (Ola 316 · p316B): quién está agotado, cuándo renueva y a
quién enrutar. Módulo PURO: recibe el estado de agotamiento y el catálogo, no lee
disco ni red, y jamás imprime valores de clave (solo nombres de proveedor).

Convenciones del estado de agotamiento:
  * «horaria» (motivo 429): renueva a los CUPO_HORARIO_MIN=300 min del marcado.
  * «diaria»  (motivo 402 o cuota): renueva a las 00:00 UTC SIGUIENTES al marcado.
"""

import calendar
import time

CUPO_HORARIO_MIN = 300

_MOTIVOS_DIARIOS = {"402", "cuota"}


def _renueva_en_min(motivo, desde, ahora):
    """Minutos que faltan para que un proveedor agotado renueve, o 0 si ya venció."""
    if motivo in _MOTIVOS_DIARIOS:
        base = time.gmtime(desde)
        dia = base.tm_yday + 1
        anio = base.tm_year
        # días/años bisiestos: ajusta por desborde del día juliano
        if dia > 365 + (1 if calendar.isleap(anio) else 0):
            dia, anio = 1, anio + 1
        renueva = calendar.timegm((anio, 1, dia, 0, 0, 0, 0, 0, 0))
    else:
        renueva = desde + CUPO_HORARIO_MIN * 60
    return max(0, int((renueva - ahora) / 60))


def estado_proveedores(agotados, ahora, catalogo):
    """Estado de cada proveedor: {proveedor, agotado, renueva_en_min, motivo, alternativa}."""
    proveedores = list(catalogo)
    for nombre in agotados:
        if nombre not in proveedores:
            proveedores.append(nombre)
    agotados_set = set(agotados)
    estados = []
    for nombre in proveedores:
        if nombre in agotados:
            ent = agotados[nombre]
            motivo = ent.get("motivo") or "cuota"
            desde = ent.get("desde")
            desde = float(desde) if desde is not None else ahora
            estados.append(
                {
                    "proveedor": nombre,
                    "agotado": True,
                    "renueva_en_min": _renueva_en_min(motivo, desde, ahora),
                    "motivo": motivo,
                    "alternativa": _alternativa(nombre, catalogo, agotados_set),
                }
            )
        else:
            estados.append(
                {
                    "proveedor": nombre,
                    "agotado": False,
                    "renueva_en_min": None,
                    "motivo": None,
                    "alternativa": None,
                }
            )
    return estados


def proximo_en_renovar(estados):
    """(proveedor, minutos) del agotado que antes se recupera; None si no hay ninguno."""
    agotados = [e for e in estados if e["agotado"] and e["renueva_en_min"] is not None]
    if not agotados:
        return None
    siguiente = min(agotados, key=lambda e: e["renueva_en_min"])
    return (siguiente["proveedor"], siguiente["renueva_en_min"])


def resumen(estados):
    """Una línea: «PROVEEDORES · 6/8 vivos · agotados: … · enrutando a …»."""
    total = len(estados)
    agotados = [e for e in estados if e["agotado"]]
    vivos = total - len(agotados)
    linea = "PROVEEDORES · %d/%d vivos" % (vivos, total)
    if agotados:
        partes = [_frase_agotado(e) for e in agotados]
        linea += " · agotados: " + ", ".join(partes)
        alt = next((e["alternativa"] for e in agotados if e["alternativa"]), None)
        if alt:
            linea += " · enrutando a " + alt
    return linea


def _alternativa(proveedor, catalogo, agotados_set):
    """Primer proveedor del catálogo que NO esté agotado (y no sea él mismo); None si no hay."""
    for nombre in catalogo:
        if nombre == proveedor or nombre in agotados_set:
            continue
        return nombre
    return None


def _frase_agotado(ent):
    """«groq (renueva en 42 min)» si horario; «llm7 (cuota diaria)» si diario."""
    if ent["motivo"] in _MOTIVOS_DIARIOS:
        return "%s (cuota diaria)" % ent["proveedor"]
    return "%s (renueva en %d min)" % (ent["proveedor"], ent["renueva_en_min"])
