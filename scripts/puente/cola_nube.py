#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Selección pura de trabajo para el arranque de la nube.

Los contenedores de la nube nacen sin `starseed_memory_root` (cero colas,
cero progreso); lo único persistente es git. Por eso aquí no hay estado que
consultar: lo pendiente se deduce de las colas versionadas en
`enjambre/colas/` y de los asuntos de `main`.
"""

from vigilante_logica import id_en_asuntos


def seleccionar(colas, asuntos_main, tope=20):
    """Dedup por id, fuera lo ya integrado en git, hasta `tope` en orden.

    `colas` es una lista de pares `(nombre, tareas)` en el orden en que se
    quieren ejecutar; `asuntos_main` son los asuntos de los commits de
    `main`. Un id que figure como token entero en algún asunto ya está hecho.
    """
    vistas, salida = set(), []
    for _nombre, tareas in colas:
        if not isinstance(tareas, list):
            continue
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            if id_en_asuntos(tid, asuntos_main):
                continue
            salida.append(tarea)
            if len(salida) >= tope:
                return salida
    return salida


def modo_publicacion(salida_dry_run):
    """'push' si el push --dry-run no ha sido rechazado; si no, 'parche'."""
    texto = (salida_dry_run or "").lower()
    if "403" in texto or "access denied" in texto:
        return "parche"
    return "push"
