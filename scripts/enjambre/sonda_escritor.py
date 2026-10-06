# -*- coding: utf-8 -*-
"""¿Puede este escritor escribir AHORA? Una petición de 1 token antes de lanzar opencode.

(2026-10-06) Con la flota gratuita agotada, cada modelo se «colgaba» 5 minutos: opencode
reintenta en silencio los 429/402 del proveedor y no escribe ni un byte, el vigilante lo corta
por estancado a los 300 s y pasa al siguiente. Siete modelos agotados = 35 minutos por tarea
para acabar en «ningún proveedor llegó a intentarlo». Medido a las 14:47: OpenRouter con su
tope diario de modelos :free (429 «free-models-per-day»), xKiro con su cupo diario (429), Gemini
sin cuota (429), NIM con kimi-k3 sin contestar en 60 s y varios modelos retirados (410), Hugging
Face sin crédito mensual (402). Una sonda de 1 token lo sabe en un segundo.

Lo PURO (`clasificar`, `horas_hasta_medianoche_utc`, `destino`) tiene sus pruebas en
`test_sonda_escritor.py`. `sondear` hace la petición con un `abrir` inyectable.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request

#: Un «responde» vale este tiempo: no se sondea antes de cada tarea, solo de vez en cuando.
OK_VALE_S = 600
#: Sin respuesta en este tiempo = no está para escribir ahora.
TIEMPO_S = 25
#: Proveedores que no se sondean así: codex va por su sesión y avisa él mismo de su límite.
SIN_SONDA = ("codex",)

_DIARIO = re.compile(r"per[- ]day|today|daily|del d[ií]a|free-models-per-day")
_PAGO = re.compile(r"paid|premium|subscri|top up|wallet|deposit")
_CREDITO = re.compile(r"payment required|credits|recharge|insufficient|balance")


def horas_hasta_medianoche_utc(ahora=None):
    """PURA: horas hasta las 00:00 UTC siguientes (ahí vuelven los cupos diarios), mínimo 0,25."""
    ahora = time.time() if ahora is None else ahora
    resto = 86400 - (int(ahora) % 86400)
    return max(0.25, round(resto / 3600.0, 2))


def clasificar(codigo, cuerpo, ahora=None):
    """PURA. (apto, motivo, horas_sin_cupo, modelo_muerto).

    - 200 → apto.
    - 404/410 o «does not exist» → el MODELO ya no existe: fuera de la rotación (no el proveedor).
    - 403 de «solo de pago/premium» → ese modelo no es gratis: fuera de la rotación.
    - 429 con tope diario → proveedor sin cupo hasta las 00:00 UTC; 429 suelto → 15 min.
    - 402 o «sin crédito» → proveedor sin cupo 24 h.
    - 5xx o sin respuesta (codigo None) → 15 min.
    - Cualquier otro código → apto (que lo diga opencode: la sonda no debe frenar de más)."""
    c = (cuerpo or "").lower()
    if codigo == 200:
        return True, "responde", 0, False
    if codigo in (404, 410) or "does not exist" in c or "has reached its end" in c:
        return False, "modelo retirado (%s)" % codigo, 0, True
    if codigo == 403 and _PAGO.search(c):
        return False, "modelo solo de pago (403)", 0, True
    if codigo == 429:
        if _DIARIO.search(c) or "quota" in c:
            return False, "cupo del día agotado (429)", horas_hasta_medianoche_utc(ahora), False
        return False, "saturado (429)", 0.25, False
    if codigo == 402 or _CREDITO.search(c):
        return False, "sin crédito (%s)" % codigo, 24, False
    if codigo is None:
        return False, "no contesta en %d s" % TIEMPO_S, 0.25, False
    if isinstance(codigo, int) and codigo >= 500:
        return False, "error del proveedor (%s)" % codigo, 0.25, False
    return True, "código %s: lo intento igual" % codigo, 0, False


def destino(modelo, cfg_opencode, entorno):
    """PURA: (url, clave, id_del_modelo) para sondear un escritor de opencode, o None si no se
    puede (sin bloque de proveedor, sin clave o proveedor sin sonda). La clave sale del
    `{env:VAR}` del bloque, como hace opencode; nunca se escribe en ningún sitio."""
    prov, _, nombre = str(modelo or "").partition("/")
    if not prov or not nombre or prov in SIN_SONDA:
        return None
    if prov == "google":
        clave = entorno.get("GEMINI_API_KEY") or entorno.get("GOOGLE_API_KEY") or ""
        url = "https://generativelanguage.googleapis.com/v1beta/openai"
    else:
        bloque = ((cfg_opencode or {}).get("provider") or {}).get(prov) or {}
        opciones = bloque.get("options") or {}
        url = opciones.get("baseURL") or ""
        bruta = str(opciones.get("apiKey") or "")
        m = re.fullmatch(r"\{env:([A-Za-z0-9_]+)\}", bruta)
        clave = entorno.get(m.group(1), "") if m else bruta
    if not url or not clave:
        return None
    return url.rstrip("/") + "/chat/completions", clave, nombre


def _abrir(req, timeout):
    return urllib.request.urlopen(req, timeout=timeout)


def sondear(modelo, cfg_opencode, entorno, abrir=_abrir, ahora=None):
    """(apto, motivo, horas_sin_cupo, modelo_muerto). Sin destino sondeable → apto (no frena)."""
    d = destino(modelo, cfg_opencode, entorno)
    if not d:
        return True, "sin sonda", 0, False
    url, clave, nombre = d
    cuerpo = json.dumps({"model": nombre, "messages": [{"role": "user", "content": "ok"}],
                         "max_tokens": 16, "temperature": 0}).encode()
    req = urllib.request.Request(url, data=cuerpo, headers={
        "Authorization": "Bearer " + clave, "Content-Type": "application/json",
        "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
    try:
        with abrir(req, TIEMPO_S) as r:
            return clasificar(getattr(r, "status", 200), "", ahora)
    except urllib.error.HTTPError as e:
        try:
            texto = e.read().decode("utf-8", "replace")[:400]
        except Exception:
            texto = str(e)
        return clasificar(e.code, texto, ahora)
    except Exception:
        return clasificar(None, "", ahora)


class Memoria(object):
    """Lo que ya se sabe en esta corrida: OK recientes por proveedor y vetos con su fin."""

    def __init__(self):
        self.ok = {}       # proveedor -> epoch del último «responde»
        self.veto = {}     # modelo -> (epoch fin, motivo)

    def consultar(self, modelo, ahora=None):
        ahora = time.time() if ahora is None else ahora
        prov = str(modelo).split("/", 1)[0]
        fin, motivo = self.veto.get(modelo, (0, ""))
        if fin > ahora:
            return False, motivo
        if ahora - self.ok.get(prov, 0) < OK_VALE_S:
            return True, "respondió hace poco"
        return None, ""

    def anotar(self, modelo, apto, motivo, horas, ahora=None):
        ahora = time.time() if ahora is None else ahora
        prov = str(modelo).split("/", 1)[0]
        if apto:
            self.ok[prov] = ahora
            self.veto.pop(modelo, None)
        else:
            self.veto[modelo] = (ahora + max(horas, 0.25) * 3600, motivo)
