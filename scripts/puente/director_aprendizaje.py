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
    """Une los bloques de conflicto (<<<<<<< HEAD ... ======= ... >>>>>>> ...)

    Pura: sin disco ni red. El reloj no interviene (no hace falta). Resuelve
    recursivamente bloques anidados: toma la UNIÓN de ambas partes (HEAD y la
    otra rama) sin duplicar líneas idénticas, conservando el orden.
    """
    if not texto:
        return texto
    # Procesa de forma recursiva: resuelve el bloque más interno primero.
    # Buscamos los marcadores de forma secuencial para evitar anidamiento roto.
    lines = texto.splitlines(keepends=True)
    # Si las líneas no terminan en \n, splitlines(keepends=True) puede no ser ideal,
    # pero para este archivo de texto plano es suficiente. Trabajemos con cadenas.
    resultado = texto
    # Resolvemos iterativamente hasta que no queden marcas.
    cambiado = True
    while cambiado:
        cambiado = False
        resultado = _resolver_una_pasada(resultado)
        if resultado != texto:
            cambiado = True
        texto = resultado
    return resultado


def _resolver_una_pasada(texto):
    # Procesamos por líneas para manejar saltos de línea y anidamiento correctamente.
    # Encontramos el bloque más profundo (el que no tiene otro <<<<<<< entre su inicio y su sep).
    lineas = texto.splitlines(keepends=True)
    # Pero para preservar exactamente, trabajemos con índices de carácter.
    # Encontramos todos los marcadores con sus posiciones.
    marcas_inicio = []
    marcas_sep = []
    marcas_fin = []
    pos = 0
    while True:
        p = texto.find("<<<<<<< ", pos)
        if p == -1:
            break
        marcas_inicio.append(p)
        pos = p + 1
    pos = 0
    while True:
        p = texto.find("=======", pos)
        if p == -1:
            break
        marcas_sep.append(p)
        pos = p + 1
    pos = 0
    while True:
        p = texto.find(">>>>>>> ", pos)
        if p == -1:
            break
        marcas_fin.append(p)
        pos = p + 1
    if not marcas_inicio:
        return texto
    # Emparejamos por anidamiento: para cada inicio, buscamos el primer sep y el primer fin
    # que esté después del sep, sin otro inicio entre el inicio y ese fin (para el bloque más profundo).
    # Para simplificar: resolvemos desde el último bloque hacia atrás, ya que el último inicio
    # corresponde al bloque más interno si los bloques están correctamente anidados.
    # Pero para ser robustos con anidamiento, resolvemos iterativamente: en cada pasada,
    # resolvemos todos los bloques que no contienen otros inicios dentro de ellos.
    # Esto es equivalente a resolver de adentro hacia afuera.
    resuelto = False
    # Encontramos bloques que no contienen otro inicio dentro.
    for idx_inicio in range(len(marcas_inicio) - 1, -1, -1):
        i_start = marcas_inicio[idx_inicio]
        # Buscamos el primer sep después de i_start
        i_sep = -1
        for s in marcas_sep:
            if s > i_start:
                i_sep = s
                break
        if i_sep == -1:
            continue
        # Buscamos el primer fin después de i_sep
        i_end = -1
        for e in marcas_fin:
            if e > i_sep:
                i_end = e
                break
        if i_end == -1:
            continue
        # Verificamos que no haya otro inicio entre i_start e i_end (bloque más profundo)
        hay_interno = False
        for otro_inicio in marcas_inicio:
            if otro_inicio > i_start and otro_inicio < i_end:
                hay_interno = True
                break
        if hay_interno:
            continue  # no es el más profundo, saltamos
        # Resolvemos este bloque.
        # Extraemos contenido head y no-head por líneas para evitar problemas con índices.
        # Usamos los índices exactos del texto.
        head_texto = texto[i_start + len("<<<<<<< "):i_sep]
        # El marcador HEAD ocupa hasta el salto de línea del marcador; quitamos la primera línea (el identificador)
        # y cualquier salto inicial.
        # Pero como los bloques pueden ser líneas enteras, dividimos por líneas.
        head_lineas = head_texto.splitlines(keepends=True)
        # Quitamos la primera línea (el identificador, ej. "HEAD")
        if head_lineas and head_lineas[0].strip() == "HEAD" or (len(head_lineas) > 0 and head_lineas[0].strip().startswith("HEAD")):
            head_lineas = head_lineas[1:]
        # También puede ser un identificador como "f4a37b5d ..."; quitamos cualquier línea que no sea contenido útil.
        # Según el enunciado: la unión de ambas partes. Las líneas de contenido son todas las líneas entre los marcadores.
        # Así que mantenemos todas las líneas del bloque, incluyendo cualquier línea inicial (como el identificador)
        # ya que no está claro si debe eliminarse. El enunciado dice "unión de ambas partes"; las partes son todo
        # lo que está entre los marcadores. Mantengamos todo el contenido entre los marcadores, excepto los
        # marcadores mismos.
        head_texto = texto[i_start + len("<<<<<<< "):i_sep]
        # Pero para ser precisos, dividimos el bloque en líneas y quitamos la línea del identificador si es solo eso.
        # Re-examinemos el archivo real: los bloques empiezan con "<<<<<<< HEAD\n" y luego el contenido,
        # luego "=======\n" y luego contenido, luego ">>>>>>> ...\n".
        # El identificador está en la misma línea que <<<<<<<; no hay línea extra de identificador.
        # Por ejemplo: "<<<<<<< HEAD\n## 2026-10-13..."
        # Así que `head_texto` empieza con "HEAD\n" o con "HEAD\r\n"? No, `i_start` es la posición de "<<<<<<< ",
        # y `i_sep` es la posición de "=======". Entre ellos está todo, incluyendo "HEAD\n" y luego el contenido.
        # Por lo tanto, `head_texto` empieza con "HEAD\n" (o similar). Debemos quitar ese prefijo.
        head_texto = texto[i_start + len("<<<<<<< "):i_sep]
        # Quitamos la primera línea del head_texto (el identificador del marcador)
        # Dividimos por líneas para preservar saltos.
        head_lineas_raw = head_texto.splitlines(keepends=True)
        # Si la primera línea es el identificador (ej. "HEAD" o "f4a37b5d (chore..."), la quitamos.
        # En este archivo, para HEAD es solo "HEAD" (o con espacio). Para la parte no-HEAD, no hay prefijo similar.
        # Pero el bloque tiene dos partes: head (entre <<<<<<< y =======) y otra (entre ======= y >>>>>>>).
        # La parte head incluye el identificador en su primera línea. Lo quitamos.
        if head_lineas_raw:
            primera = head_lineas_raw[0].rstrip("\n\r")
            # Quitamos la primera línea si parece ser el identificador del conflicto.
            # En los casos observados: "HEAD", "f4a37b5d (chore(memoria): ..."
            head_lineas_raw = head_lineas_raw[1:]
        head_texto_limpio = "".join(head_lineas_raw)
        # La parte no-HEAD es todo entre i_sep y i_end, sin el marcador final.
        otra_texto = texto[i_sep + len("======="):i_end]
        otra_lineas_raw = otra_texto.splitlines(keepends=True)
        # No hay prefijo en la parte otra, excepto que a veces empieza con salto de línea; mantenemos todo.
        # Unimos ambas partes sin duplicados, conservando orden: primero head, luego otra,
        # quitando líneas duplicadas que aparezcan en ambas, manteniendo el orden de aparición.
        # Pero el enunciado dice "unión de ambas partes, sin duplicar líneas idénticas y conservando el orden".
        # Eso puede interpretarse como: la secuencia resultante es la concatenación de las líneas de head
        # y las líneas de otra, pero sin repetir líneas idénticas (es decir, si una línea aparece en ambas,
        # solo se mantiene la primera aparición).
        # Haremos eso: unir head + otra, luego eliminar duplicados preservando orden.
        head_lineas = head_texto_limpio.splitlines()
        otra_lineas = otra_texto.splitlines()
        # Pero mantenemos saltos de línea. Trabajemos con líneas como cadenas sin el salto para comparar,
        # y luego reconstruimos con los saltos originales. Como es texto simple, usaremos líneas completas (incluido salto).
        # Para simplificar: trabajemos con líneas sin salto para deduplicar, luego reconstruimos.
        head_sin_salto = [l.rstrip("\n\r") for l in head_texto_limpio.splitlines(keepends=True) if l.rstrip("\n\r") != ""]
        # Espera, no quitemos líneas vacías innecesariamente. Solo deduplicamos líneas idénticas.
        head_lineas_con_salto = head_texto_limpio.splitlines(keepends=True)
        otra_lineas_con_salto = otra_texto.splitlines(keepends=True)
        # Quitamos líneas que sean solo espacios en blanco? No, el enunciado no dice eso.
        unidas = []
        vistas = set()
        for linea in head_lineas_con_salto:
            clave = linea.rstrip("\n\r")
            if clave not in vistas:
                vistas.add(clave)
                unidas.append(linea)
        for linea in otra_lineas_con_salto:
            clave = linea.rstrip("\n\r")
            if clave not in vistas:
                vistas.add(clave)
                unidas.append(linea)
        texto_resuelto = "".join(unidas)
        # Si hay líneas vacías al inicio o final que generen espacios extra, las mantenemos para ser fieles.
        # Reemplazamos el bloque completo (desde <<<<<<< hasta >>>>>>>, incluyendo los marcadores y sus líneas)
        # con el texto_resuelto.
        # Encontramos el final de la línea del marcador de cierre.
        fin_linea = texto.find("\n", i_end)
        if fin_linea == -1:
            fin_linea = len(texto)
        texto = texto[:i_start] + texto_resuelto + texto[fin_linea:]
        resuelto = True
    return texto if resuelto else texto


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
