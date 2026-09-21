#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica pura del reparto a la nube: elegir el atraso y marcarlo.

El atraso candidato es una tarea que (1) no está en main, (2) no está cerrada
ni viva en el progreso y (3) no pertenece a la ola que corre ahora mismo; la
ola actual se queda en la Mac. Está mal invertir en reintentar en local lo que
el estado ya declaró agotado (`fallo*`) o innecesario (`sin_cambios`) y lo que
nunca se tocó: eso es justo lo que la nube puede hacer gratis con LLM7.
"""

import re

from vigilante_logica import id_en_asuntos

MODELO_NUBE = "llm7/minimax-m2.7"
ESTADOS_REPARTIBLES = {None, "sin_cambios", "fallo", "fallo_tests", "fallo_tsc"}

# (2026-09-21) En la nube NO HAY NADIE que apruebe: solo sobrevive lo que pasa las
# cuatro puertas solo. Lo que falla ahi no falla por poco: falla TARDE, despues de
# 40-60 min de agente. Anoche cayeron NE1c (3 archivos), R6b (6) y R7b (9) y las tres
# por lo mismo: el agente no llego a tocarlos todos. Cuantos mas archivos pide una
# tarea, mas probable es que se quede a medias, y a medias en la nube es a la basura.
# Las grandes se quedan en la Mac, donde hay revisor. Y entre las que caben, primero
# las de un solo archivo.
MAX_ARCHIVOS_NUBE = 3


def _n_archivos(tarea):
    return len(tarea.get("archivos") or [])


def _tiene_dependencias(tarea):
    """¿Esta tarea espera a otra?

    (2026-09-21) La nube hace checkout de `origin/main` y ahi se queda: no ve lo
    que la Mac esta escribiendo AHORA MISMO ni lo que tiene sin publicar. Medido
    en el run 35568545557: de seis tareas, CUATRO se bloquearon por dependencias
    que en la nube no existian —AG2 esperaba a AG1, W2 a W1, RN6 a RN5, L9 a L8—
    y RN5 se estaba integrando en la Mac en ese mismo momento. Treinta y seis
    minutos de runner para un commit. Una tarea con dependencias solo se puede
    juzgar donde se ve el trabajo vivo, y eso es la Mac. A la nube van las que no
    esperan a nadie.
    """
    deps = tarea.get("depende") or tarea.get("depende_de") or []
    if isinstance(deps, str):
        deps = [deps]
    return bool(deps)


def numero_ola(texto):
    """Número de ola: `Ola 317` o guarismo suelto; None si no hay."""
    m = re.search(r"Ola (\d+)", texto, re.IGNORECASE) or re.search(r"(\d+)", texto)
    return int(m.group(1)) if m else None


def elegir(colas, progreso, asuntos_main, ola_actual, tope=20, max_archivos=MAX_ARCHIVOS_NUBE):
    """Hasta `tope` candidatas, deduplicadas, con modelo nube y ordenadas por tamano.

    Se descartan las de mas de `max_archivos` archivos declarados —esas necesitan un
    revisor y la nube no lo tiene— y las que DEPENDEN de otra tarea, porque la nube
    solo ve `origin/main` y no puede saber si la dependencia esta hecha en la Mac.
    Entre las que quedan van primero las de un solo archivo, que son las que de
    verdad llegan a commit. Si no queda ninguna, la nube no recibe nada ese ciclo
    — que es lo correcto, no un fallo.
    """
    salida, vistas = [], set()
    n_actual = numero_ola(str(ola_actual)) if ola_actual else None
    for nombre, tareas in colas:
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            ola = str(tarea.get("ola") or "")
            n_ola = numero_ola(ola)
            if n_actual is not None and n_ola is not None and n_ola == n_actual:
                continue
            entrada = progreso.get(tid)
            estado = entrada.get("estado") if isinstance(entrada, dict) else None
            if estado not in ESTADOS_REPARTIBLES:
                continue
            if id_en_asuntos(tid, asuntos_main):
                continue
            if _n_archivos(tarea) > max_archivos:
                continue
            if _tiene_dependencias(tarea):
                continue
            vistas.add(tid)
            candidata = dict(tarea)
            candidata["modelo"] = MODELO_NUBE
            salida.append(candidata)
    # Estable: a igual numero de archivos manda el orden de las colas (la prioridad
    # que ya calcularon los directores). Solo se reordena por tamano.
    salida.sort(key=_n_archivos)
    return salida[:tope]


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
