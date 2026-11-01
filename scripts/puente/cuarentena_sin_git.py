#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aparta a cuarentena el código SIN git que no compila, antes de construir.

POR QUÉ EXISTE (2026-10-31). `src/app/mando/page.tsx` apareció en el checkout vivo
SIN git y con JSX inválido (dos hermanos en un `map` sin fragmento). Nadie lo veía,
pero el envío al A1 lleva el árbol de trabajo ENTERO: todas las builds, Mac y A1,
fallaron horas por un archivo que no estaba en el repo. Lo que está sin git y no
transpila se MUEVE a `~/.starseed/cuarentena/`, nunca se borra, y se avisa.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
#: Se lee al llamar (no al importar) para que una prueba pueda usar un destino suyo.
CUARENTENA = "~/.starseed/cuarentena"
#: Lo que compila el build. Los `.d.ts` no generan salida y esbuild los rechaza.
EXTENSIONES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
LOADERS = {".ts": "ts", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx", ".mjs": "jsx"}

_puente = None


def _canal():
    """Carga `puente.py` sin depender del cwd, como hace guardia-memoria.py."""
    global _puente
    if _puente is None:
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
        spec = importlib.util.spec_from_file_location("puente", ruta)
        cargador = getattr(spec, "loader", None)
        assert spec is not None and cargador is not None
        _puente = importlib.util.module_from_spec(spec)
        cargador.exec_module(_puente)
    return _puente


def destino(ahora=None):
    """Carpeta de esta pasada: `~/.starseed/cuarentena/<AAAAMMDD-HHMM>-sin-git`."""
    base = os.environ.get("STARSEED_CUARENTENA") or CUARENTENA
    marca = time.strftime("%Y%m%d-%H%M", time.localtime(ahora))
    return os.path.join(os.path.expanduser(base), marca + "-sin-git")


def candidatos(lineas):
    """PURA: de `git ls-files --others --exclude-standard -- src`, qué se compila."""
    fuera = []
    for linea in lineas:
        ruta = (linea or "").strip()
        if not ruta:
            continue
        if os.path.splitext(ruta)[1].lower() in EXTENSIONES and ruta not in fuera:
            fuera.append(ruta)
    return fuera


def _esbuild(raiz):
    ruta = os.path.join(raiz, "node_modules", ".bin", "esbuild")
    return ruta if os.path.isfile(ruta) else None


def transpila(raiz, ruta):
    """True si esbuild la compila, False si no, None si no hay esbuild.

    Sin esbuild no se decide nada: no se aparta a ciegas lo que quizá esté bien.
    """
    binario = _esbuild(raiz)
    if not binario:
        return None
    extension = os.path.splitext(ruta)[1].lower()
    orden = [binario, os.path.join(raiz, ruta), "--log-level=error",
             "--outfile=" + os.devnull]
    if extension in LOADERS:
        orden.append("--loader:%s=%s" % (extension, LOADERS[extension]))
    try:
        salida = subprocess.run(orden, cwd=raiz, capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return False
    return salida.returncode == 0


def revisar(raiz=RAIZ):
    """Mueve a cuarentena cada candidato sin git que no transpila. Nunca borra."""
    try:
        salida = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", "src"],
            cwd=raiz, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return []
    if salida.returncode != 0:
        return []  # no es un repo git (o no hay `src`): no se aparta nada
    lista = candidatos(salida.stdout.splitlines())
    if not lista or not _esbuild(raiz):
        return []
    carpeta = destino()
    movidos = []
    for ruta in lista:
        if transpila(raiz, ruta) is not False:
            continue
        origen = os.path.join(raiz, ruta)
        apartado = os.path.join(carpeta, ruta)
        try:
            os.makedirs(os.path.dirname(apartado), exist_ok=True)
            os.renames(origen, apartado)
        except OSError:
            continue
        movidos.append(ruta)
    if movidos:
        _canal().decir(
            "Apartados a cuarentena %d archivo(s) sin git que no compilaban: %s "
            "(en %s)" % (len(movidos), ", ".join(movidos), carpeta),
            "reconstruir", "aviso")
    return movidos

