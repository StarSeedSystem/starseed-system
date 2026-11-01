# -*- coding: utf-8 -*-
"""Aparta a cuarentena las fuentes SIN git que no transpilan (incidente del 31-10).

El 31-10 apareció en el checkout vivo un `src/app/mando/page.tsx` sin git y con
JSX inválido (dos hermanos en un `map` sin fragmento). El árbol de trabajo viaja
al A1 y también se compila en la Mac, así que todas las builds fallaron durante
horas. Aquí se MUEVE (nunca se borra) lo que esbuild no puede leer, antes de que
Next lo intente.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import time

EXTENSIONES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
CUARENTENA = os.path.expanduser("~/.starseed/cuarentena")

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
)
_p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_p)


def candidatos(lineas):
    """PURA: de la salida de `git ls-files --others --exclude-standard -- src`,
    deja solo las fuentes que esbuild sabe leer."""
    if isinstance(lineas, str):
        lineas = lineas.splitlines()
    fuera = []
    for linea in lineas or ():
        ruta = (linea or "").strip()
        if ruta and os.path.splitext(ruta)[1].lower() in EXTENSIONES:
            fuera.append(ruta)
    return fuera


def _esbuild(raiz):
    """Ruta al esbuild del repo, o None si no está instalado."""
    ruta = os.path.join(raiz, "node_modules", ".bin", "esbuild")
    if os.path.isfile(ruta) and os.access(ruta, os.X_OK):
        return ruta
    return None


def transpila(raiz, ruta):
    """True si esbuild lo lee; False si no; None si no hay esbuild (no se decide).

    Sin `--bundle`: solo se parsea el archivo, con el loader que toca por su
    extensión (.tsx lee JSX). Si esbuild ni arranca, tampoco se decide: mover una
    fuente buena sería peor que dejarla para la siguiente pasada.
    """
    binario = _esbuild(raiz)
    if binario is None:
        return None
    orden = [binario, os.path.join(raiz, ruta), "--log-level=error", "--outfile=/dev/null"]
    try:
        hecho = subprocess.run(
            orden, cwd=raiz, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return hecho.returncode == 0


def _estampa(ahora=None):
    return time.strftime("%Y%m%d-%H%M", time.localtime(time.time() if ahora is None else ahora))


def revisar(raiz, cuarentena=CUARENTENA, ahora=None):
    """Mueve a cuarentena cada fuente sin git que esbuild no puede leer.

    Devuelve las rutas movidas. Si no hay esbuild no mueve nada: no se decide.
    """
    if _esbuild(raiz) is None:
        return []
    try:
        salida = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", "src"],
            cwd=raiz, capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if salida.returncode != 0:
        return []
    destino_base = os.path.join(cuarentena, _estampa(ahora) + "-sin-git")
    movidos = []
    for ruta in candidatos(salida.stdout):
        if transpila(raiz, ruta) is not False:
            continue
        destino = os.path.join(destino_base, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        os.renames(os.path.join(raiz, ruta), destino)
        movidos.append(ruta)
        _p.decir(
            "Apartado a cuarentena %s: está SIN git y no transpila (tumbaba la build). "
            "Se movió a %s, no se borró." % (ruta, destino),
            "reconstruir",
            "aviso",
        )
    return movidos
