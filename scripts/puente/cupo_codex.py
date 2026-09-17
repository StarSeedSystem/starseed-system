# -*- coding: utf-8 -*-
"""Codex agotado: recordarlo, en vez de descubrirlo una tarea sí y otra también.

POR QUÉ (2026-09-17, 16:20)
---------------------------
Cinco tareas volvieron `sin_cambios` esta tarde —CU3b, RS3b, RS1p y las dos del
Dream— y ninguna tenía nada malo. En su log, lo mismo en las cinco:

    ERROR: You've hit your usage limit. Upgrade to Pro…

La suscripción de ChatGPT se agotó. Eso pasa y no es el problema. El problema es
que **Codex nunca se aparta de la rotación**: vive en `pasarelas.SIEMPRE`
("sin clave o suscripción: no salen en el informe"), así que el filtro que
aparta a las pasarelas medidas como mudas no lo mira nunca. Resultado: cada
tarea siguiente vuelve a elegirlo, vuelve a esperar, y vuelve a salir vacía.
Cinco turnos perdidos, uno detrás de otro, por un dato que ya se sabía desde el
primero.

Es la misma lección que apinex y que `modelos_utiles`, en otro sitio: **el
sistema medía el fallo y no se lo guardaba.**

CUÁNTO SE APARTA
----------------
La cuota de ChatGPT se repone por ventanas, no a medianoche, y el mensaje no
dice cuándo. Tres horas es la apuesta prudente: lo bastante para no quemar la
ola entera, lo bastante poco para no renunciar a la capacidad de coste cero
durante un día. Si al volver sigue agotado, se anota otra vez — el coste de
equivocarse por abajo es un turno, y por arriba, una tarde.

Todo aquí es puro: texto, números y un reloj que se pasa como argumento.
"""

import json
import os
import time

#: Dónde se recuerda. Fuera del repo: es estado de esta máquina, no del proyecto.
RUTA = os.path.expanduser("~/.starseed/codex-cupo.json")

#: Lo que dice la CLI de codex cuando la suscripción se acaba. En minúsculas.
PISTAS = (
    "you've hit your usage limit",
    "youve hit your usage limit",
    "usage limit reached",
    "rate limit exceeded",
    "quota exceeded",
    "upgrade to pro",
)

#: Cuánto se aparta tras un agotamiento.
HORAS = 3.0


def agotado_en(salida):
    """¿Esta salida es un agotamiento de cuota de Codex?

    Se mira el texto y no el código de salida a propósito: la CLI devuelve el
    mismo código para «no tienes cuota» y para «el modelo no existe», y esas dos
    cosas piden reacciones opuestas.
    """
    b = (salida or "").lower()
    return any(p in b for p in PISTAS)


def hasta_cuando(ahora, horas=HORAS):
    """El epoch hasta el que conviene no intentarlo."""
    return float(ahora) + float(horas) * 3600.0


def sigue_agotado(marca, ahora):
    """¿La marca guardada todavía vale?

    Una marca ilegible o sin fecha cuenta como «no agotado»: ante la duda, se
    intenta. Perder un turno es más barato que renunciar a la suscripción entera
    por un archivo corrupto.
    """
    if not isinstance(marca, dict):
        return False
    try:
        return float(marca.get("hasta") or 0) > float(ahora)
    except (TypeError, ValueError):
        return False


def minutos_restantes(marca, ahora):
    """Cuántos minutos quedan, para poder decirlo en el Mando sin mentir."""
    if not sigue_agotado(marca, ahora):
        return 0
    return int((float(marca["hasta"]) - float(ahora)) / 60 + 0.5)


# ── la parte que toca el disco ──────────────────────────────────────────────


def leer(ruta=RUTA):
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def anotar(motivo="", ruta=RUTA, ahora=None, horas=HORAS):
    """Guarda que Codex está agotado. Devuelve los minutos que se aparta."""
    ahora = time.time() if ahora is None else ahora
    hasta = hasta_cuando(ahora, horas)
    marca = {
        "hasta": hasta,
        "desde": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
        "hasta_txt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(hasta)),
        "motivo": str(motivo or "")[:160],
    }
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(marca, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except OSError:
        pass
    return minutos_restantes(marca, ahora)


def puede_escribir(ruta=RUTA, ahora=None):
    """¿Tiene sentido darle un turno a Codex ahora mismo?"""
    return not sigue_agotado(leer(ruta), time.time() if ahora is None else ahora)
