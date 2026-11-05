#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EGM · los peces de las direcciones (Ola 1104R · RPO1104D).

El elefante (la dirección) redacta con todo el contexto; los peces lo revisan
SIN contexto: solo ven el artefacto y su tipo. Cada objeción lleva su gravedad
(`bloquea`, `importa`, `menor`), y una ola con un `bloquea` no entra.

Módulo puro: `llamar` entra inyectado; `llamar_hermes` reutiliza el motor de
Hermes de `motores_director` (modelos gratuitos del OS), sin cliente nuevo.
"""
from __future__ import annotations

import re

GRAVEDADES = ("bloquea", "importa", "menor")

TIPOS = {
    "respuesta": "una respuesta larga de un agente, personalidad o bot",
    "plan": "un plan de trabajo o de una app",
    "ola": "una ola de tareas del enjambre",
    "página": "una página o publicación",
    "app": "una app o una pantalla",
}

_MARCA_INICIAL = re.compile(r"^(?:[-*•·]\s*)+")
_NUMERO = re.compile(r"^\d+[.)]\s*")
_ETIQUETA = re.compile(r"^(?:gravedad|severidad)\s*[:=]\s*", re.IGNORECASE)
_OBJECION = re.compile(r"^(bloquea|importa|menor)\b[*_`\])]*\s*", re.IGNORECASE)
_SEPARADOR = re.compile(r"^[:：·\-–—]\s*")

def _leer_linea(linea: str):
    """Devuelve `(gravedad, texto)` o None si la línea no declara gravedad."""
    s = linea.strip()
    s = _MARCA_INICIAL.sub("", s)
    s = _NUMERO.sub("", s)
    s = s.lstrip("*_`[( ")
    etiqueta = _ETIQUETA.match(s)
    if etiqueta:
        s = s[etiqueta.end():].lstrip("*_`[( ")
    m = _OBJECION.match(s)
    if not m:
        return None
    gravedad = m.group(1).lower()
    texto = re.sub(r"[*_`]+", "", _SEPARADOR.sub("", s[m.end():].lstrip("*_`] )"))).strip()
    return gravedad, texto

def prompt_de_pez(artefacto, tipo: str) -> str:
    """Prompt de un revisor a ciegas: solo el artefacto y su tipo, nunca el contexto."""
    clase = TIPOS.get(str(tipo or "").strip().lower(), str(tipo or "").strip() or "artefacto")
    cuerpo = "" if artefacto is None else str(artefacto)
    return (
        "Eres un pez revisor de EGM. No tienes contexto: solo ves el artefacto y su tipo.\n"
        "No supongas lo que falta fuera de él; juzga lo que está escrito.\n"
        "Tipo: " + clase + ".\n\n"
        "ARTEFACTO:\n" + cuerpo + "\n\n"
        "Devuelve UNA objeción por línea, empezando por su gravedad: "
        "`bloquea`, `importa` o `menor`. Ejemplo: `bloquea: falta el presupuesto`.\n"
        "No expliques el artefacto ni propongas una reescritura completa. "
        "Si no hay objeciones, escribe solo `sin objeciones`."
    )

def leer_objeciones(texto) -> list[dict]:
    """Lee la salida del pez de forma tolerante: ignora ruido y quita duplicados."""
    if not isinstance(texto, str): return []
    vistas, fuera = set(), []
    for linea in texto.splitlines():
        leida = _leer_linea(linea)
        if leida:
            gravedad, cuerpo = leida
            clave = (gravedad, cuerpo.casefold())
            if clave not in vistas:
                vistas.add(clave)
                fuera.append({"gravedad": gravedad, "texto": cuerpo})
    return fuera

def ola_pasa(objeciones) -> dict:
    """Veredicto: pasa solo si ningún pez marcó una objeción `bloquea`."""
    bloqueantes = sum(
        1 for o in objeciones or []
        if isinstance(o, dict) and str(o.get("gravedad", "")).lower() == "bloquea"
    )
    return {"pasa": bloqueantes == 0, "bloqueantes": bloqueantes}

def revisar(artefacto, tipo: str, llamar, modelos, n: int = 2) -> list[dict]:
    """Llama a `n` peces distintos y devuelve sus objeciones ya leídas.

    `llamar(prompt, modelo)` es inyectable y devuelve texto (o un dict con
    `texto`/`answer`/`content`). Para la llamada real, `llamar_hermes`.
    """
    if not callable(llamar):
        raise TypeError("llamar debe ser invocable")
    if n < 1:
        raise ValueError("n debe ser al menos 1")
    if isinstance(modelos, str):
        modelos = [modelos]
    elegidos = []
    for modelo in modelos or []:
        if modelo and modelo not in elegidos:
            elegidos.append(modelo)
        if len(elegidos) >= n:
            break
    prompt = prompt_de_pez(artefacto, tipo)
    objeciones = []
    for modelo in elegidos:
        salida = llamar(prompt, modelo)
        if isinstance(salida, dict):
            salida = salida.get("texto") or salida.get("answer") or salida.get("content") or ""
        objeciones.extend(leer_objeciones(salida))
    return objeciones

def llamar_hermes(prompt: str, modelo: str) -> str:
    """Llamada real por el motor de Hermes de los directores (gratuitos del OS)."""
    import motores_director
    rc, salida = motores_director.correr(
        motores_director.orden_hermes(prompt, modelo), segundos=300
    )
    if rc != 0 and not (salida or "").strip():
        raise RuntimeError("el revisor %s no respondió" % modelo)
    return salida or ""
