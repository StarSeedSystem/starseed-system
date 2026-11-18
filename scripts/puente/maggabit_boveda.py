#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Maggabit · bóveda cifrada de claves (MAG1117).

La decisión es PURA (`plan`, `motivo`, `ordenes`, `registro`); la E/S es fina y
tiene todo inyectable (subprocess, recorrido y lectura de disco). La imagen APFS
cifrada la crea y la abre Alex: este módulo nunca pide, lee ni recibe la
contraseña ni abre un diálogo. Con la bóveda cerrada o sin crear no se copia
nada (principio 0); todo subprocess lleva timeout y un volumen mudo se informa
«sin-respuesta». Nunca se borra en el origen y el registro guarda solo rutas y
tamaños, jamás contenido. `.credentials.json` no se copia a ningún sitio.
"""
from __future__ import annotations

import fnmatch
import glob
import os
import subprocess

BOVEDA = "/Volumes/MaggabitBoveda"
CARPETA_CLAVES = "claves"
ARCHIVO_REGISTRO = "registro.json"
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LISTA = os.path.join(RAIZ, "config", "respaldo-exclusiones.txt")
HOME = os.path.expanduser("~")
FUENTES = ("~/.starseed/env", "~/.starseed/env.*", "~/.hermes", "~/.astraura", "~/.oci")
TIEMPO_S = 1800
VEDADOS = (".credentials.json", "credentials.json")
SECCIONES = ("REGENERABLE", "ARBOLES", "CLAVES")


def _texto(valor):
    """Texto limpio o cadena vacía."""
    return valor.strip() if isinstance(valor, str) else ""


def es_credencial_vedada(nombre):
    """PURA. ¿El nombre es una credencial que no se copia a ningún sitio?"""
    n = os.path.basename(_texto(nombre)).lower()
    return n in VEDADOS or n.endswith(".credentials.json")


def patrones_claves(texto):
    """PURA. Patrones y excepciones «!» de la sección CLAVES de la lista única."""
    patrones, excepciones, actual = [], [], None
    for linea in (texto or "").splitlines():
        limpia = linea.strip()
        if not limpia:
            continue
        if limpia.startswith("#"):
            hallada = next((s for s in SECCIONES if s in limpia.upper()), None)
            if hallada:
                actual = hallada
        elif actual == "CLAVES":
            (excepciones if limpia.startswith("!") else patrones).append(limpia.lstrip("!"))
    return patrones, excepciones


def coincide_clave(nombre, patrones, excepciones=()):
    """PURA. ¿El nombre es una clave de la lista, fuera de las excepciones «!»?"""
    nombre = os.path.basename(_texto(nombre))
    if es_credencial_vedada(nombre):
        return False
    if any(fnmatch.fnmatch(nombre, p) for p in excepciones or ()):
        return False
    return any(fnmatch.fnmatch(nombre, p) for p in patrones or ())


def ruta_relativa(fuente, home=None):
    """PURA. Ruta de la fuente relativa al home (`~/.starseed/env` → `.starseed/env`)."""
    home = _texto(home) or HOME
    ruta = _texto(fuente).replace("\\", "/")
    if ruta.startswith("~/"):
        ruta = ruta[2:]
    elif ruta.startswith("/"):
        partes = ruta.lstrip("/").split("/")
        base = home.rstrip("/") + "/"
        if ruta.startswith(base):
            ruta = ruta[len(base):]
        elif len(partes) >= 3 and partes[0] in ("Users", "home"):
            ruta = "/".join(partes[2:])
        else:
            return ""
    ruta = os.path.normpath(ruta).replace("\\", "/")
    if not ruta or ruta in (".", "..") or ruta.startswith("../") or os.path.isabs(ruta):
        return ""
    return ruta


def motivo(estado):
    """PURA. Motivo por el que `plan` no ordena nada cuando la bóveda no está abierta."""
    estado = _texto(estado).lower()
    if estado == "abierta":
        return ""
    if estado == "cerrada":
        return "bóveda cerrada: no se copia nada"
    if estado == "sin-crear":
        return "bóveda sin crear: no se copia nada"
    return "bóveda %s: no se copia nada" % (estado or "desconocida")


def plan(boveda_estado, fuentes_existentes):
    """PURA. Órdenes de copia a `claves/`, conservando la ruta relativa al home."""
    if _texto(boveda_estado).lower() != "abierta":
        return []
    vistas, ordenadas = set(), []
    for fuente in fuentes_existentes or []:
        relativa = ruta_relativa(fuente)
        if not relativa or relativa in vistas or es_credencial_vedada(relativa):
            continue
        vistas.add(relativa)
        ordenadas.append({"accion": "copiar", "origen": "~/" + relativa,
                          "relativa": relativa, "destino": CARPETA_CLAVES + "/" + relativa})
    return sorted(ordenadas, key=lambda o: o["relativa"])


def ordenes(plan, base=None):
    """PURA. `rsync -a` de cada fuente a su ruta bajo `claves/` en la bóveda."""
    raiz = os.path.join(_texto(base) or BOVEDA, CARPETA_CLAVES)
    return [["rsync", "-a", os.path.join(HOME, o["relativa"]),
             os.path.join(raiz, o["relativa"])]
            for o in plan or []
            if o.get("accion") == "copiar" and not es_credencial_vedada(o.get("relativa"))]


def registro(plan, base=None, medir=None):
    """PURA. Filas de registro: solo la ruta relativa y sus bytes, nunca el contenido."""
    medir = medir or os.path.getsize
    raiz = os.path.join(_texto(base) or BOVEDA, CARPETA_CLAVES)
    filas = []
    for o in plan or []:
        if o.get("accion") != "copiar" or es_credencial_vedada(o.get("relativa")):
            continue
        try:
            bytes_ = int(medir(os.path.join(raiz, o["relativa"])))
        except (OSError, TypeError, ValueError):
            bytes_ = 0
        filas.append({"ruta": o["relativa"], "bytes": bytes_})
    return filas


def _leer(ruta):
    with open(ruta, encoding="utf-8") as archivo:
        return archivo.read()


def fuentes_existentes(home=None, existe=None, es_dir=None, globo=None, recorrer=None, leer=None):
    """E/S fina. Fuentes que existen ahora: FUENTES y la sección CLAVES bajo ~/Documents."""
    home = _texto(home) or HOME
    existe = existe or os.path.exists
    es_dir = es_dir or os.path.isdir
    globo = globo or glob.glob
    recorrer = recorrer or os.walk
    leer = leer or _leer
    halladas = []

    def agregar(ruta):
        if es_dir(ruta):
            for carpeta, _dirs, nombres in recorrer(ruta):
                halladas.extend(os.path.join(carpeta, n) for n in nombres)
        elif existe(ruta):
            halladas.append(ruta)

    for fuente in FUENTES:
        ruta = os.path.join(home, fuente[2:])
        if any(c in fuente for c in "*?["):
            for hallada in globo(ruta):
                agregar(hallada)
        else:
            agregar(ruta)
    try:
        patrones, excepciones = patrones_claves(leer(LISTA))
    except OSError:
        patrones, excepciones = [], []
    documentos = os.path.join(home, "Documents")
    if es_dir(documentos):
        for carpeta, _dirs, nombres in recorrer(documentos):
            for nombre in nombres:
                if coincide_clave(nombre, patrones, excepciones):
                    halladas.append(os.path.join(carpeta, nombre))
    vistas = set()
    for ruta in halladas:
        relativa = ruta_relativa(ruta, home=home)
        if relativa and not es_credencial_vedada(relativa):
            vistas.add(relativa)
    return sorted("~/" + relativa for relativa in vistas)


def copiar(plan, base=None, existe=None, crear=None, correr=None):
    """E/S fina. Ejecuta el plan con timeout; bóveda ausente o cerrada no esperan."""
    if not plan:
        return {"estado": "sin-trabajo", "aplicadas": [], "registro": []}
    base = _texto(base) or BOVEDA
    existe = existe or os.path.isdir
    crear = crear or os.makedirs
    correr = correr or subprocess.run
    if not existe(base):
        return {"estado": "sin-disco", "aplicadas": [], "registro": []}
    try:
        crear(os.path.join(base, CARPETA_CLAVES), exist_ok=True)
    except OSError:
        return {"estado": "sin-disco", "aplicadas": [], "registro": []}
    aplicadas = []
    for argv in ordenes(plan, base=base):
        try:
            hecho = correr(argv, capture_output=True, text=True, timeout=TIEMPO_S)
        except subprocess.TimeoutExpired:
            return {"estado": "sin-respuesta", "aplicadas": aplicadas, "registro": []}
        except OSError:
            return {"estado": "sin-rsync", "aplicadas": aplicadas, "registro": []}
        if getattr(hecho, "returncode", 0) != 0:
            return {"estado": "fallo", "aplicadas": aplicadas, "registro": []}
        aplicadas.append(argv[-1])
    return {"estado": "copiado", "aplicadas": aplicadas,
            "registro": registro(plan, base=base)}
