#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica pura del reparto a la nube: elegir el atraso y marcarlo.

El atraso candidato es una tarea que (1) no está en main, (2) no está cerrada
ni viva en el progreso y (3) no pertenece a la ola que corre ahora mismo; la
ola actual se queda en la Mac. Está mal invertir en reintentar en local lo que
el estado ya declaró agotado (`fallo*`) o innecesario (`sin_cambios`) y lo que
nunca se tocó: eso es justo lo que la nube puede hacer gratis con LLM7.
"""

from vigilante_logica import id_en_asuntos

MODELO_NUBE = "llm7/minimax-m2.7"
ESTADOS_REPARTIBLES = {None, "sin_cambios", "fallo", "fallo_tests", "fallo_tsc"}


def elegir(colas, progreso, asuntos_main, ola_actual, tope=20):
    """Devuelve hasta `tope` candidatas, deduplicadas por id, con modelo nube."""
    salida, vistas = [], set()
    for nombre, tareas in colas:
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            ola = str(tarea.get("ola") or "")
            if ola_actual and ola.startswith(ola_actual):
                continue
            entrada = progreso.get(tid)
            estado = entrada.get("estado") if isinstance(entrada, dict) else None
            if estado not in ESTADOS_REPARTIBLES:
                continue
            if id_en_asuntos(tid, asuntos_main):
                continue
            vistas.add(tid)
            candidata = dict(tarea)
            candidata["modelo"] = MODELO_NUBE
            salida.append(candidata)
            if len(salida) >= tope:
                return salida
    return salida


def marcar(progreso, ids, fecha):
    """Copia del progreso con esos ids como `reasignada · nube`."""
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    for tid in ids:
        entrada = p.get(tid)
        p[tid] = dict(entrada) if isinstance(entrada, dict) else {}
        p[tid].update(
            estado="reasignada", medio="nube", nota="reasignada a la nube %s" % fecha
        )
    return p
