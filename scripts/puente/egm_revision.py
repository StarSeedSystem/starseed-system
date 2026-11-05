#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EGM en las direcciones (contrato architecture/repos-libreria-1104.md §2).

Peces para las olas: 2–3 llamadas a modelos gratuitos distintos que solo ven
el artefacto (la ola que la imaginación o el autodesarrollo quieren encolar),
nunca el contexto del elefante. Cada pez devuelve objeciones con gravedad
(`bloquea` · `importa` · `menor`); una ola con una objeción `bloquea` sin
resolver no entra.

Módulo puro: la red entra inyectada (`llamar`), como `consultar` en
`decidir.py`; la llamada de verdad reutiliza `motores_director` y no hay
claves ni rutas del disco en este archivo.
"""

import json

GRAVEDADES = ("bloquea", "importa", "menor")
TOPE_ARTEFACTO = 12000
TOPE_TEXTO = 2000


def prompt_de_pez(artefacto, tipo):
    """El prompt que ve un pez: solo el artefacto, sin contexto del elefante."""
    clase = " ".join(str(tipo or "").split()).lower() or "artefacto"
    cuerpo = " ".join(str(artefacto or "").split())[:TOPE_ARTEFACTO] or "(vacío)"
    return "\n\n".join(
        [
            "Eres un pez de EGM en las direcciones de StarSeed OS: un revisor sin contexto "
            "previo, solo ve el artefacto y no cala más lejos de lo que contiene.",
            "Devuelve SOLO JSON — tus objeciones como [{\"texto\": \"…\", "
            "\"gravedad\": \"bloquea|importa|menor\"}] — o [] si no hay ninguna. "
            "Textos en español, objeciones concretas y comprobables en el artefacto; "
            "nada de elogios ni gustos de estilo.",
            "%s a revisar:\n%s" % (clase.capitalize(), cuerpo),
        ]
    )


def _limpiar(dato):
    """Objeciones válidas de un dato ya leído como JSON; texto vacío fuera y
    gravedad desconocida = `importa` (prudente sin bloquearlo todo)."""
    if isinstance(dato, dict):
        dato = dato.get("objeciones")
    if not isinstance(dato, list):
        return []
    limpias = []
    for o in dato:
        if not isinstance(o, dict):
            continue
        texto = " ".join(str(o.get("texto") or "").split())
        if not texto:
            continue
        g = " ".join(str(o.get("gravedad") or "").split()).lower()
        limpias.append(
            {"texto": texto[:TOPE_TEXTO], "gravedad": g if g in GRAVEDADES else "importa"}
        )
    return limpias


def leer_objeciones(texto):
    """Objeciones de la respuesta de un pez. Tolera JSON puro, JSON con cerco de
    texto («```json …») y JSON incrustado; sin JSON válido, [] y el pez calla."""
    texto = str(texto or "").strip()
    if not texto:
        return []
    try:
        return _limpiar(json.loads(texto))
    except ValueError:
        pass
    for i, c in enumerate(texto):
        if c not in "[{":
            continue
        fin = texto.rfind("]" if c == "[" else "}", i)
        if fin <= i:
            continue
        try:
            return _limpiar(json.loads(texto[i : fin + 1]))
        except ValueError:
            pass
    return []


def ola_pasa(objeciones):
    """Una ola solo entra sin objeciones `bloquea` sin resolver (§2)."""
    for o in objeciones or []:
        if isinstance(o, dict) and o.get("gravedad") == "bloquea" and not o.get("resuelta"):
            return False
    return True


def revisar(artefacto, tipo, llamar, modelos, n=2):
    """Peces en paralelo conceptual: los primeros n modelos (2–3, §2) distintos ven el
    mismo artefacto con el mismo prompt; las objeciones repetidas se funden (la mayor
    gravedad gana y se anota de qué peces vino). Sin modelos o con todos callados, []."""
    peces = list(modelos or [])[: max(1, int(n))]
    prompt = prompt_de_pez(artefacto, tipo)
    por_texto = {}
    for pez in peces:
        nombre = str(pez)
        for o in leer_objeciones(llamar(prompt, pez)):
            hallada = por_texto.get(o["texto"])
            if hallada is None:
                por_texto[o["texto"]] = {**o, "peces": [nombre]}
                continue
            if o["gravedad"] != hallada["gravedad"] and GRAVEDADES.index(
                o["gravedad"]
            ) < GRAVEDADES.index(hallada["gravedad"]):
                hallada["gravedad"] = o["gravedad"]
            if nombre not in hallada["peces"]:
                hallada["peces"].append(nombre)
    return list(por_texto.values())


def llamar_director(prompt, modelo=None, orden=None, correr=None, segundos=300):
    """La costura real: cómo llaman hoy los directores a sus modelos (motores_director:
    orden + correr); `orden` y `correr` inyectables para probar sin red. Si el motor
    calla o falla, texto vacío y el pez no objeta — nunca lanza."""
    try:
        from motores_director import correr as correr_real, orden_hermes

        la_orden = orden or orden_hermes(prompt, modelo)
        rc, salida = (correr or correr_real)(la_orden, segundos=segundos)
        return salida if rc == 0 else ""
    except Exception:
        return ""
