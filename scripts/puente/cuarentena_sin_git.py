#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aparta a cuarentena los .ts/.tsx SIN git de `src/` que no transpilan.

POR QUÉ EXISTE (2026-10-31 13:59). En el checkout vivo apareció
`src/app/mando/page.tsx` SIN git y con JSX inválido (dos hermanos en un `map` sin
fragmento). Como el envío al A1 lleva el árbol de trabajo, TODAS las builds —Mac y
A1— fallaron durante horas. Nadie lo veía en `git status` porque no estaba
versionado. Esto lo aparta a `~/.starseed/cuarentena/`, sin borrar nada.

  from cuarentena_sin_git import revisar
  revisar("/ruta/al/repo")
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
CUARENTENA = os.environ.get("STARSEED_CUARENTENA") or os.path.join(
    os.path.expanduser("~"), ".starseed", "cuarentena")
EXTENSIONES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
_CARGADORES = {".ts": "ts", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx", ".mjs": "jsx"}

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
)
_p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_p)


def candidatos(lineas):
    """PURA: de `git ls-files --others --exclude-standard -- src`, los que compila."""
    return [l.strip() for l in lineas if l.strip() and l.strip().endswith(EXTENSIONES)]


def transpila(raiz, ruta):
    """True si compila con esbuild, False si no, None si no hay esbuild."""
    binario = os.path.join(raiz, "node_modules", ".bin", "esbuild")
    if not os.path.exists(binario):
        return None
    cargador = _CARGADORES.get(os.path.splitext(ruta)[1].lower())
    if not cargador:
        return None
    orden = [binario, ruta, "--log-level=error", "--outfile=/dev/null",
             "--loader:%s=%s" % (os.path.splitext(ruta)[1].lower(), cargador)]
    try:
        hecho = subprocess.run(orden, cwd=raiz, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return hecho.returncode == 0


def _sin_git(raiz):
    """Las rutas de `src/` que git no conoce. Si git falla, no hay candidatos."""
    try:
        hecho = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", "src"],
            cwd=raiz, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return []
    if hecho.returncode != 0:
        return []
    return candidatos(hecho.stdout.splitlines())


def _avisar(movidos, destino):
    texto = ("Aparté a cuarentena %d archivo(s) de src/ SIN git que no transpilaban y "
             "rompían las builds: %s → %s" % (len(movidos), ", ".join(movidos), destino))
    try:
        _p.decir(texto, "reconstruir", "aviso")
    except Exception as e:
        print("cuarentena: aviso no enviado: %s: %s" % (type(e).__name__, e), flush=True)


def revisar(raiz=RAIZ, cuarentena=None):
    """Mueve a cuarentena lo que no transpila. Devuelve las rutas movidas."""
    base = cuarentena or CUARENTENA
    vivos = [r for r in _sin_git(raiz) if os.path.isfile(os.path.join(raiz, r))]
    if not vivos:
        return []
    destino = os.path.join(base, time.strftime("%Y%m%d-%H%M") + "-sin-git")
    movidos = []
    for ruta in vivos:
        if transpila(raiz, ruta) is not False:
            continue
        try:
            os.renames(os.path.join(raiz, ruta), os.path.join(destino, ruta))
        except OSError as e:
            print("cuarentena: no pude mover %s: %s" % (ruta, e), flush=True)
            continue
        movidos.append(ruta)
    if movidos:
        _avisar(movidos, destino)
    return movidos
