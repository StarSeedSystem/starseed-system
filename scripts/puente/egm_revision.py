# -*- coding: utf-8 -*-
"""egm_revision · peces revisores de las direcciones (EGM, §2 de la ola 1104).

Un elefante (la dirección) redacta; los peces son revisores sin contexto: solo
ven el artefacto y devuelven objeciones con gravedad (`bloquea`, `importa`,
`menor`). Una ola con un `bloquea` sin resolver no entra a la cola.

Módulo puro: ninguna función toca red, archivos ni claves. El director llama
por su cuenta, con la `llamar(modelo, prompt) -> texto` de siempre (por
ejemplo `optimizador_panel.llamar_modelo_real`, modelos `:free`) e `revisar`
se la inyecta.

Formato de objeción:
    {"titulo": "...", "detalle": "...",
     "gravedad": "bloquea|importa|menor", "resuelta": bool opcional}
"""

import json
from typing import Optional

GRAVEDADES = ("bloquea", "importa", "menor")
"""Gravedades válidas; `bloquea` para la sola ola si nadie la resuelve."""

TIPOS = ("propuesta", "respuesta")
"""Artefactos que revisan los peces: una ola propuesta o una respuesta larga."""


def prompt_de_pez(artefacto: str, tipo: str) -> str:
    """Construye el mensaje que ve un pez: el artefacto y nada más. PURA."""
    clase = tipo if tipo in TIPOS else TIPOS[0]
    return (
        "Eres un pez revisor de StarSeed OS: no sabes nada del proyecto, "
        "vienes a este texto sin contexto para leerlo como un extraño.\n"
        "Artefacto a revisar (una " + clase + "):\n\n"
        + str(artefacto)
        + "\n\nResponde SOLO con un JSON: "
        '{"objeciones": [{"titulo": "resumen corto", "detalle": "por qué '
        'importa", "gravedad": "bloquea|importa|menor"}]}. '
        "`bloquea` solo si el problema impide seguir tal cual; `importa` si "
        "convendría corregirlo antes; `menor` para todo lo demás. Duda "
        "razonable: `menor`. Sin objeciones: {\"objeciones\": []}."
    )


def _valida(cruda) -> Optional[dict]:
    """Filtra una objeción candidata contra el formato del catálogo. PURA."""
    if not isinstance(cruda, dict):
        return None
    titulo = str(cruda.get("titulo") or "").strip()
    gravedad = cruda.get("gravedad")
    if not titulo or gravedad not in GRAVEDADES:
        return None
    return {
        "titulo": titulo,
        "detalle": str(cruda.get("detalle") or "").strip(),
        "gravedad": gravedad,
        "resuelta": bool(cruda.get("resuelta")),
    }


def leer_objeciones(texto: str) -> list:
    """Traduce la respuesta bruta de un pez a objeciones válidas. PURA.

    Acepta un array JSON o un objeto {"objeciones": [...]}; descarta lo que
    no cumpla el formato (gravedad fuera de catálogo, sin título) y el JSON
    roto lo cuenta como «sin objeciones».
    """
    if not isinstance(texto, str) or not texto.strip():
        return []
    try:
        datos = json.loads(texto)
    except (json.JSONDecodeError, TypeError, ValueError):
        return []
    crudas = datos if isinstance(datos, list) else (
        datos.get("objeciones") if isinstance(datos, dict) else None
    )
    if not isinstance(crudas, list):
        return []
    objeciones = []
    for cruda in crudas:
        valida = _valida(cruda)
        if valida is not None:
            objeciones.append(valida)
    return objeciones


def ola_pasa(objeciones: list) -> tuple:
    """Decide si la ola entra a la cola: PURA.

    Devuelve (pasa, bloqueos), donde `bloqueos` son los `bloquea` sin
    resolver. Sin objeciones o sin bloqueos vivos, la ola pasa.
    """
    bloqueos = []
    for o in objeciones or []:
        if o.get("gravedad") == "bloquea" and not o.get("resuelta"):
            bloqueos.append(o)
    return (len(bloqueos) == 0, bloqueos)


def revisar(artefacto: str, tipo: str, llamar, modelos: list, n: int = 2) -> list:
    """Reúnese con `n` peces (los primeros `modelos`) y devuelve objeciones.

    Llama a cada pez con `llamar(modelo, prompt_de_pez(artefacto, tipo))`,
    traduce lo que vuelva con `leer_objeciones` y etiqueta cada objeción con
    el pez que la puso (`pez`: modelo). Un `llamar` que lanza o vuelve vacío
    solo pierde a ese pez. PURA respecto a los artefactos: la red va por
    dentro de `llamar`.
    """
    revisados = []
    for modelo in (modelos or [])[: max(0, int(n))]:
        try:
            texto = llamar(modelo, prompt_de_pez(artefacto, tipo))
        except Exception:
            continue
        for objecion in leer_objeciones(texto):
            con_pez = dict(objecion)
            con_pez["pez"] = modelo
            revisados.append(con_pez)
    return revisados
