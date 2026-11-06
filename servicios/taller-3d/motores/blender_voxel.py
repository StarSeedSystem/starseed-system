#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Motor blender-voxel (WT1011Bb) · cierre de mallas por vóxeles en CPU, vale en la A1.

Blender sin ventana (-b) corre blender_voxel_blender.py: importa el GLB, remalla por
vóxeles según las caras objetivo del plan, comprueba que la malla queda cerrada
(bordes abiertos y no-manifold, como el «Check All» del 3D Print Toolbox) y, si el
destino lleva textura, vuelve a hornear el color con un UV nuevo. Quien llama
comprueba disponible(); la ficha es la común del taller: ok, glb, procedencia,
fallo, segundos, pico_memoria_gb (+ salud y extras).
"""
import json
import os
import re
import resource
import subprocess
import sys
import time
from typing import Any, Dict

COMANDO = "blender"
ESPERA_SEGUNDOS = 300
PROCEDENCIA = "blender-voxel"
RUTA_GUION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_voxel_blender.py")


def disponible() -> bool:
    """¿Hay un Blender de verdad en esta neurona? El binario y su versión; nada se descarga."""
    try:
        r = subprocess.run([COMANDO, "--version"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0 and re.search(r"Blender \d", r.stdout or "") is not None


def _pico_hijos() -> float:
    """Pico de RAM de los procesos hijos medido hasta ahora, en GB."""
    pico = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    return round(pico / (1024 ** 3 if sys.platform == "darwin" else 1024 ** 2), 2)


def remallar_voxel(entrada: str, caras: int, opciones: Dict[str, Any]) -> Dict[str, Any]:
    """Cierra la malla por vóxeles con Blender sin ventana y devuelve la ficha común.

    `caras` son las caras objetivo del plan (las de `remallado` en optimizacion).
    `opciones` acepta {"textura": bool} — nunca para «impresion», que sale sin
    texturas — y {"destino": str}; el resto de claves las guarda su plan, no aquí.
    """
    destino = str(opciones.get("destino") or "")
    con_textura = bool(opciones.get("textura", False)) and destino != "impresion"
    ficha: Dict[str, Any] = {"ok": False, "glb": None, "procedencia": PROCEDENCIA, "fallo": None,
                             "segundos": 0.0, "pico_memoria_gb": 0, "extras": [], "salud": None}
    salida = os.path.splitext(entrada)[0] + "-remallada.glb"
    orden = [COMANDO, "-b", "--python", RUTA_GUION, "--",
             json.dumps([entrada, salida, int(caras), con_textura, destino])]
    comienzo = time.monotonic()
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=ESPERA_SEGUNDOS)
    except subprocess.TimeoutExpired:
        ficha["fallo"] = "Timeout ejecutando Blender"
        ficha["segundos"] = round(time.monotonic() - comienzo, 2)
        return ficha
    except OSError as error:
        ficha["fallo"] = f"Blender falló: {error}"
        return ficha
    ficha["segundos"] = round(time.monotonic() - comienzo, 2)
    vuelta = (r.stderr or "") + (r.stdout or "")
    no_cerrada = re.search(r"MALLA_NO_CERRADA: (\{.*\})", vuelta)
    if no_cerrada:
        ficha["fallo"] = f"La malla no quedó cerrada: {no_cerrada.group(1).strip()}"
        return ficha
    if r.returncode != 0:
        ficha["fallo"] = f"Blender falló (código {r.returncode}): {vuelta.strip()[-400:] or 'sin salida'}"
        return ficha
    fichas = re.findall(r"FICHA: (\{.*\})", r.stdout)
    if "Tamaño de vóxel calculado:" not in r.stdout or not fichas:
        ficha["fallo"] = "Blender no remalló: el guion no reportó el tamaño de vóxel ni la ficha"
        return ficha
    if not os.path.exists(salida):
        ficha["fallo"] = f"Blender no dejó la malla cerrada en {salida}"
        return ficha
    datos = json.loads(fichas[-1])
    ficha.update(ok=True, glb=salida, extras=datos.get("extras", []),
                 salud=datos.get("salud"), pico_memoria_gb=_pico_hijos())
    return ficha