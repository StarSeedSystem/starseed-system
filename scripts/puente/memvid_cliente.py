#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""memvid_cliente · cliente de cápsulas Memvid SOLO con la stdlib (MVD1027G).

Habla con el servidor propio de cápsulas (`native/memvid-servidor`, contrato:
`architecture/memvid-capsulas.md` §4): HTTP en 127.0.0.1:4490 y cada petición
con la cabecera `X-StarSeed-Token` con el contenido de `~/.starseed/memvid.token`.
Sin `requests`, sin el SDK de Node y sin ninguna cuenta de memvid.com.

El servidor apagado no es un error: `salud`, `poner` y `buscar` devuelven `None`
si no responde (tope de 1,5 s). Núcleo puro: `sanea_id`, `nombre_capsula` y
`uri_de_paso` no tocan la red ni el disco.
"""

import json
import os
import re
import time
import urllib.request
from datetime import datetime, timezone

BASE = "http://127.0.0.1:4490"
TOPE = 1.5
RUTA_TOKEN = "~/.starseed/memvid.token"
_SANO = re.compile(r"[^a-z0-9-]+")


def sanear_id(ident):
    """Id seguro para nombre de cápsula y uri: minúsculas, [a-z0-9-], ≤ 64."""
    s = _SANO.sub("-", str(ident or "").lower()).strip("-")
    return s[:64] if s else "anonimo"


def nombre_capsula(agente, ahora=None):
    """`agente-<id>-<AAAA>T<trimestre>.mv2` (contrato §2: cápsula por sujeto y trimestre)."""
    f = (ahora or datetime.now(timezone.utc))
    return "agente-%s-%dT%d.mv2" % (sanear_id(agente), f.year, (f.month - 1) // 3 + 1)


def uri_de_paso(agente, sesion, paso):
    """`mv2://agente/<agente>/sesion/<sesion>/<paso>`."""
    return "mv2://agente/%s/sesion/%s/%d" % (sanear_id(agente), sanear_id(sesion), paso_int(paso))


def paso_int(paso):
    """El paso como número entero ≥ 0 (con None o basura, 0); para la uri y el `ts`."""
    try:
        return max(0, int(paso))
    except (TypeError, ValueError):
        return 0


def capsula_valida(nombre):
    """El servidor solo admite `[a-z0-9-]` con «.mv2», sin `/` ni «..» (contrato §4)."""
    return bool(re.fullmatch(r"[a-z0-9-]+\.mv2", str(nombre or "")))


def leer_token(ruta=RUTA_TOKEN):
    """El token del servidor (archivo 0600; nunca se imprime ni queda en un log)."""
    try:
        with open(os.path.expanduser(str(ruta or RUTA_TOKEN)), encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def _pedir(metodo, ruta, cuerpo=None, token=None, base=BASE, tope=TOPE):
    """Una petición HTTP; dict si la respuesta es JSON válido, None en cualquier fallo."""
    data = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request((base or BASE).rstrip("/") + ruta, data=data, method=metodo, headers={
        "Content-Type": "application/json; charset=utf-8",
        "X-StarSeed-Token": token if token is not None else (leer_token() or "")})
    try:
        with urllib.request.urlopen(req, timeout=tope) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except (OSError, ValueError):  # URLError, HTTPError, socket.timeout y JSON roto
        return None


def salud(token=None, base=BASE, tope=TOPE):
    """GET /salud: dict si el servidor de cápsulas está vivo, None en cualquier fallo."""
    return _pedir("GET", "/salud", token=token, base=base, tope=tope)


def poner(capsula, texto, titulo=None, uri=None, etiquetas=None, ts=None, token=None, base=BASE, tope=TOPE):
    """POST /capsulas/<nombre>/poner: añade un fotograma y hace commit. `{frame}` o None."""
    if not capsula_valida(capsula):
        raise ValueError("cápsula inválida: %r" % (capsula,))
    cuerpo = {"texto": texto or ""}
    for n, v in (("titulo", titulo), ("uri", uri), ("etiquetas", etiquetas), ("ts", ts)):
        if v is not None:
            cuerpo[n] = v
    d = _pedir("POST", "/capsulas/%s/poner" % capsula, cuerpo, token=token, base=base, tope=tope)
    return d if isinstance(d, dict) else None


def buscar(capsula, consulta, k=3, token=None, base=BASE, tope=TOPE):
    """POST /capsulas/<nombre>/buscar: los aciertos `[{titulo,texto,uri,ts}]` o None si no está."""
    if not capsula_valida(capsula):
        raise ValueError("cápsula inválida: %r" % (capsula,))
    d = _pedir("POST", "/capsulas/%s/buscar" % capsula, {"consulta": consulta or "", "k": int(k or 0)},
               token=token, base=base, tope=tope)
    a = d.get("aciertos") if isinstance(d, dict) else None
    return a if isinstance(a, list) else None


def anotar_paso(agente, sesion, texto, paso=None, ahora=None, titulo=None, token=None, base=BASE, tope=TOPE):
    """La traza de un paso de la sesión de un agente: un fotograma en su cápsula del trimestre.
    Uri `mv2://agente/<agente>/sesion/<sesion>/<paso>`; si no llega `paso` se cuenta la hora
    entera (los pasos quedan ordenados sin preguntar al servidor). None si no respondió."""
    p = paso_int(paso if paso is not None else time.time())
    capsula = nombre_capsula(agente, ahora)
    uri = uri_de_paso(agente, sesion, p)
    d = poner(capsula, texto, titulo=titulo or ("sesión %s · paso %d" % (sesion, p)), uri=uri,
              ts=p if paso is None else None, token=token, base=base, tope=tope)
    if d is None:
        return None
    a = dict(d)
    a.update({"capsula": capsula, "paso": p, "uri": uri})
    return a
