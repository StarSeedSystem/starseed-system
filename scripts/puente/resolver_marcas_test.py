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
    # Resolver TODOS los bloques internos que no se solapen entre sí
    internos = []
    for inicio, fin in bloques:
        es_interno = True
        for o_inicio, o_fin in bloques:
            if inicio == o_inicio:
                continue
            if inicio < o_inicio < fin:
                es_interno = False
                break
        if es_interno:
            internos.append((inicio, fin))
    internos.sort(key=lambda b: b[1] - b[0])
    # Filtrar los que se solapen con los ya seleccionados
    seleccionados = []
    ocupados = set()
    for inicio, fin in internos:
        overlap = False
        for idx in range(inicio, fin+1):
            if idx in ocupados:
                overlap = True
                break
        if not overlap:
            seleccionados.append((inicio, fin))
            for idx in range(inicio, fin+1):
                ocupados.add(idx)
    if not seleccionados:
        return texto, False
    # Resolver cada bloque seleccionado (de izquierda a derecha)
    # Como no se solapan, podemos hacer todos los reemplazos
    # Pero debemos procesarlos de derecha a izquierda para no afectar índices
    reemplazos = []
    for inicio, fin in seleccionados:
        bloque_lineas = lineas[inicio:fin+1]
        head = []
        alt = []
        estado = "head"
        for l in bloque_lineas[1:]:
            if l.startswith("======="):
                estado = "alt"
            elif l.startswith(">>>>>>>"):
                break
            else:
                if estado == "head":
                    head.append(l)
                else:
                    alt.append(l)
        head_resuelto = resolver_marcas("".join(head))
        alt_resuelto = resolver_marcas("".join(alt))
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
        reemplazos.append((inicio, fin, unido))
    # Aplicar reemplazos de derecha a izquierda para preservar índices
    reemplazos.sort(key=lambda r: r[0], reverse=True)
    nuevas_lineas = list(lineas)
    for inicio, fin, unido in reemplazos:
        nuevas_lineas = nuevas_lineas[:inicio] + unido + nuevas_lineas[fin+1:]
    return "".join(nuevas_lineas), True


if __name__ == "__main__":
    import sys
    texto = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
    resuelto = resolver_marcas(texto)
    print(resuelto, end="")
