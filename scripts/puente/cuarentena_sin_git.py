#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cuarentena archivos sin git que no transpilan."""

import os
import subprocess
from datetime import datetime
import shutil

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")

def candidatos(lineas: str):
    ext = {".ts", ".tsx", ".js", ".jsx", ".mjs"}
    res = []
    for linea in lineas.splitlines():
        ruta = linea.strip()
        if not ruta:
            continue
        _, extencion = os.path.splitext(ruta)
        if extencion in ext:
            res.append(ruta)
    return res

def transpila(raiz, ruta):
    ruta_abs = os.path.join(raiz, ruta)
    try:
        proc = subprocess.run(
            ["node_modules/.bin/esbuild", ruta_abs, "--log-level=error", "--outfile=/dev/null"],
            cwd=raiz,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return proc.returncode == 0
    except FileNotFoundError:
        return None

def decir_puente(texto: str, quien: str, tipo: str):
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
        )
        puente = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(puente)
        puente.decir(texto, quien, tipo)
    except Exception:
        pass

def revisar(raiz):
    try:
        out = subprocess.check_output(
            ["git", "ls-files", "--others", "--exclude-standard", "--", "src"],
            cwd=raiz,
            text=True,
        )
    except subprocess.CalledProcessError:
        return
    
    cand = candidatos(out)
    cuota = os.path.expanduser("~/.starseed/cuarentena")
    hoy = datetime.now().strftime("%Y%m%d-%H%M")
    base = os.path.join(cuota, f"{hoy}-sin-git")
    os.makedirs(base, exist_ok=True)
    
    movidos = 0
    for ruta in cand:
        resultado = transpila(raiz, ruta)
        if resultado is False:
            origen = os.path.join(raiz, ruta)
            destino = os.path.join(base, ruta.lstrip("/"))
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            shutil.move(origen, destino)
            movidos += 1
    
    if movidos:
        decir_puente(f"cuarentena sin git: {movidos} archivos movidos", "reconstruir", "aviso")
