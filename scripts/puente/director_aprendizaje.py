#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de aprendizaje: al cerrar una ola, deja lo aprendido donde se relee.

    python3 scripts/puente/director_aprendizaje.py <cola.json> ["nota humana"]

El informe de cierre de una ola se lee una vez y no se vuelve a abrir. Lo que sí
se relee son las memorias del proyecto: `memory/` lo carga cada agente al
empezar, y `AGENTS.md` manda sobre todos. Por eso este director escribe ahí, y
no en otro archivo suelto más.

Qué escribe y qué NO:
  · SÍ — hechos con su número: qué entró, qué no, por qué causa, qué modelo
    integró y cuál no. Eso lo calcula `aprendizaje_ola`, que es puro y probado.
  · NO — conclusiones inventadas. «glm falló 2 de 2» es un hecho que sirve;
    «glm es malo para interfaces» es una opinión sacada de dos casos, y una
    memoria llena de opiniones falsas es peor que una memoria vacía.

Nunca reescribe: AÑADE al final. La historia de las olas anteriores no se toca.
"""

import json
import os
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import aprendizaje_ola as A

ROOT = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(ROOT, "starseed_memory_root", "olas")
MEMORIA = os.path.join(ROOT, "memory", "aprendizaje-olas.md")

CABECERA = """# Aprendizaje de las olas

> Lo que cada ola dejó aprendido, en hechos con su número. Lo escribe el director
> de aprendizaje al cerrar cada ola (`scripts/puente/director_aprendizaje.py`);
> nadie lo edita a mano salvo para añadir una nota humana.
>
> Cómo se lee: si una causa aparece en varias olas seguidas, eso ya no es mala
> suerte, es algo del sistema que hay que arreglar. Si un modelo no integra nada
> en varias olas, deja de dárselas.

"""


def leer_json(ruta, por_defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return por_defecto


def pedido_de(tareas):
    """El encargo de Alex viene copiado literal dentro del prompt de cada tarea.

    Se saca de ahí en vez de pedirlo aparte: así la memoria guarda lo que de
    verdad se le mandó al enjambre, no lo que alguien recuerda que se mandó.
    """
    for t in tareas or []:
        prompt = t.get("prompt") or ""
        i = prompt.find("«")
        j = prompt.find("»", i + 1)
        if i >= 0 and j > i:
            return prompt[i + 1 : j].strip()
    return ""


def main():
    if len(sys.argv) < 2:
        print("uso: director_aprendizaje.py <cola.json> [nota]", file=sys.stderr)
        return 2
    cola = sys.argv[1]
    nota = " ".join(sys.argv[2:]).strip()
    ruta_cola = cola if os.path.isabs(cola) else os.path.join(OLAS, os.path.basename(cola))
    tareas = leer_json(ruta_cola, [])
    if isinstance(tareas, dict):
        tareas = tareas.get("tareas", [])
    if not tareas:
        print("sin tareas legibles en %s" % ruta_cola, file=sys.stderr)
        return 1
    progreso = leer_json(os.path.join(OLAS, "progreso.json"), {})

    nombre = os.path.basename(ruta_cola).replace("cola-", "").replace(".json", "")
    resumen = A.resumir_ola(nombre, tareas, progreso)
    texto = A.entrada(
        resumen,
        time.strftime("%Y-%m-%d %H:%M"),
        pedido=pedido_de(tareas),
        notas_humanas=[nota] if nota else (),
    )

    os.makedirs(os.path.dirname(MEMORIA), exist_ok=True)
    nuevo = not os.path.exists(MEMORIA)
    with open(MEMORIA, "a", encoding="utf-8") as f:
        if nuevo:
            f.write(CABECERA)
        f.write("\n" + texto)

    print("aprendizaje de %s → memory/aprendizaje-olas.md" % nombre)
    for o in A.observaciones(resumen):
        print("  · %s" % o)

    # Que quede dicho también en el bus, donde lo ven los demás directores.
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location("puente", os.path.join(DIRECTORIO, "puente.py"))
        p = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(p)
        p.decir(texto[:1500], "aprendizaje", "hecho")
    except Exception:
        pass  # el aviso es un extra: nunca puede tumbar el cierre de una ola
    return 0


if __name__ == "__main__":
    sys.exit(main())
