# -*- coding: utf-8 -*-
"""LNN1028G · cliente del recuerdo semántico LEANN (contrato architecture/leann-recuerdo-semantico.md §3).

Habla con `leann_servidor.py` en 127.0.0.1:4495 (en el A1 o por el túnel de MetaGenesis en la Mac,
que reenvía el mismo puerto) con el token de `~/.starseed/leann.token` en la cabecera
`X-StarSeed-Token`. Solo `urllib`, 2 s de tope y `None` si no está: sin servidor, el recuerdo sigue
con Memvid y nada falla. Solo LEE el token (jamás lo crea) y nunca revela claves ni rutas del disco.
    buscar("repo-starseed", "contrato de salas y rango", k=8) → aciertos o None
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

import leann_servidor as SERVIDOR

PUERTO_DEFECTO, TOPE_SEGUNDOS = 4495, 2.0
TOKEN_DEFECTO = os.path.expanduser("~/.starseed/leann.token")
INDICE_REPO = "repo-starseed"
_RANGOS = ("desde", "hasta")


def leer_token(ruta=TOKEN_DEFECTO):
    """El token si el archivo existe; None si no (el cliente jamás incuba tokens)."""
    try:
        with open(ruta, encoding="utf-8") as fichero:
            return fichero.read().strip() or None
    except OSError:
        return None


def puerto_de(puerto):
    """El puerto: el dado, si no el del entorno, si no el 4495 del A1 o del túnel."""
    return int(puerto) if puerto is not None else int(os.environ.get("STARSEED_LEANN_PUERTO") or PUERTO_DEFECTO)


def peticion(indice, consulta, k=8, filtros=None, puerto=None, token=""):
    """La petición POST completa, PURA: URL (solo 127.0.0.1, §6), cuerpo JSON y cabeceras."""
    datos = {"consulta": consulta, "k": int(k)}
    if filtros is not None:
        datos["filtros"] = filtros
    return urllib.request.Request(
        "http://127.0.0.1:%d/indices/%s/buscar" % (puerto_de(puerto), urllib.parse.quote(indice)),
        data=json.dumps(datos).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-StarSeed-Token": token or ""},
        method="POST",
    )


def aciertos_de(cuerpo):
    """PURA. La respuesta → lista de {id, puntuacion, texto, metadatos}; vacía si no es lo esperado."""
    try:
        datos = json.loads(cuerpo.decode("utf-8") if isinstance(cuerpo, (bytes, bytearray)) else cuerpo)
    except (ValueError, AttributeError, UnicodeDecodeError):
        return []
    if not isinstance(datos, list):
        return []
    salida = []
    for a in datos:
        if not isinstance(a, dict) or not isinstance(a.get("texto"), str):
            continue
        metadatos = a.get("metadatos")
        salida.append({
            "id": str(a.get("id") or ""),
            "puntuacion": a.get("puntuacion"),
            "texto": a["texto"],
            "metadatos": metadatos if isinstance(metadatos, dict) else {},
        })
    return salida


def rutas_de_aciertos(aciertos, existe, limite=8):
    """PURA. Rutas de los aciertos, únicas, con su rango de líneas, como mucho `limite` y solo las
    que existen en el árbol (`existe`); fuera absolutas, «..», vacíos y comillas (no se confía)."""
    salida, vistas = [], set()
    for a in aciertos or ():
        if len(salida) >= limite:
            break
        if not isinstance(a, dict):
            continue
        metadatos = a.get("metadatos")
        if not isinstance(metadatos, dict):
            continue
        ruta = metadatos.get("ruta")
        if not isinstance(ruta, str) or ruta in vistas:
            continue
        partes = ruta.split("/")
        if (not ruta or ruta.startswith("/") or "\\" in ruta
                or ".." in partes or any(not p for p in partes)
                or any(c in ruta for c in "\"' \n\t")):
            continue
        if not existe(ruta):
            continue
        vistas.add(ruta)
        rango = {c: int(metadatos[c]) for c in _RANGOS
                 if isinstance(metadatos.get(c), int) and not isinstance(metadatos.get(c), bool)}
        salida.append({"ruta": ruta, "desde": rango.get("desde"), "hasta": rango.get("hasta")})
    return salida


def buscar(indice, consulta, k=8, filtros=None, puerto=None, token=None, tope=TOPE_SEGUNDOS):
    """Buscar en el servidor del A1; aciertos, o `None` si no está, se pasa del tope (2 s),
    rechaza la petición o no contesta 200. Una sola petición, sin reintentos (nada de bucles)."""
    if not SERVIDOR.nombre_valido(indice):
        return None
    consulta = (consulta or "").strip()
    if not consulta or int(k) < 1:
        return None
    token = token if token is not None else leer_token()
    if not token:
        return None
    try:
        with urllib.request.urlopen(peticion(indice, consulta, k, filtros, puerto=puerto, token=token),
                                    timeout=tope) as respuesta:
            if respuesta.status != 200:
                return None
            return aciertos_de(respuesta.read())
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError):
        return None
