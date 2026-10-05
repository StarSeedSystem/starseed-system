# -*- coding: utf-8 -*-
"""Rutas, presupuestos y regresión del humo de producción (puerta 4, §3.4).

PURO (sin red, sin disco, lo que se testea):
    · rutas_del_lote(archivos)      → rutas tocadas + rutas de núcleo
    · presupuesto_lcp_ms(ancho)     → presupuesto LCP según tamaño
    · comparar(actual, ultima_buena) → {"bloqueos": [...], "avisos": [...]}

El detector de rutas vive en capturar_prueba.py y aquí solo se importa.
"""

from capturar_prueba import rutas_de_archivos

RUTAS_NUCLEO = ("/", "/escritorios", "/nexus", "/login")

PRESUPUESTO_TTFB_MS = 800
PRESUPUESTO_LCP_ESCRITORIO_MS = 2500
PRESUPUESTO_LCP_MOVIL_MS = 4000
ANCHO_MOVIL_MAX = 767
UMBRAL_REGRESION = 1.5


def rutas_del_lote(archivos):
    """Rutas del lote: las que tocaron los archivos, más las de núcleo.

    Orden estable y sin duplicados: primero las tocadas, luego el núcleo.
    """
    resultado = []
    visto = set()
    for ruta in list(rutas_de_archivos(archivos)) + list(RUTAS_NUCLEO):
        if ruta not in visto:
            visto.add(ruta)
            resultado.append(ruta)
    return resultado


def presupuesto_lcp_ms(ancho):
    """Presupuesto de LCP en ms: móvil bajo ANCHO_MOVIL_MAX, si no escritorio."""
    try:
        ancho = int(ancho)
    except (TypeError, ValueError):
        ancho = 0
    if 0 < ancho <= ANCHO_MOVIL_MAX:
        return PRESUPUESTO_LCP_MOVIL_MS
    return PRESUPUESTO_LCP_ESCRITORIO_MS


def _numero(valor):
    """Float o None si no es un número util."""
    try:
        resultado = float(valor)
    except (TypeError, ValueError):
        return None
    return resultado if resultado >= 0 else None


def comparar(actual, ultima_buena):
    """Regresión contra la última publicación buena.

    `actual` y `ultima_buena` son dicts {ruta: {"estado": int, "ttfb_ms": n,
    "lcp_ms": n}}. Bloquea una ruta que antes daba < 400 y ahora no; avisa
    cuando un tiempo (TTFB o LCP) empeora más de UMBRAL_REGRESION veces.
    """
    bloqueos = []
    avisos = []
    for ruta, ahora in (actual or {}).items():
        antes = (ultima_buena or {}).get(ruta)
        if not isinstance(antes, dict) or not isinstance(ahora, dict):
            continue
        estado_antes = _numero(antes.get("estado"))
        estado_ahora = _numero(ahora.get("estado"))
        if (
            estado_antes is not None
            and estado_ahora is not None
            and estado_antes < 400
            and estado_ahora >= 400
        ):
            bloqueos.append(
                "%s: daba %d y ahora da %d" % (ruta, estado_antes, estado_ahora)
            )
        for clave in ("ttfb_ms", "lcp_ms"):
            antes_n = _numero(antes.get(clave))
            ahora_n = _numero(ahora.get(clave))
            if (
                antes_n
                and ahora_n is not None
                and ahora_n > antes_n * UMBRAL_REGRESION
            ):
                avisos.append(
                    "%s: %s empeoró %dx (%d → %d ms)"
                    % (ruta, clave, round(ahora_n / antes_n, 1), antes_n, ahora_n)
                )
    return {"bloqueos": bloqueos, "avisos": avisos}
