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
import subprocess
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


def resolver_marcas(texto):
    """Une las dos partes de cada bloque de conflicto en una sola lista de líneas.

    Pura: sin disco, sin red, sin reloj. Para cada conflicto (`<<<<<<<` …
    `=======` … `>>>>>>>`) conserva TODAS las líneas de las dos partes, una sola
    vez si están repetidas, y en orden de aparición (la parte de HEAD primero).
    Borra solo las propias marcas, incluida la basura que quedan las fusiones
    apiladas de los salvavidas (separadores o cierres duplicados y huérfanos).
    Con conflictos anidados resuelve de adentro hacia afuera: cada pasada une
    los bloques internos y limpia lo que queda suelto, y se repite hasta que no
    queda ninguna marca.
    """
    actual = texto
    for _ in range(50):
        unido = _una_pasada(actual)
        if unido == actual:
            return actual
        actual = unido
    return actual


def _pares(lineas):
    """Empareja cada `<<<<<<<` con su `>>>>>>>` por pila (anidación incluida)."""
    pares = [None] * len(lineas)
    pila = []
    for i, linea in enumerate(lineas):
        if linea.startswith("<<<<<<<"):
            pila.append(i)
        elif linea.startswith(">>>>>>>") and pila:
            pares[pila.pop()] = i
    return pares


def _una_pasada(texto):
    """Une los bloques internos (los que no contienen otro `<<<<<<<`) y quita
    las marcas sueltas: separadores sin bloque abierto y cierres sin pareja."""
    lineas = texto.splitlines(True)
    pares = _pares(lineas)
    internos = {
        inicio
        for inicio, fin in enumerate(pares)
        if fin is not None
        and not any(
            lineas[k].startswith("<<<<<<<") for k in range(inicio + 1, fin)
        )
    }
    salida, pila = [], []
    i = 0
    while i < len(lineas):
        linea = lineas[i]
        if linea.startswith("<<<<<<<"):
            pila.append(i)
            if i in internos:
                salida.extend(_union(lineas, i, pares[i]))
                pila.pop()
                i = pares[i] + 1
                continue
            salida.append(linea)
        elif linea.startswith(">>>>>>>") and pila:
            pila.pop()
            salida.append(linea)
        elif (linea.startswith("=======") or linea.startswith(">>>>>>>")) and not pila:
            pass  # marca suelta: basura de fusiones viejas, se quita
        else:
            salida.append(linea)
        i += 1
    return "".join(salida)


def _union(lineas, inicio, fin):
    """Unión de las dos partes de un bloque (HEAD primero, sin repeticiones)."""
    sep = next(
        (k for k in range(inicio + 1, fin) if lineas[k].startswith("=======")),
        fin,
    )
    unidas, vistas = [], set()
    for lado in range(inicio + 1, sep):
        unidas = _pasa(lineas[lado], vistas, unidas)
    for lado in range(sep + 1, fin):
        unidas = _pasa(lineas[lado], vistas, unidas)
    return unidas


def _pasa(linea, vistas, unidas):
    if (
        linea in vistas
        or linea.startswith("<<<<<<<")
        or linea.startswith("=======")
        or linea.startswith(">>>>>>>")
    ):
        return unidas
    vistas.add(linea)
    unidas.append(linea)
    return unidas


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


def commitear_memoria(nombre):
    """Deja el árbol LIMPIO. No es cosmética: es lo que deja arrancar al enjambre.

    El orquestador se niega a arrancar si `main` tiene cambios sin commitear —un
    guardia correcto, porque no quiero agentes trabajando sobre un árbol sucio—. Y el
    vigilante, al ver el árbol sucio, tampoco relanza:

        working tree de main con cambios sin commit: 1 archivos — no arranco

    El 2026-09-16 ese «1 archivo» era ESTE: `memory/aprendizaje-olas.md`, recién escrito
    al cerrar la ola 326 y sin commitear. Resultado: cero orquestadores, cuatro tareas
    pendientes y nadie trabajando durante media hora. El director de aprendizaje, que
    existe para que el sistema no tropiece dos veces con la misma piedra, había puesto
    una piedra nueva.

    Se commitea SOLO este archivo, con ruta explícita, para no arrastrar nada de nadie.
    Y nunca se lanza: si algo falla aquí, el cierre de la ola sigue su camino y como
    mucho queda un archivo suelto — molesto, pero no peor que antes.
    """
    for marca in ("rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"):
        if os.path.exists(os.path.join(ROOT, ".git", marca)):
            return  # algo a medias: ni tocar el índice
    rel = os.path.relpath(MEMORIA, ROOT)
    # Dos intentos, y compruebo el resultado. El 16/09 el `commit` chocó con el de
    # la ola (índice ocupado), el archivo se quedó AÑADIDO pero sin commitear, y
    # el guardia del orquestador —que se niega a arrancar con el árbol sucio—
    # tuvo el enjambre parado diez horas por esta contabilidad.
    for intento in range(2):
        try:
            subprocess.run(["git", "add", "--", rel], cwd=ROOT, timeout=60, capture_output=True)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "core.hooksPath=/dev/null",
                    "commit",
                    "-q",
                    "-m",
                    "chore(memoria): aprendizaje de la ola %s" % nombre,
                    "--",
                    rel,
                ],
                cwd=ROOT,
                timeout=120,
                capture_output=True,
            )
            queda = subprocess.run(
                ["git", "status", "--porcelain", "--", rel],
                cwd=ROOT,
                timeout=30,
                capture_output=True,
            )
            if not queda.stdout.strip():
                return
        except Exception:
            pass
        if intento == 0:
            time.sleep(3)


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

    # Antes de escribir: si hay marcas en la memoria existente, las resolvemos.
    contenido_previo = ""
    if os.path.exists(MEMORIA):
        with open(MEMORIA, encoding="utf-8") as f:
            contenido_previo = f.read()
        contenido_previo = resolver_marcas(contenido_previo)

    os.makedirs(os.path.dirname(MEMORIA), exist_ok=True)
    nuevo = not os.path.exists(MEMORIA)
    with open(MEMORIA, "w", encoding="utf-8") as f:
        if nuevo:
            f.write(CABECERA)
            contenido_final = texto
        else:
            contenido_final = contenido_previo + ("\n" + texto if texto else "")
        contenido_final = resolver_marcas(contenido_final)
        f.write(contenido_final)

    # Antes de commitear: nunca se commitea un archivo con marcas.
    with open(MEMORIA, encoding="utf-8") as f:
        contenido_commit = f.read()
    contenido_commit = resolver_marcas(contenido_commit)
    with open(MEMORIA, "w", encoding="utf-8") as f:
        f.write(contenido_commit)

    commitear_memoria(nombre)

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
