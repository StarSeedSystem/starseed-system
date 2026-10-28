#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""memvid_cliente · cliente Python (stdlib) del servidor de cápsulas Memvid (MVD1027G).

Habla con el servidor propio `native/memvid-servidor` en 127.0.0.1:4490 con el token de
`~/.starseed/memvid.token` (cabecera `X-StarSeed-Token`). Tope de 1,5 s y None si el
servidor no está o responde mal: ninguna memoria interrumpe el trabajo. Solo la biblioteca
estándar (`urllib`), nunca el SDK de Node (contrato: architecture/memvid-capsulas.md).

Opcional por entorno: MEMVID_URL_BASE (otra base, pruebas) y STARSEED_AGENTE.
"""

import datetime
import json
import os
import re
import unicodedata
import urllib.request

URL_BASE = "http://127.0.0.1:4490"
RUTA_TOKEN = "~/.starseed/memvid.token"
TOPE_SEGUNDOS = 1.5
GLOBO_TOKEN = "X-StarSeed-Token"
NOMBRE_RE = re.compile(r"^[a-zA-Z0-9-]+\.mv2e?$")
URI_AGENTE = "mv2://agente/%s/sesion/%s/%d"
PASOS = {}


def url_base():
    """La base configurada por entorno o la propia. PURA."""
    return os.environ.get("MEMVID_URL_BASE") or URL_BASE


def leer_token(ruta=None):
    """El token del disco (nunca su contenido en el código ni en los avisos)."""
    try:
        with open(os.path.expanduser(str(ruta or RUTA_TOKEN)), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _peticion(metodo, ruta, cuerpo=None, base=None, token=None):
    """Una llamada al servidor; dict con la respuesta o None si falla. Todo va en local."""
    peticion = urllib.request.Request((base or url_base()).rstrip("/") + ruta, method=metodo)
    peticion.add_header(GLOBO_TOKEN, token if token is not None else leer_token())
    peticion.add_header("Content-Type", "application/json")
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    try:
        with urllib.request.urlopen(peticion, data=datos, timeout=TOPE_SEGUNDOS) as r:
            return json.loads(r.read().decode("utf-8"))
    except (OSError, ValueError):
        return None


def _valida(nombre):
    """El servidor solo admite el nombre `[a-zA-Z0-9-]` y `.mv2`, sin `/` ni `..`."""
    if not NOMBRE_RE.fullmatch(nombre or ""):
        raise ValueError("El nombre de cápsula solo admite [a-zA-Z0-9-] y .mv2: %r" % (nombre,))
    return nombre


def salud(base=None, token=None):
    """Si el servidor de cápsulas está vivo: dict de la respuesta o None."""
    return _peticion("GET", "/salud", base=base, token=token)


def poner(nombre, texto, titulo=None, uri=None, etiquetas=None, ts=None, base=None, token=None):
    """Añade un fotograma a la cápsula (el servidor hace commit): `{"frame": id}` o None."""
    cuerpo = {"texto": texto}
    if titulo is not None:
        cuerpo["titulo"] = titulo
    if uri is not None:
        cuerpo["uri"] = uri
    if etiquetas is not None:
        cuerpo["etiquetas"] = etiquetas
    if ts is not None:
        cuerpo["ts"] = ts
    return _peticion("POST", "/capsulas/%s/poner" % _valida(nombre), cuerpo, base, token)


def buscar(nombre, consulta, k=3, base=None, token=None):
    """Los `k` mejores fragmentos de la cápsula: lista de aciertos o None."""
    r = _peticion("POST", "/capsulas/%s/buscar" % _valida(nombre), {"consulta": consulta, "k": k}, base, token)
    if isinstance(r, dict) and isinstance(r.get("aciertos"), list):
        return r["aciertos"]
    return None


def sanear(id_):
    """El id saneado como el del núcleo: [a-z0-9-], sin acentos ni `__`, nunca vacío."""
    s = unicodedata.normalize("NFD", unicodedata.normalize("NFC", str(id_ or "")))
    limpio = re.sub(r"[^a-z0-9-]+", "-", "".join(c for c in s if not unicodedata.combining(c)).lower())
    return limpio.strip("-") or "sin-id"


def capsula_agente(agente, fecha=None):
    """La cápsula del agente en el trimestre UTC actual: `agente-<agente>-<AAAA>T<n>.mv2`."""
    f = fecha or datetime.datetime.now(datetime.timezone.utc)
    return "agente-%s-%dT%d.mv2" % (sanear(agente), f.year, (f.month - 1) // 3 + 1)


def _siguiente_paso(agente, sesion):
    """El número de paso dentro de la sesión (contador por cápsula que escribe este proceso)."""
    clave = (sanear(agente), sanear(sesion))
    PASOS[clave] = PASOS.get(clave, 0) + 1
    return PASOS[clave]


def anotar_paso(agente, sesion, texto, paso=None, titulo=None, base=None, token=None):
    """Un fotograma por paso de sesión de agente (cápsula MVD1027 §3: traza con `replay`).

    `paso` a mano para quien repite la sesión; si no, cuenta este proceso. Devuelve el
    dict del servidor (`{"frame": id}`) o None si el servidor no está."""
    nombre = capsula_agente(agente)
    numero = paso if paso is not None else _siguiente_paso(agente, sesion)
    uri = URI_AGENTE % (sanear(agente), sanear(sesion), numero)
    doc = titulo if titulo is not None else "Paso %d" % numero
    return poner(nombre, texto, titulo=doc, uri=uri, base=base, token=token)
