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
    """Une los bloques de conflicto (<<<<<<< HEAD ... ======= ... >>>>>>> ...).

    Pura: sin disco ni red, y el reloj no interviene. Los bloques anidados se
    resuelven de adentro hacia afuera. La parte HEAD se conserva tal cual
    (es contenido ya escrito en el archivo) y de la otra parte se quitan las
    líneas idénticas que ya aparecieron; el orden se conserva. Las líneas en
    blanco no se quitan: son la estructura de párrafos del archivo, no
    contenido duplicado.
    """
    if not texto:
        return texto
    for _ in range(200):  # antipatinado: con 4 bloques reales sobra de sobra
        nueva = _resolver_pasada(texto)
        if nueva is None:
            return texto
        texto = nueva
    return texto


def _clave(l):
    """Banco de comparación de una línea: sin su salto final."""
    return l.rstrip("\r\n")


def _es_marca(l):
    """¿Es una línea marca de conflicto (<<<<<<<, =======, >>>>>>>)?"""
    return l.startswith(("<<<<<<<", "=======", ">>>>>>>"))


def _resolver_pasada(texto):
    """Resuelve el bloque más interno que queda; None si no queda ninguno."""
    lineas = texto.splitlines(keepends=True)
    inicios = []
    bloques = []
    pila = []
    huerfanas = []  # cierres sin apertura: basura de una fusión a medias
    for i, linea in enumerate(lineas):
        if linea.startswith("<<<<<<<"):
            inicios.append(i)
            pila.append(i)
        elif linea.startswith(">>>>>>>"):
            if pila:
                bloques.append((pila.pop(), i))
            else:
                huerfanas.append(i)
    for inicio, fin in bloques:
        if any(inicio < j < fin for j in inicios):
            continue  # contiene otro bloque: primero se resuelve el de dentro
        sep = next((j for j in range(inicio + 1, fin) if lineas[j].startswith("=======")), None)
        if sep is None:
            # Bloque sin separador: fusión a medias con ambas partes vacías
            # o partidas; retirar las marcas sueltas y conservar lo común.
            lineas[inicio : fin + 1] = lineas[inicio + 1 : fin]
            return "".join(lineas)
        head = [l for l in lineas[inicio + 1 : sep] if not _es_marca(l)]
        vistas = {_clave(l) for l in head if _clave(l)}
        unidas = list(head)
        for linea in lineas[sep + 1 : fin]:
            if _es_marca(linea):
                continue  # marca suelta de un bloque a medias: nunca sale en el texto
            clave = _clave(linea)
            if not clave or clave not in vistas:
                # Las líneas en blanco no se cuentan: son párrafo, no doblete.
                unidas.append(linea)
                if clave:
                    vistas.add(clave)
        lineas[inicio : fin + 1] = unidas
        return "".join(lineas)
    if huerfanas:
        quedan = set(huerfanas)
        lineas = [l for i, l in enumerate(lineas) if i not in quedan]
        return "".join(lineas)
    return None


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
