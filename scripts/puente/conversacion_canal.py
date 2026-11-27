#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Memoria de conversación del canal de diseño (@StarSeed_Design_bot), DIS1126A.

Guarda la última pregunta abierta de cada chat con su acción concreta, para que un «Sí»
ejecute ESA acción y no se tome por una petición nueva. También reconoce condiciones de
aprobación y el modo de desarrollo conjunto, nombra a Maggasukha y da formato Telegram.
"""

import html
import json
import os
import re
import time
import unicodedata

BASE = os.path.expanduser("~/.starseed/peticiones")
RUTA_ABIERTAS = os.path.join(BASE, "conversacion_abierta.json")
RUTA_CONDICIONES = os.path.join(BASE, "condiciones_aprobacion.json")
RUTA_REFLEJO = os.path.expanduser("~/.starseed/mando/director/audiovisual.jsonl")
CADUCA_S = 24 * 3600

SI = {"si", "s", "ok", "vale", "dale", "adelante", "hazlo", "claro", "perfecto", "de acuerdo", "venga", "procede", "ejecuta"}
NO = {"no", "nope", "cancela", "descarta", "mejor no", "para", "nada"}
RE_OPCION = re.compile(r"^(?:opcion\s*)?(\d{1,2})[.)]?$")
RE_CONDICION = re.compile(r"\b(antes de (?:aprobar|que apruebe)|env[ií]ame antes|primero env[ií]ame|para aprobar|condici[oó]n)\b", re.I)
RE_CONJUNTO = re.compile(r"\b(para desarrollarlo juntos|desarrollemos juntos|desarrollo conjunto|desarrolla todo)\b", re.I)


def _plano(texto: str) -> str:
    sin = unicodedata.normalize("NFD", texto.lower().strip())
    sin = "".join(c for c in sin if unicodedata.category(c) != "Mn")
    return re.sub(r"[¡!¿?.,;:\s]+$|^[¡!¿?.,;:\s]+", "", sin)


def _leer(ruta: str) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _escribir(ruta: str, datos: object) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def guardar_abierta(chat: str, pregunta: str, accion: dict, opciones: list | None = None, ruta: str = RUTA_ABIERTAS) -> None:
    """Anota la pregunta que el bot acaba de hacer y qué haría si la respuesta es sí."""
    datos = _leer(ruta)
    datos[str(chat)] = {"pregunta": pregunta, "accion": accion, "opciones": opciones or [], "ts": time.time()}
    _escribir(ruta, datos)


def cerrar(chat: str, ruta: str = RUTA_ABIERTAS) -> None:
    datos = _leer(ruta)
    if datos.pop(str(chat), None) is not None:
        _escribir(ruta, datos)


def clasificar_respuesta(texto: str) -> tuple[str, int | None] | None:
    """('si'|'no'|'opcion', n) si el texto es una respuesta corta; None si es otra cosa."""
    p = _plano(texto)
    if p in SI:
        return ("si", None)
    if p in NO:
        return ("no", None)
    m = RE_OPCION.match(p)
    return ("opcion", int(m.group(1))) if m else None


def resolver(chat: str, texto: str, ruta: str = RUTA_ABIERTAS, ahora: float | None = None) -> dict | None:
    """None si no es respuesta corta. Si lo es: ejecutar la acción abierta, descartar o aclarar."""
    clase = clasificar_respuesta(texto)
    if clase is None:
        return None
    abierta = _leer(ruta).get(str(chat))
    if not abierta or (ahora or time.time()) - abierta["ts"] > CADUCA_S:
        cerrar(chat, ruta)
        return {"resultado": "aclarar", "mensaje": "Maggasukha, no tengo ninguna pregunta abierta. ¿A qué te refieres?"}
    tipo, n = clase
    if tipo == "no":
        cerrar(chat, ruta)
        return {"resultado": "descartar", "pregunta": abierta["pregunta"]}
    if tipo == "opcion":
        ops = abierta["opciones"]
        if not 1 <= n <= len(ops):
            return {"resultado": "aclarar", "mensaje": f"Maggasukha, elige una opción del 1 al {len(ops) or 1}."}
        accion = {**abierta["accion"], "opcion": ops[n - 1]}
    else:
        accion = abierta["accion"]
    cerrar(chat, ruta)
    return {"resultado": "ejecutar", "accion": accion, "pregunta": abierta["pregunta"]}


def es_condicion(texto: str) -> bool:
    return bool(RE_CONDICION.search(texto))


def es_modo_conjunto(texto: str) -> bool:
    return bool(RE_CONJUNTO.search(texto))


def guardar_condicion(texto: str, ruta: str = RUTA_CONDICIONES) -> list:
    """Condición de aprobación: se cumple con un dossier por caso antes de aprobar."""
    datos = _leer(ruta) if os.path.exists(ruta) else {}
    lista = datos.get("condiciones", [])
    lista.append({"texto": texto.strip(), "ts": time.time(), "cumplida": False})
    _escribir(ruta, {"condiciones": lista})
    return lista


def nombrar(texto: str) -> str:
    """Regla permanente: en todo mensaje del canal se le llama Maggasukha, nunca «Alex»."""
    return re.sub(r"\bAlex\b", "Maggasukha", texto)


def formato_telegram(texto: str, modelo: str = "") -> str:
    """HTML de Telegram: sin `###` ni markdown crudo, viñetas y firma del canal."""
    t = re.sub(r"^\s{0,3}#{1,6}\s*(.+)$", lambda m: f"<b>{html.escape(m.group(1).strip('* '))}</b>", nombrar(texto), flags=re.M)
    t = re.sub(r"^(\s*)[-*]\s+", r"\1• ", t, flags=re.M)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    firma = "— Audiovisual y diseño" + (f" · {modelo}" if modelo else "")
    return f"{t.strip()}\n\n{firma}"


def reflejar(sentido: str, chat: str, texto: str, ruta: str = RUTA_REFLEJO) -> None:
    """Refleja cada mensaje del bot (entrante o saliente) en el canal audiovisual de la Mac."""
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "sentido": sentido, "chat": str(chat), "texto": texto}, ensure_ascii=False) + "\n")
