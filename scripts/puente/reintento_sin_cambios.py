#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Da una segunda oportunidad a las tareas «sin_cambios» con otro proveedor.

POR QUÉ. 2026-09-12: apinex/free/muse-spark-1.3 devolvió 1,5 KB y cero diff en cuatro
tareas nuevas (p316E, MD7, zAR3, LT3). El orquestador las marcó `sin_cambios`, que no
es estado automático: el vigilante no las reintenta y nadie las reasigna. Se quedaron
pudriendo una ola entera.

Esto es módulo PURO: `candidatas` decide a quién reintentar y con qué modelo;
`marcar` devuelve el progreso nuevo con la tarea de vuelta a `pendiente`.
Escribir el archivo y anunciarlo es cosa del director.

Reglas:
  · solo `sin_cambios` cuyo id NO figure ya en main (misma regla de token entero que
    reconciliar_progreso.en_main);
  · nunca una tarea ya reintentada (reintentos >= 1): si el segundo proveedor tampoco
    escribe, que la vea una persona, no un bucle;
  · el modelo alternativo es el primero libre distinto del que la produjo.
"""

import ast
from reconciliar_progreso import en_main

SIN_CAMBIOS = "sin_cambios"
NOTA_REINTENTO = "reintento por sin_cambios con %s"


def modelos_enjambre(ruta):
    """Lee la lista MODELOS de starseed-enjambre.py con ast, sin ejecutar el archivo."""
    arbol = ast.parse(open(ruta, encoding="utf-8").read(), ruta)
    for nodo in arbol.body:
        if isinstance(nodo, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "MODELOS" for t in nodo.targets
        ):
            return list(ast.literal_eval(nodo.value))
    return []


def candidatas(progreso, asuntos_main, modelos_libres):
    """Devuelve [(id, modelo_alternativo)] para cada sin_cambios reintentable."""
    elegidas = []
    for tid, v in progreso.items():
        if not isinstance(v, dict) or v.get("estado") != SIN_CAMBIOS:
            continue
        if en_main(tid, asuntos_main):  # ya está en main: era falso sin_cambios
            continue
        if (v.get("reintentos") or 0) >= 1:  # ya tuvo su segunda oportunidad
            continue
        modelo = next((m for m in modelos_libres if m != v.get("modelo")), None)
        if modelo is None:  # el único libre es el que la produjo
            continue
        elegidas.append((tid, modelo))
    return elegidas


def marcar(progreso, tid, modelo):
    """Devuelve el progreso nuevo con la tarea de vuelta a pendiente. No toca el original."""
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    v = p[tid]
    v.update(
        estado="pendiente",
        reintentos=(v.get("reintentos") or 0) + 1,
        nota=NOTA_REINTENTO % modelo,
    )
    return p
