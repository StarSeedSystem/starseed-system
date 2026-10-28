#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(2026-10-27) Colibri en las capas de Astraura: qué modelos caben en cada neurona y cómo se instalarían.

PURO salvo `main`: `caben` y `plan_instalacion` no leen disco ni red; `main --plan` solo mide esta máquina
e imprime las órdenes, sin ejecutarlas ni descargar nada. Contrato: `architecture/colibri-multicapas.md`.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

REPO = "https://github.com/JustVugg/colibri.git"
ETIQUETA = "v2.0.0"
HOST = "127.0.0.1"
PUERTO = 4480
CONFIG = Path(__file__).resolve().parents[2] / "config" / "capas-colibri-1027.json"
CABE, STREAMING, NO_CABE = "cabe", "cabe en streaming (disco rápido)", "no cabe"


def _veredicto(entrada: Dict[str, Any], ram_gb: float, disco_libre_gb: float,
               presion_alta: bool) -> Dict[str, Any]:
    disco = float(entrada.get("descarga_gb") or entrada.get("disco_gb") or 0.0)
    ram_min = float(entrada.get("ram_min_gb") or 0.0)
    ram_ok = float(entrada.get("ram_ok_gb") or ram_min)
    fila = {"id": str(entrada.get("id") or "")}
    if presion_alta:
        veredicto, motivo = NO_CABE, "presión de memoria alta: no hay RAM libre con margen"
    elif disco_libre_gb < disco:
        veredicto, motivo = NO_CABE, f"disco: {disco_libre_gb:.1f} GB libres < {disco:.1f} GB que pide la instalación"
    elif ram_gb < ram_min:
        veredicto, motivo = NO_CABE, f"RAM: {ram_gb:.1f} GB < mínimo {ram_min:.1f} GB"
    elif ram_gb < ram_ok:
        veredicto, motivo = STREAMING, f"RAM: {ram_gb:.1f} GB < recomendada {ram_ok:.1f} GB; lee los expertos del disco"
    else:
        veredicto, motivo = CABE, f"RAM: {ram_gb:.1f} GB ≥ {ram_ok:.1f} GB y disco: {disco_libre_gb:.1f} GB ≥ {disco:.1f} GB"
    return {**fila, "veredicto": veredicto, "motivo": motivo}


def caben(entradas: Iterable[Dict[str, Any]], ram_gb: float, disco_libre_gb: float,
          presion_alta: bool = False) -> List[Dict[str, Any]]:
    """PURA. Un veredicto por entrada del catálogo, con su porqué. No toca disco ni red."""
    return [_veredicto(e, float(ram_gb), float(disco_libre_gb), bool(presion_alta))
            for e in entradas if isinstance(e, dict)]


def plan_instalacion(id_modelo: str, carpeta: str) -> List[Dict[str, Any]]:
    """PURA. Órdenes para clonar v2.0.0, instalar ese modelo y servirlo; no se ejecuta nada.

    Cada orden es `{"paso", "cmd", "cwd"}` y `cmd` es una lista de argumentos, sin shell.
    """
    if not id_modelo or not carpeta:
        raise ValueError("hacen falta el id del modelo y la carpeta de instalación")
    return [
        {"paso": "clonar", "cwd": None, "cmd": ["git", "clone", "--depth", "1", "--branch", ETIQUETA, REPO, carpeta]},
        {"paso": "instalar", "cwd": carpeta, "cmd": ["bash", "./start-here.sh", "--model", id_modelo, "--dir", carpeta, "--yes", "--no-gpu"]},
        {"paso": "servir", "cwd": carpeta, "cmd": ["./coli", "serve", "--model", carpeta, "--host", HOST, "--port", str(PUERTO)]},
    ]


def _recursos(carpeta: str) -> Tuple[float, float, bool]:
    """RAM total, GB libres y presión de memoria de esta máquina. Solo lo llama `main`."""
    ram = libre = 0.0
    try:
        campos = dict(re.findall(r"^(\w+):\s+(\d+)", Path("/proc/meminfo").read_text(encoding="utf-8"), re.M))
        ram = float(campos.get("MemTotal", 0)) / 1048576
        libre = float(campos.get("MemAvailable", campos.get("MemFree", 0))) / 1048576
    except OSError:
        if platform.system() == "Darwin":
            try:
                ram = float(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True)) / 1073741824
                libre = ram
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
    destino = Path(carpeta).expanduser()
    while not destino.exists() and destino.parent != destino:
        destino = destino.parent
    try:
        disco = shutil.disk_usage(destino).free / 1073741824
    except OSError:
        disco = 0.0
    return ram, disco, bool(ram and libre / ram < 0.10)


def main(argv: Optional[Sequence[str]] = None) -> None:
    p = argparse.ArgumentParser(description="Colibri en las capas de Astraura: qué cabe y cómo se instalaría.")
    p.add_argument("--plan", action="store_true", help="imprime las órdenes de esta máquina, sin ejecutarlas")
    p.add_argument("--ram", type=float, help="GB de RAM (por defecto se miden)")
    p.add_argument("--disco", type=float, help="GB libres (por defecto se miden)")
    p.add_argument("--presion", action="store_true", help="da la memoria por saturada")
    p.add_argument("--carpeta", default=os.environ.get("STARSEED_COLIBRI_DIR") or os.path.join(os.path.expanduser("~"), ".starseed", "colibri"))
    args = p.parse_args(argv)
    ram, disco, presion = _recursos(args.carpeta)
    ram = args.ram if args.ram is not None else ram
    disco = args.disco if args.disco is not None else disco
    presion = args.presion or presion
    with CONFIG.open(encoding="utf-8") as f:
        datos = json.load(f)
    filas = caben(datos.get("entradas", []) if isinstance(datos, dict) else [], ram, disco, presion)
    print(f"Colibri · esta máquina: {ram:.1f} GB de RAM y {disco:.1f} GB libres{' · presión alta' if presion else ''}")
    for fila in filas:
        print(f"  {fila['id']:<32} {fila['veredicto']:<36} {fila['motivo']}")
    if args.plan:
        for fila in filas:
            if fila["veredicto"] != NO_CABE:
                print(f"\nPlan de {fila['id']} ({fila['veredicto']}):")
                for orden in plan_instalacion(fila["id"], args.carpeta):
                    print(f"  · {' '.join(orden['cmd'])}" + (f"   [en {orden['cwd']}]" if orden["cwd"] else ""))
        print("\nNada se ha ejecutado ni descargado: estas son las órdenes para cuando Alex lo apruebe.")


if __name__ == "__main__":
    raise SystemExit(main())
