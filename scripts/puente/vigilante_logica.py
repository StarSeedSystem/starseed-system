#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Selección pura de trabajo real para el vigilante del enjambre."""

import re


# Estos estados necesitan una decisión humana o ya cerraron la tarea. Repetirlos
# automáticamente cada 90 s solo gasta proveedores y multiplica el historial.
ESTADOS_NO_AUTOMATICOS = {
    "commit",
    "bloqueante",
    "sustituida",
    "rechazada",
    "sin_cambios",
    "fallo",
    "fallo_tsc",
    "fallo_tests",
    "conflicto",
    "reasignada",
    "pendiente_aprobacion",
    "esperando_aprobacion",
    "bloqueada",
}


def es_cola_fuente(nombre):
    """Las colas `auto-*` son copias de ejecución, nunca demanda nueva."""
    return (
        nombre.startswith("cola-")
        and nombre.endswith(".json")
        and not nombre.startswith("cola-auto-")
    )


def ultima_salida(lineas, tope=200):
    """Del registro del orquestador saca (codigo_exit, motivo) de la ÚLTIMA línea
    `__EXIT__=N`. El motivo es la última línea no vacía anterior. Si no hay
    marca `__EXIT__`, devuelve (None, "")."""
    codigo, motivo = None, ""
    anterior = ""
    for linea in lineas:
        limpia = linea.rstrip()
        if limpia.startswith("__EXIT__="):
            try:
                codigo = int(limpia.split("=", 1)[1].strip())
            except ValueError:
                codigo, motivo = None, ""
            else:
                motivo = anterior[:tope]
        elif limpia:
            anterior = limpia
    return codigo, motivo


def id_en_asuntos(tid, asuntos):
    """Reconoce el id como token completo en asuntos de commits de `main`."""
    patron = re.compile(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(tid))
    return any(patron.search(asunto) for asunto in asuntos)


def seleccionar_pendientes(colas, progreso, asuntos_git):
    """Deduplica por id y excluye cierres, copias automáticas e integradas en git.

    `colas` llega ordenada de más nueva a más antigua como pares
    `(nombre, tareas)`, de modo que ante deuda histórica gana la definición nueva.
    """
    vistas, salida = set(), []
    for nombre, tareas in colas:
        if not es_cola_fuente(nombre):
            continue
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            estado = progreso.get(tid, {})
            actual = estado.get("estado") if isinstance(estado, dict) else ""
            if actual in ESTADOS_NO_AUTOMATICOS or id_en_asuntos(tid, asuntos_git):
                continue
            salida.append(tarea)
    return salida


def decidir_relanzamiento(cfg, hay_orquestador, n_pendientes):
    """Decisión pura de relanzar sin tocar disco ni procesos.

    Devuelve (relanzar, trabajadores, tope). No relanza si el orquestador ya
    vive, si no queda trabajo o si el Mando puso `pausado` para ajustar.
    """
    trabajadores = int(cfg.get("trabajadores", 5))
    tope = int(cfg.get("tope_por_relanzamiento", 20))
    if hay_orquestador or n_pendientes <= 0 or cfg.get("pausado"):
        return (False, trabajadores, tope)
    return (True, trabajadores, tope)
