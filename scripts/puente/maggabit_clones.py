# -*- coding: utf-8 -*-
"""Versiones diarias del Maggabit (MAG1117): un clon APFS por día.

La decisión es PURA (`plan`). La E/S vive en una capa fina y es toda
inyectable: reloj, subprocess, listado y borrado. Con el volumen ausente no se
espera ni se falla; ningún clon borra en el origen y todo subprocess lleva
timeout: si el volumen no responde se devuelve «sin-respuesta», nunca se
cuelga.
"""
from __future__ import annotations

import datetime as dt
import os
import shutil
import subprocess
from typing import Callable, Iterable, Optional

DIARIOS = 14
SEMANAS = 8
FORMATO = "%Y-%m-%d"
TIMEOUT_S = 120.0

LISTO = "listo"
AUSENTE = "ausente"
SIN_RESPUESTA = "sin-respuesta"
HECHO = "hecho"
ERROR = "error"


def _fecha(nombre: str) -> Optional[dt.date]:
    """Convierte un nombre AAAA-MM-DD exacto en fecha; cualquier otra cosa, None."""
    try:
        fecha = dt.datetime.strptime(nombre, FORMATO).date()
    except (TypeError, ValueError):
        return None
    return fecha if fecha.strftime(FORMATO) == nombre else None


def plan(hoy: dt.date, existentes: Iterable[str]) -> dict:
    """Decide qué clon crear y qué versiones podar.

    Se conservan los 14 diarios más recientes y, de los anteriores, el más
    antiguo de cada semana ISO, como mucho las 8 semanas más recientes. Un
    nombre que no sea una fecha válida no se toca jamás.
    """
    validas = {}
    for nombre in existentes:
        fecha = _fecha(nombre)
        if fecha is not None:
            validas[fecha] = nombre

    crear = None if hoy in validas else hoy.strftime(FORMATO)
    todas = sorted(set(validas) | {hoy}, reverse=True)
    conservar = set(todas[:DIARIOS]) | {hoy}

    por_semana = {}
    for fecha in todas[DIARIOS:]:
        semana = tuple(fecha.isocalendar()[:2])
        if semana not in por_semana or fecha < por_semana[semana]:
            por_semana[semana] = fecha
    for semana in sorted(por_semana, reverse=True)[:SEMANAS]:
        conservar.add(por_semana[semana])

    podar = sorted(
        nombre for fecha, nombre in validas.items() if fecha not in conservar
    )
    return {"crear": crear, "podar": podar}


def raiz_versiones(trabajo: str) -> str:
    """Carpeta TRABAJO/versiones: única que este módulo puede podar."""
    return os.path.join(trabajo, "versiones")


def origen(trabajo: str) -> str:
    """TRABAJO/respaldo/desarrollo: solo se lee, nunca se modifica."""
    return os.path.join(trabajo, "respaldo", "desarrollo")


def destino(trabajo: str, nombre: str) -> str:
    return os.path.join(raiz_versiones(trabajo), nombre)


def estado_volumen(
    trabajo: str, ismount: Callable[[str], bool] = os.path.ismount
) -> str:
    """LISTO solo si TRABAJO es un volumen montado; si no, AUSENTE."""
    try:
        return LISTO if ismount(trabajo) else AUSENTE
    except OSError:
        return AUSENTE


def leer_versiones(
    trabajo: str, listar: Callable[[str], list] = os.listdir
) -> list:
    """Nombres presentes en versiones/; si el volumen falla, lista vacía."""
    try:
        return sorted(listar(raiz_versiones(trabajo)))
    except OSError:
        return []


def clonar(
    trabajo: str,
    nombre: str,
    ejecutar: Callable[..., object] = subprocess.run,
    crear_carpeta: Callable[[str], object] = lambda ruta: os.makedirs(ruta, exist_ok=True),
    timeout: float = TIMEOUT_S,
) -> dict:
    """Clona con `cp -cR` (APFS: no ocupa espacio hasta que algo cambia)."""
    try:
        crear_carpeta(raiz_versiones(trabajo))
    except OSError as fallo:
        return {"estado": ERROR, "detalle": str(fallo)}
    orden = ["cp", "-cR", origen(trabajo), destino(trabajo, nombre)]
    try:
        hecho = ejecutar(orden, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"estado": SIN_RESPUESTA, "detalle": "el volumen no responde"}
    except OSError as fallo:
        return {"estado": ERROR, "detalle": str(fallo)}
    codigo = getattr(hecho, "returncode", 0)
    if codigo:
        detalle = (getattr(hecho, "stderr", "") or "").strip()
        return {"estado": ERROR, "detalle": detalle or "cp devolvió %s" % codigo}
    return {"estado": HECHO, "detalle": destino(trabajo, nombre)}


def podar(
    trabajo: str,
    nombres: Iterable[str],
    borrar: Callable[[str], object] = shutil.rmtree,
    es_directorio: Callable[[str], bool] = os.path.isdir,
) -> dict:
    """Elimina solo versiones fechadas dentro de versiones/; nunca el origen."""
    borrados = []
    errores = []
    base = raiz_versiones(trabajo)
    for nombre in nombres:
        if _fecha(nombre) is None:
            continue
        ruta = os.path.join(base, nombre)
        if not es_directorio(ruta):
            continue
        try:
            borrar(ruta)
            borrados.append(nombre)
        except OSError as fallo:
            errores.append("%s: %s" % (nombre, fallo))
    return {"borrados": borrados, "errores": errores}


def ejecutar_dia(
    trabajo: str,
    hoy: Optional[dt.date] = None,
    *,
    ismount: Callable[[str], bool] = os.path.ismount,
    listar: Callable[[str], list] = os.listdir,
    ejecutar: Callable[..., object] = subprocess.run,
    crear_carpeta: Callable[[str], object] = lambda ruta: os.makedirs(ruta, exist_ok=True),
    borrar: Callable[[str], object] = shutil.rmtree,
    es_directorio: Callable[[str], bool] = os.path.isdir,
) -> dict:
    """Un día de versiones: ausente no falla ni espera; presente copia y poda."""
    if estado_volumen(trabajo, ismount) != LISTO:
        return {"estado": AUSENTE, "crear": None, "clon": None, "podar": []}

    hoy = hoy or dt.date.today()
    decision = plan(hoy, leer_versiones(trabajo, listar))

    clon = None
    if decision["crear"]:
        clon = clonar(trabajo, decision["crear"], ejecutar, crear_carpeta)
        if clon["estado"] != HECHO:
            return {
                "estado": clon["estado"],
                "crear": decision["crear"],
                "clon": clon,
                "podar": [],
            }

    poda = podar(trabajo, decision["podar"], borrar, es_directorio)
    return {
        "estado": HECHO,
        "crear": decision["crear"],
        "clon": clon,
        "podar": poda["borrados"],
        "errores": poda["errores"],
    }
