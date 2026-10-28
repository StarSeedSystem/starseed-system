# -*- coding: utf-8 -*-
"""Fusión de recuerdos Memvid + LEANN por rango recíproco (LNN1028A2).

Módulo PURO de la stdlib, espejo de `src/lib/memorias/fusion-recuerdos.ts` (LNN1028A):
las mismas entradas dan la misma lista, para que Jev (Python) y los agentes decidan con
el mismo «RECUERDOS». Sin red, sin disco, sin procesos y sin claves.

Contrato (`architecture/leann-recuerdo-semantico.md` §4): cada fuente ordena lo suyo y
aquí se funde con RRF, k = 60. Un recuerdo que aparece en las dos listas suma los dos
aportes y sube; el dedupe es por `uri` (sin `uri`, por el texto) y se queda con el texto
más largo. El corte final respeta `maximo` y `max_caracteres`.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

K_RRF = 60
MAXIMO_RECUERDOS = 6
MAX_CARACTERES = 1500
PESO_VECTOR_DEFECTO = 0.7
PESO_VECTOR_PALABRAS = 0.4


_COMILLAS = ('"', "'", "«", "»", "“", "”", "‘", "’", "`")
_BORDE = "¿?¡!.,;:()[]{}\"'«»“”‘’`… \t\n"

# Palabras con las que empieza una pregunta normal en español: la mayúscula inicial de
# «¿Qué…» no es un nombre propio. El resto de palabras en mayúscula sí lo son.
_PALABRAS_DE_INICIO = {
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "qué", "que", "quién", "quien", "quiénes", "quienes",
    "cómo", "como", "cuándo", "cuando", "dónde", "donde", "cuál", "cual",
    "cuánto", "cuanto", "por", "para", "de", "del", "en", "con", "sin",
    "y", "o", "si", "hay", "dime", "dame", "busca", "recuerda", "recuerdas",
    "muéstrame", "muestrame", "cuéntame", "cuentame", "hola", "buenas",
}


def _clave(recuerdo: Mapping[str, Any]) -> str:
    """Identidad del recuerdo: su `uri` o, si no la hay, la huella de su texto."""
    uri = recuerdo.get("uri")
    if uri:
        return str(uri)
    return f"texto:{recuerdo.get('texto', '')}"


def fundir_recuerdos(
    listas: Sequence[Sequence[Mapping[str, Any]]],
    k: int = K_RRF,
    maximo: int = MAXIMO_RECUERDOS,
    max_caracteres: int = MAX_CARACTERES,
) -> list[dict[str, Any]]:
    """Funde varias listas ordenadas en una sola, con RRF y dedupe por `uri`.

    Cada aparición aporta `1 / (k + rango)` con el rango empezando en 1. Si dos apariciones
    comparten clave se suman los aportes y se conserva el texto más largo. El resultado va
    de mayor a menor puntuación y se corta al llegar a `maximo` o a `max_caracteres`.
    """
    if maximo <= 0 or max_caracteres <= 0:
        return []
    elegidos: dict[str, dict[str, Any]] = {}
    puntos: dict[str, float] = {}
    for lista in listas:
        for indice, recuerdo in enumerate(lista):
            clave = _clave(recuerdo)
            puntos[clave] = puntos.get(clave, 0.0) + 1.0 / (k + indice + 1)
            previo = elegidos.get(clave)
            if previo is None:
                elegidos[clave] = dict(recuerdo)
            elif len(str(recuerdo.get("texto", ""))) > len(str(previo.get("texto", ""))):
                elegidos[clave] = dict(recuerdo)
    ordenados = sorted(elegidos.items(), key=lambda par: -puntos[par[0]])
    salida: list[dict[str, Any]] = []
    caracteres = 0
    for clave, recuerdo in ordenados:
        if len(salida) >= maximo:
            break
        largo = len(str(recuerdo.get("texto", "")))
        if caracteres + largo > max_caracteres:
            break
        fusionado = dict(recuerdo)
        fusionado["puntuacion"] = puntos[clave]
        salida.append(fusionado)
        caracteres += largo
    return salida


def _nombre_propio(palabra: str, primera: bool) -> bool:
    """¿La palabra es un nombre propio o una sigla? Las mayúsculas de inicio de frase no."""
    limpia = palabra.strip(_BORDE)
    if not limpia:
        return False
    if len(limpia) >= 2 and limpia.isupper():
        return True
    if not limpia[0].isupper():
        return False
    if not primera:
        return True
    return limpia.lower() not in _PALABRAS_DE_INICIO


def peso_vector_para(consulta: str) -> float:
    """Peso del vector frente a las palabras: 0,7 normal; 0,4 con comillas o nombres propios.

    Con nombres propios o texto entre comillas manda la búsqueda por palabras (BM25), así
    que el peso vectorial baja a 0,4. Sin esas señales se queda en 0,7, como el contrato.
    """
    texto = consulta or ""
    if any(comilla in texto for comilla in _COMILLAS):
        return PESO_VECTOR_PALABRAS
    for indice, palabra in enumerate(texto.split()):
        if _nombre_propio(palabra, indice == 0):
            return PESO_VECTOR_PALABRAS
    return PESO_VECTOR_DEFECTO
