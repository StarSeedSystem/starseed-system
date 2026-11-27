#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pool de agentes locales BitNet (BAP1127M, contrato §6.4, correcciones C.6 y C.13).

Reparte peticiones a los slots del llama-server de ESTE nodo según `perfil-ia.json`.
Cede el paso a la conversación y respeta la marca del guardia de memoria.
"""

import importlib.util
import json
import os
import threading
import time
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("STARSEED_JEV_LOCAL_URL", "http://127.0.0.1:8790").rstrip("/")
PERFIL = os.path.expanduser("~/.starseed/perfil-ia.json")
CARACTERES_POR_TOKEN = 3
PLAZO_S = 20
#: conversación > pruebas > el resto (menor número = más prioridad).
PRIORIDAD = {"conversacion": 0, "pruebas": 1, "resto": 2}
TRANSPORTE = None  # pruebas: función(cuerpo) -> dict
_semaforo = None
_semaforo_n = 0
_cerrojo = threading.Lock()


def _cargar(nombre, archivo):
    espec = importlib.util.spec_from_file_location(nombre, os.path.join(AQUI, archivo))
    modulo = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(modulo)
    return modulo


def presupuesto(ctx_por_slot, n_predict, margen=32):
    """PURA: caracteres máximos del prompt que caben en un slot (≈3 caracteres por token)."""
    tokens = int(ctx_por_slot) - int(n_predict) - int(margen)
    return max(0, tokens * CARACTERES_POR_TOKEN)


def recortar(prompt, maximo):
    """PURA: conserva el final del prompt (la pregunta va al final)."""
    if maximo <= 0:
        return ""
    return prompt if len(prompt) <= maximo else prompt[-maximo:]


def hay_marca_del_guardia(existe=os.path.exists):
    g = _cargar("guardia_memoria", "guardia-memoria.py")
    return "llama-server" in g.MOTORES and existe(g.MARCA % "llama-server")


def conversando(ahora=None, ruta=None):
    pc = _cargar("prioridad_conversacion", "prioridad_conversacion.py")
    return pc.activa(pc.leer_concesion(ruta or pc.CONCESION), ahora)


def puede_usar(ahora=None, prioridad="resto", marca=None, conversacion=None):
    """False si el guardia congeló BitNet o si habla Alex (salvo la conversación misma)."""
    if marca if marca is not None else hay_marca_del_guardia():
        return False
    en_curso = conversacion if conversacion is not None else conversando(ahora)
    return prioridad == "conversacion" or not en_curso


def leer_perfil(ruta=PERFIL):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _semaforo_para(n):
    global _semaforo, _semaforo_n
    with _cerrojo:
        if _semaforo is None or _semaforo_n != n:
            _semaforo, _semaforo_n = threading.BoundedSemaphore(n), n
        return _semaforo


def _transporte_real(cuerpo, timeout=PLAZO_S):
    req = urllib.request.Request(
        URL + "/completion", data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def pedir(prompt, n_predict=128, prioridad="resto", plazo=PLAZO_S, perfil=None):
    """Una petición a un slot libre. Devuelve el texto, o None si no puede. Nunca lanza."""
    try:
        perfil = perfil if perfil is not None else leer_perfil()
        slots = int(perfil.get("slots_bitnet") or 0)
        if slots < 1 or prioridad not in PRIORIDAD or not puede_usar(prioridad=prioridad):
            return None
        texto = recortar(prompt, presupuesto(perfil.get("ctx_por_slot", 0), n_predict))
        if not texto:
            return None
        limite = time.time() + plazo
        sem = _semaforo_para(slots)
        if not sem.acquire(timeout=plazo):
            return None
        try:
            if not puede_usar(prioridad=prioridad):
                return None
            envio = TRANSPORTE or (lambda c: _transporte_real(c, max(1, limite - time.time())))
            return envio({"prompt": texto, "n_predict": n_predict}).get("content")
        finally:
            sem.release()
    except Exception:
        return None
