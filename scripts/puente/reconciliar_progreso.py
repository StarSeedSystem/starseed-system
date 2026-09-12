#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pone `progreso.json` de acuerdo con la realidad cuando el orquestador no está.

POR QUÉ. El 2026-09-12 el Mando enseñaba «50 pendientes · 5 en curso» durante horas con
CERO orquestadores vivos. Tres mentiras distintas, todas en `progreso.json`:

  1. `en_curso` rancio: el orquestador murió (o lo mataron) a media tarea y nadie cerró
     el estado. Diez tareas «escribiendo» que no escribía nadie.
  2. `sin_cambios` de tareas que YA están en main: el agente no tuvo nada que cambiar
     porque el trabajo ya estaba hecho — pero el estado no lo dice, y sus dependientes
     quedan `bloqueada` para siempre («dependencia no integrada: LT2 (sin_cambios)»).
  3. `bloqueada` cuya dependencia sí está integrada — en git, aunque el estado no lo sepa.

El vigilante ya filtraba bien (por eso decía «no queda trabajo real») pero no CORREGÍA
nada, así que el Mando seguía contando mentiras. Esto es una función pura: recibe el
progreso, los asuntos de `git log main` y si hay orquestador vivo; devuelve el progreso
nuevo y una lista de cambios en prosa para el canal. La escribe el director cada pasada.
"""
import json, os, re, subprocess, sys, time

DEP = re.compile(r"dependencia no integrada:\s*([A-Za-z0-9_-]+)")
INTEGRADA = {"commit", "hecho"}
# Lo que no se toca nunca: cierres irreversibles del orquestador y la puerta de aprobación,
# que es de una persona o del director, no de un reconciliador.
CERRADAS = {"commit", "bloqueante", "sustituida", "rechazada", "hecho",
            "esperando_aprobacion", "pendiente_aprobacion"}


def en_main(tid, asuntos):
    """El id como token entero en algún asunto de commit de main."""
    p = re.compile(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(tid))
    return any(p.search(a) for a in asuntos)


def reconciliar(progreso, asuntos, orquestador_vivo, ahora=None):
    """Devuelve (progreso_nuevo, cambios). No toca el original."""
    ahora = ahora or time.strftime("%Y-%m-%d %H:%M")
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    cambios = []

    def cerrar(tid, nota):
        p[tid].update(estado="commit", sha=p[tid].get("sha") or "reconciliado-en-main",
                      nota=nota, reconciliado=ahora)

    for tid, v in p.items():
        if not isinstance(v, dict):
            continue
        e = v.get("estado")
        if e == "en_curso" and not orquestador_vivo:
            if en_main(tid, asuntos):
                cerrar(tid, "en_curso rancio: el id ya figura en main"); cambios.append("%s en_curso→commit" % tid)
            else:
                v.update(estado="interrumpida", nota="orquestador no vivo al reconciliar", reconciliado=ahora)
                cambios.append("%s en_curso→interrumpida" % tid)
        elif e not in CERRADAS and e != "en_curso" and en_main(tid, asuntos):
            cerrar(tid, "%s pero el id ya figura en main" % e); cambios.append("%s %s→commit" % (tid, e))

    for tid, v in p.items():                       # segunda pasada: ya con las deps cerradas
        if not isinstance(v, dict) or v.get("estado") != "bloqueada":
            continue
        m = DEP.search(v.get("nota") or "")
        if not m:
            continue
        dep = m.group(1)
        de = p.get(dep, {}).get("estado") if isinstance(p.get(dep), dict) else None
        if de in INTEGRADA or en_main(dep, asuntos):
            v.update(estado="pendiente", nota="desbloqueada: %s ya está integrada" % dep, reconciliado=ahora)
            cambios.append("%s bloqueada→pendiente (%s)" % (tid, dep))
    return p, cambios


if __name__ == "__main__":                         # uso: reconciliar_progreso.py [--aplicar]
    raiz = os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main")
    ruta = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
    asuntos = subprocess.run(["git", "log", "main", "--format=%s"], cwd=raiz,
                             capture_output=True, text=True).stdout.splitlines()
    vivo = any(re.match(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py", l)
               for l in subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True).stdout.splitlines())
    nuevo, cambios = reconciliar(json.load(open(ruta, encoding="utf-8")), asuntos, vivo)
    print("\n".join(cambios) or "nada que reconciliar")
    if "--aplicar" in sys.argv and cambios:
        json.dump(nuevo, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("aplicados %d cambios" % len(cambios))
