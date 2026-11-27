# -*- coding: utf-8 -*-
"""Tareas con prioridad (AUT1116A): la regla de PRI01, en un sitio que el puente puede importar.

El orquestador (`scripts/enjambre/starseed-enjambre.py`) ya ordena su tanda con `prioridad_de_tarea`
(PRI01), pero ese archivo no se puede importar desde el puente (lleva guion y arranca un enjambre), y
el reparto a la nube, el vigilante y el llenado de huecos decidían sin saber qué era urgente: el 16-11
tres colas de una tarea «URGENTE» (VOZ01, FRN01, DSB01) se cedieron a la nube a las 14:50 y allí
quedaron. Aquí vive la MISMA regla (hay una prueba que las compara) y lo que el puente hace con ella:

  · `prioridad_de_tarea(t)`: `prioridad` numérica, 100 si `urgente` es verdadero o el título empieza
    por «URGENTE», 0 en lo demás. Nunca lanza.
  · `ordenar_primero(tareas)`: las prioritarias delante, el resto en su orden (estable).
  · `retiene_la_mac(tarea, entrada, ahora)`: una prioritaria que la Mac aún puede coger no se cede.
"""
from __future__ import annotations

import time

#: Cuánto espera una tarea prioritaria (sin empezar) a que la Mac la coja antes de poder cederse a la
#: nube: la Mac coge trabajo en cuanto se libera un trabajador, y un orquestador parado se reinicia solo
#: en ~10 min (`autocuracion_mando.ORQ_PARADO_S`); pasada hora y media, es que la Mac no puede.
ESPERA_MAC_S = 90 * 60
#: Estados de una tarea que la Mac todavía no ha empezado ni dejado a medias.
SIN_EMPEZAR = (None, "", "pendiente")


def prioridad_de_tarea(t):
    """PURA: la prioridad como float (la regla de PRI01). Nunca lanza."""
    try:
        p = t.get("prioridad")
        if isinstance(p, (int, float)) and not isinstance(p, bool):
            return float(p)
    except Exception:  # noqa: BLE001
        return 0.0
    try:
        if t.get("urgente") is True:
            return 100.0
        if str(t.get("titulo") or "").strip().upper().startswith("URGENTE"):
            return 100.0
    except Exception:  # noqa: BLE001
        pass
    return 0.0


def es_prioritaria(t):
    """PURA: ¿tiene prioridad por encima de la normal?"""
    return prioridad_de_tarea(t) > 0


def ordenar_primero(tareas):
    """PURA: las mismas tareas con las prioritarias delante (mayor prioridad primero) y, a igualdad, en el
    orden en que venían. No quita ni añade ninguna."""
    if not isinstance(tareas, list):
        return tareas
    return [t for _i, t in sorted(enumerate(tareas), key=lambda par: (-prioridad_de_tarea(par[1]), par[0]))]


def _epoch(entrada):
    try:
        return time.mktime(time.strptime(str((entrada or {}).get("t") or ""), "%Y-%m-%d %H:%M:%S"))
    except (ValueError, OverflowError, AttributeError):
        return None


#: (DIR1127C, 27-11) ¿Puede la Mac EMPEZAR tareas ahora? Lo fija quien reparte (`repartir-a-nube.py`) con
#: `mac_puede_empezar()` antes de elegir. Por defecto True (las pruebas y los demás llamadores no cambian).
MAC_LIBRE = True


def mac_puede_empezar(disco=None, gobernador=None):
    """PURA: False si el guardia de disco retiene los arranques o el gobernador deja la Mac sin trabajadores.

    Medido el 27-11 a la 01:12: disco 5,6 GB (< 6, `retiene_arranques`), presión de memoria y 1 de 3
    trabajando, con 20 tareas «urgentes» guardadas para la Mac durante hora y media mientras la nube de
    GitHub estaba ociosa. Lo urgente debe ir donde se pueda hacer YA."""
    try:
        if isinstance(disco, dict) and disco.get("retiene_arranques"):
            return False
        if isinstance(gobernador, dict) and int(gobernador.get("trabajadores", 1) or 0) <= 0:
            return False
    except (TypeError, ValueError):
        return True
    return True


def retiene_la_mac(tarea, entrada, ahora=None, espera_s=ESPERA_MAC_S, mac_libre=None):
    """PURA: ¿esta tarea prioritaria se queda en la Mac y NO se cede a la nube?

    Se queda si tiene prioridad, la Mac aún no la empezó (`pendiente` o sin entrada) y no lleva más de
    `espera_s` esperando (según `t` de su entrada; sin `t` se supone que acaba de llegar). Una que ya
    falló o quedó sin cambios (`fallo`, `sin_cambios`…) sí puede ir: la Mac no la repite sola.
    (DIR1127C) Si la Mac no puede empezar nada ahora (`mac_libre` False, o `MAC_LIBRE` False), no retiene."""
    if not (MAC_LIBRE if mac_libre is None else mac_libre):
        return False
    if not es_prioritaria(tarea):
        return False
    estado = entrada.get("estado") if isinstance(entrada, dict) else None
    if estado not in SIN_EMPEZAR:
        return False
    ahora = time.time() if ahora is None else ahora
    desde = _epoch(entrada)
    return desde is None or ahora - desde <= espera_s
