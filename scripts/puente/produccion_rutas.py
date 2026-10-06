# -*- coding: utf-8 -*-
"""Rutas, presupuestos y regresión del humo de producción (puerta 4, §3.4).

PURO (sin red ni disco, lo que se testea):
    · rutas_del_lote(archivos)      → rutas tocadas + rutas de núcleo
    · presupuestos(ancho_px)         → {"ttfb_ms": 800, "lcp_ms": ...}
    · comparar(actual, ultima_buena) → {"bloqueos": [...], "avisos": [...]}

El detector de rutas vive en capturar_prueba.py y aquí solo se importa.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from capturar_prueba import rutas_de_archivos

_SHA_SEGURO = re.compile(r"[^a-z0-9-]")

RUTAS_NUCLEO = ("/", "/escritorios", "/nexus", "/login")

PRESUPUESTO_TTFB_MS = 800
PRESUPUESTO_LCP_ESCRITORIO_MS = 2500
PRESUPUESTO_LCP_MOVIL_MS = 4000
ANCHO_MOVIL_MAX_PX = 767
FACTOR_AVISO_LENTITUD = 1.5


def rutas_del_lote(archivos):
    """Rutas a probar: las del lote primero, luego las de núcleo, sin repetir."""
    tocadas = rutas_de_archivos(archivos) if archivos else []
    resultado = []
    visto = set()
    for ruta in list(tocadas) + list(RUTAS_NUCLEO):
        if ruta not in visto:
            visto.add(ruta)
            resultado.append(ruta)
    return resultado


def presupuestos(ancho_px):
    """Presupuestos en ms para un ancho de ventana dado (móvil vs escritorio)."""
    es_movil = ancho_px is not None and int(ancho_px) < ANCHO_MOVIL_MAX_PX
    return {
        "ttfb_ms": PRESUPUESTO_TTFB_MS,
        "lcp_ms": PRESUPUESTO_LCP_MOVIL_MS if es_movil else PRESUPUESTO_LCP_ESCRITORIO_MS,
    }


def carpeta_capturas_segura(base, sha):
    """Carpeta `base/<sha-saneado>`; el sha nunca puede salirse de `base`."""
    sano = _SHA_SEGURO.sub("-", str(sha or "").lower()).strip("-") or "sin-sha"
    destino = os.path.normpath(os.path.join(base, sano))
    if os.path.commonpath([os.path.abspath(base), os.path.abspath(destino)]) != os.path.abspath(
        base
    ):
        destino = os.path.join(os.path.abspath(base), "sin-sha")
    return destino


def _mas_lento(valor_actual, valor_anterior):
    """True si la métrica empeora más allá del factor de aviso."""
    if not valor_actual or not valor_anterior:
        return False
    return valor_actual > FACTOR_AVISO_LENTITUD * valor_anterior


def comparar(actual, ultima_buena):
    """Regresión frente a la última publicación buena.

    Ambos son dictos ruta → {"status": int, "ttfb_ms": n, "lcp_ms": n}.
    Bloquea: una ruta que antes daba < 400 ahora da ≥ 400 o falta.
    Avisa: ttfb o lcp más de 1,5× peores.
    """
    bloqueos = []
    avisos = []
    for ruta, antes in (ultima_buena or {}).items():
        ahora = (actual or {}).get(ruta)
        if antes is None:
            continue
        status_antes = antes.get("status") or 0
        if status_antes >= 400:
            continue
        if ahora is None:
            bloqueos.append({"ruta": ruta, "motivo": "la ruta ya no responde"})
            continue
        status_ahora = ahora.get("status") or 0
        if status_ahora >= 400:
            bloqueos.append(
                {"ruta": ruta, "motivo": "era %d y ahora es %d" % (status_antes, status_ahora)}
            )
            continue
        for metrica in ("ttfb_ms", "lcp_ms"):
            if _mas_lento(ahora.get(metrica), antes.get(metrica)):
                avisos.append(
                    {
                        "ruta": ruta,
                        "metrica": metrica,
                        "antes": antes.get(metrica),
                        "ahora": ahora.get(metrica),
                    }
                )
    return {"bloqueos": bloqueos, "avisos": avisos}
