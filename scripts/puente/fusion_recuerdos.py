# -*- coding: utf-8 -*-
"""Fusión de recuerdos de Memvid y LEANN (LNN1028A2, stdlib puro).

Misma lógica que `src/lib/memorias/fusion-recuerdos.ts` (LNN1028A): fusión por
rango recíproco (RRF) con dedupe por `uri` y un presupuesto de caracteres.
Cada recuerdo es un diccionario con las claves del contrato: `uri`, `texto`,
`titulo`, `ts`, `fuente`, `puntuacion` y `alcance`. Sin red, sin claves y sin
rutas del disco: esto solo ordena lo que otro ya trajo.
"""

import re

ALCANCES = ("personal", "perfil", "grupo", "publica")
FUENTES = ("memvid", "leann")
PESO_VECTOR_POR_DEFECTO = 0.7
PESO_VECTOR_CON_PALABRAS = 0.4

_COMILLAS = re.compile(r"[\"'“”‘’«»]")
_PALABRA = re.compile(r"[^\s]+")
_BORDES = ".,;:!?¡¿()[]{}<>\"'“”‘’«»…"


def _limpia(palabra):
    return palabra.strip(_BORDES)


def _es_nombre_propio(palabra, primera):
    if not palabra:
        return False
    if palabra.isupper() and len(palabra) >= 2:
        return True
    if primera:
        return False
    return palabra[0].isupper() and len(palabra) > 1 and palabra[1].islower()


def peso_vector_para(consulta):
    """Peso del vector frente a las palabras: 0,7 normal; 0,4 con comillas o nombres propios."""
    if not consulta:
        return PESO_VECTOR_POR_DEFECTO
    if _COMILLAS.search(consulta):
        return PESO_VECTOR_CON_PALABRAS
    for indice, bruto in enumerate(_PALABRA.findall(consulta)):
        if _es_nombre_propio(_limpia(bruto), primera=(indice == 0)):
            return PESO_VECTOR_CON_PALABRAS
    return PESO_VECTOR_POR_DEFECTO


def _clave(recuerdo):
    uri = (recuerdo.get("uri") or "").strip()
    if uri:
        return uri
    return (recuerdo.get("texto") or "").strip()


def fundir_recuerdos(listas, k=60, maximo=6, max_caracteres=1500):
    """Funde listas de recuerdos por rango recíproco y devuelve los mejores.

    Cada lista ya viene ordenada por su motor: el rango cuenta desde 1 y un
    recuerdo que aparece en varias listas suma 1/(k + rango) por cada una.
    Sin `uri`, la clave es el texto. El dedupe se queda con el texto más largo
    y el corte respeta `maximo` y `max_caracteres` (recorta el último si hace falta).
    """
    k = max(0, int(k))
    maximo = max(0, int(maximo))
    max_caracteres = max(0, int(max_caracteres))

    puntuaciones = {}
    elegidos = {}
    llegada = {}
    siguiente = 0

    for lista in listas or []:
        for rango, recuerdo in enumerate(lista or [], start=1):
            if not isinstance(recuerdo, dict):
                continue
            clave = _clave(recuerdo)
            if not clave:
                continue
            if clave not in puntuaciones:
                puntuaciones[clave] = 0.0
                llegada[clave] = siguiente
                siguiente += 1
            puntuaciones[clave] += 1.0 / (k + rango)
            previo = elegidos.get(clave)
            if previo is None or len(recuerdo.get("texto") or "") > len(previo.get("texto") or ""):
                elegidos[clave] = recuerdo

    ordenadas = sorted(
        elegidos.items(),
        key=lambda par: (-puntuaciones[par[0]], llegada[par[0]]),
    )

    salida = []
    total = 0
    for _clave_recuerdo, recuerdo in ordenadas:
        if len(salida) >= maximo or total >= max_caracteres:
            break
        texto = recuerdo.get("texto") or ""
        resto = max_caracteres - total
        if len(texto) > resto:
            recuerdo = dict(recuerdo)
            recuerdo["texto"] = texto[:resto]
            texto = recuerdo["texto"]
        salida.append(recuerdo)
        total += len(texto)
    return salida
