#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""memvid_cliente · cápsulas Memvid para los agentes del puente (MVD1027G, 2026-10-27).

Cliente del servidor propio de cápsulas (contrato: `architecture/memvid-capsulas.md` §4):
HTTP a 127.0.0.1:4490 con la cabecera `X-StarSeed-Token` tomada de `~/.starseed/memvid.token`
(solo se LEE el archivo; la clave jamás va al código, a los mensajes ni al bus). Solo
biblioteca estándar (`urllib`). Con 1,5 s de tope, si el servidor no está TODO devuelve
`None`: un agente nunca falla por no recordar.

  anotar_paso(agente, sesion, texto)   · un paso de sesión en `agente-<agente>-<AAAA>T<n>.mv2`,
                                         uri «mv2://agente/<agente>/sesion/<sesion>/<paso>»
  buscar_recuerdos(agente, consulta, k=3) · lo que el agente ya dejó anotado (la usa
                                         `contexto_agente.py` para «Recuerdos de este agente»)
"""

import json
import os
import re
import time
import urllib.request

SERVIDOR = "http://127.0.0.1:4490"
TOKEN = "~/.starseed/memvid.token"
TOPE_S = 1.5
_SANEADO = re.compile(r"[^a-z0-9]+")
_NOMBRE = re.compile(r"[a-z0-9][a-z0-9-]*\.mv2e?")


def periodo_de(ts):
    """Trimestre con formato «2026T4», en UTC (igual que `periodoDe` de capsulas.ts). PURA."""
    g = time.gmtime(ts)
    return "%dT%d" % (g.tm_year, g.tm_mon // 3 + 1)


def sanea_id(valor):
    """«Aurora Café_2» → «aurora-cafe-2»: solo [a-z0-9-], nunca vacío. PURA."""
    limpio = _SANEADO.sub("-", (valor or "").lower()).strip("-")
    if not limpio:
        raise ValueError("El identificador queda vacío al sanearlo")
    return limpio


def nombre_capsula(agente, ts=None):
    """La cápsula del agente en este trimestre: «agente-aurora-2026T4.mv2». PURA."""
    return "agente-%s-%s.mv2" % (sanea_id(agente), periodo_de(ts if ts is not None else time.time()))


def uri_paso(agente, sesion, paso):
    """«mv2://agente/aurora/sesion/s42/3». PURA."""
    return "mv2://agente/%s/sesion/%s/%s" % (
        sanea_id(agente), sanea_id(str(sesion)), sanea_id(str(paso)))


def leer_token(ruta=TOKEN):
    """El contenido del archivo de token (0600) o ""; jamás lo escribe ni lo enseña."""
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _peticion(metodo, url, cuerpo=None, token="", tope=TOPE_S):
    """Una petición con el token y el tope: (estado, datos) o None si algo falla."""
    try:
        cabecera = {"X-StarSeed-Token": token or "", "Accept": "application/json"}
        datos = None
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode("utf-8")
            cabecera["Content-Type"] = "application/json"
        p = urllib.request.Request(url, data=datos, headers=cabecera, method=metodo)
        with urllib.request.urlopen(p, timeout=tope) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _base(raiz, token):
    """(raíz sin barra final, token a usar). El token por parámetro solo lo pasa la prueba."""
    return (raiz or SERVIDOR).rstrip("/"), token if token is not None else leer_token()


def salud(raiz=None, token=None, tope=TOPE_S):
    """¿Está vivo el servidor de cápsulas? Sus datos o `None`."""
    destino, tok = _base(raiz, token)
    r = _peticion("GET", destino + "/salud", token=tok, tope=tope)
    return r[1] if r else None


def poner(nombre, texto, titulo=None, uri=None, etiquetas=None, ts=None,
          raiz=None, token=None, tope=TOPE_S):
    """Añade un fotograma a una cápsula y hace commit (lo hace el servidor): data o None."""
    if not _NOMBRE.fullmatch(nombre or ""):
        raise ValueError("Nombre de cápsula no válido: %r" % (nombre,))
    base, tok = _base(raiz, token)
    cuerpo = {"texto": texto}
    if titulo:
        cuerpo["titulo"] = titulo
    if uri:
        cuerpo["uri"] = uri
    if etiquetas:
        cuerpo["etiquetas"] = etiquetas
    if ts is not None:
        cuerpo["ts"] = ts
    r = _peticion("POST", base + "/capsulas/" + nombre + "/poner", cuerpo=cuerpo,
                  token=tok, tope=tope)
    return r[1] if r else None


def buscar(nombre, consulta, k=5, raiz=None, token=None, tope=TOPE_S):
    """Los k mayores aciertos de la cápsula: [{titulo, texto, uri, ts}] o None."""
    if not _NOMBRE.fullmatch(nombre or ""):
        raise ValueError("Nombre de cápsula no válido: %r" % (nombre,))
    base, tok = _base(raiz, token)
    cuerpo = {"consulta": consulta, "k": k}
    r = _peticion("POST", base + "/capsulas/" + nombre + "/buscar", cuerpo=cuerpo,
                  token=tok, tope=tope)
    if not r or not isinstance(r[1], dict):
        return None
    a = r[1].get("aciertos")
    return a if isinstance(a, list) else None


def anotar_paso(agente, sesion, texto, paso=None, ts=None,
                raiz=None, token=None, tope=TOPE_S):
    """Un paso de una sesión de agente en SU cápsula del trimestre (MVD1027 §3).
    Con ts/paso explícitos es puro a efectos de la prueba"""
    t = ts if ts is not None else time.time()
    _paso = paso if paso is not None else int(t)
    nombre = nombre_capsula(agente, t)
    return poner(nombre, texto, titulo="Paso %s · %s" % (_paso, sesion),
                 uri=uri_paso(agente, sesion, _paso), ts=int(t),
                 raiz=raiz, token=token, tope=tope)


def buscar_recuerdos(agente, consulta, k=3, ts=None, raiz=None, token=None, tope=TOPE_S):
    """«Recuerdos de este agente»: lo que su cápsula responde de una consulta. None si no está."""
    return buscar(nombre_capsula(agente, ts), consulta, k=k,
                  raiz=raiz, token=token, tope=tope)