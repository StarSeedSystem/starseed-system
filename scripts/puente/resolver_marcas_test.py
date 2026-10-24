#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Resolver marcas de conflicto (unión sin duplicados, orden conservado)."""


def resolver_marcas(texto):
    """Resuelve todas las marcas de conflicto (`<<<<<<<`, `=======`, `>>>>>>>")
    por unión sin duplicados: conserva el orden (HEAD primero, alternativa
    después) y no repite líneas idénticas. Funciona con marcas anidadas.
    Es una función pura: no toca disco ni red."""
    # Procesamos iterativamente: en cada pasada resolvemos los bloques más
    # internos (los que no contienen otro `<<<<<<<` dentro de su rango).
    # Esto evita problemas con anidación.
    actual = texto
    cambio = True
    max_iter = 100
    for _ in range(max_iter):
        cambio = False
        actual, hecho = _una_pasada(actual)
        cambio = cambio or hecho
        if not hecho:
            break
    # Si aún quedan marcas sin resolver (por ejemplo, bloque sin cierre),
    # las dejamos tal cual; el archivo final no debe tener marcas.
    return actual


def _una_pasada(texto):
    lineas = texto.splitlines(keepends=True)
    # Encontrar todos los índices de inicio y fin de bloques internos
    # Un bloque interno es aquel cuyo `<<<<<<<` no tiene otro `<<<<<<<`
    # antes de su `>>>>>>>` correspondiente (excepto los que empiezan dentro).
    # Para simplificar: buscamos pares `<<<<<<<` -> `>>>>>>>` con profundidad.
    bloques = []  # (inicio, fin_incluido, profundidad) - bloque más interno primero
    pila = []
    for i, l in enumerate(lineas):
        if l.startswith("<<<<<<<"):
            pila.append(i)
        elif l.startswith(">>>>>>>"):
            if pila:
                inicio = pila.pop()
                bloques.append((inicio, i))
    # Si hay bloques, resolvemos los que no contienen otros bloques internos
    # Es decir, bloques cuya distancia es la mínima.
    if not bloques:
        return texto, False
    # Ordenar por distancia (más cortos = más internos) y resolver uno
    bloques.sort(key=lambda b: b[1] - b[0])
    inicio, fin = bloques[0]
    # Ahora resolvemos este bloque específico
    bloque_lineas = lineas[inicio:fin+1]
    # Separar HEAD y alternativa
    head = []
    alt = []
    estado = "head"
    for l in bloque_lineas[1:]:  # saltar la línea `<<<<<<< ...`
        if l.startswith("======="):
            estado = "alt"
        elif l.startswith(">>>>>>>"):
            # Fin del bloque; no incluir esta línea en ninguna parte
            break
        else:
            if estado == "head":
                head.append(l)
            else:
                alt.append(l)
    # Resolver recursivamente cada parte (por si hay sub-bloques dentro)
    head_resuelto = resolver_marcas("".join(head))
    alt_resuelto = resolver_marcas("".join(alt))
    # Unir sin duplicados: HEAD primero, luego alt sin repetir líneas que ya existan en HEAD
    head_lineas_unicas = head_resuelto.splitlines(keepends=True)
    alt_lineas = alt_resuelto.splitlines(keepends=True)
    visto = set()
    unido = []
    for l in head_lineas_unicas:
        visto.add(l)
        unido.append(l)
    for l in alt_lineas:
        if l not in visto:
            visto.add(l)
            unido.append(l)
    # Reemplazar el bloque en las líneas originales
    nuevas_lineas = lineas[:inicio] + unido + lineas[fin+1:]
    return "".join(nuevas_lineas), True


if __name__ == "__main__":
    import sys
    texto = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
    resuelto = resolver_marcas(texto)
    print(resuelto, end="")
