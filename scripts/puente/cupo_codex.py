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
import re
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

#: Lo que dice Codex cuando la cuenta de ChatGPT no admite el modelo (2026-10-23 en
#: adelante: «The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT
#: account», code «model_not_found»). No es cuota: no vuelve en tres horas.
PISTAS_SIN_MODELO = (
    "is not supported when using codex with a chatgpt account",
    "model_not_found",
)

#: Cuánto se aparta cuando la cuenta no admite el modelo.
HORAS_SIN_MODELO = 24


def agotado_en(salida):
    """¿Esta salida es un agotamiento de cuota de Codex?

    Se mira el texto y no el código de salida a propósito: la CLI devuelve el
    mismo código para «no tienes cuota» y para «el modelo no existe», y esas dos
    cosas piden reacciones opuestas.
    """
    b = (salida or "").lower()
    return any(p in b for p in PISTAS)


def sin_modelo_en(salida):
    """¿Esta salida dice que la cuenta de ChatGPT no admite el modelo de Codex?

    Distinto de `agotado_en`: aquí reintentar en tres horas no sirve, y cada intento
    acababa en `sin_cambios` gastando el primer turno de la tarea (DEC1028A, ocho veces).
    """
    b = (salida or "").lower()
    return any(p in b for p in PISTAS_SIN_MODELO)


#: (SUP0511F, 05-11) Desde noviembre la CLI SÍ dice cuándo vuelve: «You've hit your usage limit. Upgrade to
#: Plus to continue using Codex (…), or try again at Nov 22nd, 2026 7:45 PM.» Con las 3 h de siempre, el
#: enjambre lo volvía a probar cada 3 h hasta esa fecha y cada vuelta le costaba un intento a una tarea
#: (SUP0511Cb-d1 a las 17:35, «sin cambios con codex (3/5)»).
_MESES = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
_REINTENTA = re.compile(
    r"try again (?:at|on) ([a-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})"
    r"(?:,? (?:at )?(\d{1,2}):(\d{2})\s*([ap])\.?m\.?)?",
    re.IGNORECASE)

#: Lo más que se aparta por una fecha leída: una fecha absurda no lo deja fuera para siempre.
HORAS_TOPE_REINICIO = 31 * 24


def reinicio_en(salida):
    """PURA (salvo la zona horaria): el epoch de «try again at <Mes> <día>, <año> <h>:<mm> AM/PM» en la hora
    local de la Mac, que es la que escribe la CLI; None si la salida no trae fecha."""
    m = _REINTENTA.search(salida or "")
    if not m:
        return None
    mes = _MESES.get(m.group(1).lower())
    if not mes:
        return None
    hora, minuto = (int(m.group(4)), int(m.group(5))) if m.group(4) else (0, 0)
    if m.group(6):
        hora = hora % 12 + (12 if m.group(6).lower() == "p" else 0)
    try:
        return time.mktime((int(m.group(3)), mes, int(m.group(2)), hora, minuto, 0, 0, 0, -1))
    except (OverflowError, ValueError):
        return None


def horas_de_cuota(salida, ahora):
    """Cuánto apartar a Codex tras un agotamiento: hasta la hora que da la CLI, entre `HORAS` y
    `HORAS_TOPE_REINICIO`; sin fecha legible (o ya pasada), `HORAS` como siempre."""
    reinicio = reinicio_en(salida)
    if reinicio is None:
        return HORAS
    return min(max((reinicio - float(ahora)) / 3600.0, HORAS), float(HORAS_TOPE_REINICIO))


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
    """Cuántos minutos quedan, para poder decirlo en Genesis sin mentir."""
    if not sigue_agotado(marca, ahora):
        return 0
    return int((float(marca["hasta"]) - float(ahora)) / 60 + 0.5)


# ── la parte que toca el disco ──────────────────────────────────────────────


def _ruta(ruta):
    """La ruta de la marca, resuelta al llamar y no al definir la función.

    (2026-11-04, SUP0411I) Con `ruta=RUTA` de valor por defecto, Python fijaba la ruta
    al cargar el módulo: cambiar `cupo_codex.RUTA` no servía de nada. `CodexCuenta` (en
    test_acciones_de_alex) lo cambiaba para no tocar la Mac, y sus pruebas escribían la
    marca de 2001 encima de la de verdad («cuenta de ChatGPT sin Codex», 24 h). El
    enjambre volvía a probar Codex cada hora (7 veces del 04-11 entre las 18:35 y las
    23:30), y con la marca real vigente cuatro pruebas contaban una acción de más y
    frenaban la autopublicación (20:29 y 21:40).
    """
    return RUTA if ruta is None else ruta


def leer(ruta=None):
    ruta = _ruta(ruta)
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def anotar(motivo="", ruta=None, ahora=None, horas=HORAS):
    """Guarda que Codex está agotado. Devuelve los minutos que se aparta."""
    ruta = _ruta(ruta)
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


#: Los modelos que la cuenta de ChatGPT admite HOY los guarda la propia CLI en este caché (lo
#: refresca sola). Desde el 04-11 ya no trae `gpt-5.6-sol`: se le pide el mejor que sí liste, sin
#: pagar nada aparte (probado el 05-11: `codex exec -m gpt-5.6-terra` responde con la suscripción).
CACHE_MODELOS = os.path.expanduser("~/.codex/models_cache.json")


def modelos_admitidos(datos):
    """PURA: los `slug` con `visibility: list` del caché de la CLI, del mejor al peor (`priority`)."""
    filas = datos.get("models") if isinstance(datos, dict) else None
    buenos = [m for m in (filas or []) if isinstance(m, dict) and m.get("slug") and m.get("visibility") == "list"]
    buenos.sort(key=lambda m: m.get("priority") if isinstance(m.get("priority"), (int, float)) else 1e9)
    return [str(m["slug"]) for m in buenos]


def elegir_modelo(pedido, admitidos):
    """PURA: el modelo que de verdad se le pide a `codex exec`. El pedido (sin «codex/») si la cuenta
    lo admite o si no se sabe qué admite; si no, el mejor de los que admite."""
    nombre = str(pedido or "")
    if nombre.startswith("codex/"):
        nombre = nombre.split("/", 1)[1]
    if not admitidos or nombre in admitidos:
        return nombre
    return admitidos[0]


def modelo_vigente(pedido, ruta=None):
    """`elegir_modelo` con el caché real de la CLI. Nunca lanza: sin caché, el pedido tal cual."""
    try:
        with open(ruta or CACHE_MODELOS, encoding="utf-8") as f:
            datos = json.load(f)
    except Exception:
        datos = None
    return elegir_modelo(pedido, modelos_admitidos(datos))


def puede_escribir(ruta=None, ahora=None):
    """¿Tiene sentido darle un turno a Codex ahora mismo?"""
    return not sigue_agotado(leer(ruta), time.time() if ahora is None else ahora)
