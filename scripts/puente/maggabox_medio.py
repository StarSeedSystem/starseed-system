# -*- coding: utf-8 -*-
"""Estado y decisiones del medio Maggabox (ALM1125B).

Decisiones PURAS (`decidir_lanzar_maggabox`, `debe_prestar`, `rama_de_cola`,
`columnas_pendientes`): reciben lo medido y responden sin tocar disco, red ni procesos.
La E/S es una capa fina inyectable. No usa SSH, no usa systemd, no toca la red.

Maggabox (405 GB libres) debe usarse sola cuando la Mac va justa.
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Dict, List, Optional

# Constantes de ruta
RAIZ = "/Volumes/Maggabit"
TRABAJO = "/Volumes/MaggabitTrabajo"
BOVEDA = "/Volumes/MaggabitBoveda"

PREFIJO_COLA = "colas/maggabox-"
PREFIJO_ENTREGA = "nube/mg-"
RE_ENTRANTE = re.compile(r"^cola-maggabox-[A-Za-z0-9._-]{1,80}\.json$")
RE_ID_TAREA = re.compile(r"^[A-Za-z0-9._-]{1,60}$")


def rama_de_cola(ts: float) -> str:
    """Nombre de la rama de cola de Maggabox para la hora ts (AAAAMMDD-HHMMSS)."""
    return time.strftime("colas/maggabox-%Y%m%d-%H%M%S", time.gmtime(ts))


def decidir_lanzar_maggabox(
    estado: Dict, ahora: float, ultimo_lanzamiento: Optional[float],
    colas_sin_tomar: List[str],
) -> tuple:
    """PURA. ¿Debe lanzar una cola en la Maggabox? → (sí/no, motivo).

    Reglas: fase 'espera', no lanzar en menos de 120 s, haber colas pendientes.
    No toca disco ni red.
    """
    if estado.get("fase") != "espera":
        return False, "en otra fase"
    if ultimo_lanzamiento and ahora - ultimo_lanzamiento < 120:
        return False, "lanzamiento reciente"
    if not colas_sin_tomar:
        return False, "sin colas nuevas"
    return True, "listo"


def debe_prestar(nivel_disco: float, estado_mg: Dict, ahora: float) -> tuple:
    """PURA. ¿Debe prestar la cola a la Maggabox? (Mac < umbral)."""
    if nivel_disco > 30:
        return False, "disco Mac disponible"
    return True, f"disco Mac bajo ({nivel_disco}% libre)"


def colas_pendientes(refs, procesadas, reintentos=None, ahora=None):
    """PURA. Las ramas `colas/maggabox-*` que aún no se trabajaron, la más vieja primero.

    `refs`: {rama: (sha, fecha_ts)}; `procesadas`: {rama: sha}.
    Una rama que se reescribe (otro sha con el mismo nombre) cuenta como otra cola.
    """
    ahora = time.time() if ahora is None else agora
    salida = []
    for rama, (sha, fecha) in (refs or {}).items():
        if not str(rama).startswith(PREFIJO_COLA):
            continue
        if (procesadas or {}).get(rama) == sha:
            continue
        salida.append((float(fecha or 0), rama))
    return [r for _, r in sorted(salida)]


columnas_pendientes = colas_pendientes  # alias for test imports