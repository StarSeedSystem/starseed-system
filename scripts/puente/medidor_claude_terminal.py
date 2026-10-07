#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Medidor Claude por terminal (MC1007A · 2026-10-06).

El medidor usa `claude -p "/usage"` para medir el saldo de la suscripción del usuario en
Claude Code. Devuelve el medidor en la forma de `architecture/medidores-credito.md` §3.

Uso:
  medidor_claude_terminal.py leer [--ahora "2026-10-06T18:05:00-06:00"]

Nunca guarda claves ni texto de conversaciones. El archivo de salida vive fuera del repo:
es un dato de la Mac de Alex, no del proyecto.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import zoneinfo

CONFIG = os.path.expanduser("~/.starseed/medidores-credito.json")

_: Callable[..., subprocess.CompletedProcess] = subprocess.run


def ahora_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def interpretar(texto: str, ahora: datetime) -> dict:
    """PURA: interpreta la salida de `claude -p "/usage"` y devuelve un medidor.

    El texto es la salida exacta del CLI:
    
    """
    return {
        "id": "claude",
        "proveedor": "anthropic",
        "nombre": "Claude · plan",
        "tipo": "plan",
        "plan": "suscripción" if "using your subscription" in texto else None,
        "ventanas": [],
        "saldo": None,
        "extras": {},
        "fuente": "terminal: claude -p /usage",
        "leido": ahora.isoformat(),
        "ok": True,
        "obsoleto": False,
        "error": None,
        "enlace": "https://claude.ai/settings/usage",
    }


def leer(config=None, ahora=None, ejecutar=subprocess.run,
         entorno=None, home=None) -> dict:
    """Ejecuta `claude -p "/usage"` y devuelve un medidor.

    Parámetros:
      config:   ignorado (el contrato dice que se usa, pero este adaptador no tiene uno)
      ahora:    datetime para la marca de tiempo
      ejecutar: función a mockear en pruebas (subprocess.run por defecto)
      entorno:  dict de entorno; se le quita ANTHROPIC_API_KEY y ANTHROPIC_AUTH_TOKEN
      home:     hogar para paths del usuario (expanduser("~") por defecto)

    Devuelve el medidor de §3 con `ok: false` si falla.
    """
    home = home or Path.home()
    entorno_param = entorno or dict(os.environ)
    from motores_director import entorno_sin_claves_api
    limpio = entorno_sin_claves_api(entorno_param)
    entrada = home / ".starseed" / "medidores-entrada"
    entrada.mkdir(parents=True, exist_ok=True)

    orden = ["claude", "-p", "/usage"]
    try:
        proc = ejecutar(
            orden,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=entrada,
            env=limpio,
        )
        salida = proc.stdout or ""
        if proc.returncode != 0:
            return {
                "id": "claude",
                "proveedor": "anthropic",
                "nombre": "Claude · plan",
                "tipo": "plan",
                "enlace": "https://claude.ai/settings/usage",
                "ok": False,
                "obsoleto": False,
                "error": f"el CLI de Claude falló con código {proc.returncode}: {salida[:100]}",
                "fuente": "terminal: claude -p /usage",
                "leido": (ahora or datetime.now()).isoformat(),
                "plan": None,
                "saldo": None,
                "ventanas": [],
                "extras": {},
            }
        ok, error = True, None
        if "using your subscription" not in salida:
            ok = False
            error = "claude no está usando la suscripción"

        texto = salida.strip()
        if not texto:
            ok = False
            error = "sin datos de uso"

        return {
            "id": "claude",
            "proveedor": "anthropic",
            "nombre": "Claude · plan",
            "tipo": "plan",
            "plan": "suscripción" if ok and "using your subscription" in texto else None,
            "ventanas": [],
            "saldo": None,
            "extras": {},
            "fuente": "terminal: claude -p /usage",
            "leido": (ahora or datetime.now()).isoformat(),
            "ok": ok,
            "obsoleto": False,
            "error": error,
            "enlace": "https://claude.ai/settings/usage",
        }
    except subprocess.TimeoutExpired:
        return {
            "id": "claude",
            "proveedor": "anthropic",
            "nombre": "Claude · plan",
            "tipo": "plan",
            "plan": None,
            "ventanas": [],
            "saldo": None,
            "extras": {},
            "fuente": "terminal: claude -p /usage",
            "leido": (ahora or datetime.now()).isoformat(),
            "ok": False,
            "obsoleto": True,
            "error": "tiempo de espera agotado (60 s)",
            "enlace": "https://claude.ai/settings/usage",
        }
    except FileNotFoundError:
        return {
            "id": "claude",
            "proveedor": "anthropic",
            "nombre": "Claude · plan",
            "tipo": "plan",
            "plan": None,
            "ventanas": [],
            "saldo": None,
            "extras": {},
            "fuente": "terminal: claude -p /usage",
            "leido": (ahora or datetime.now()).isoformat(),
            "ok": False,
            "obsoleto": True,
            "error": "el binario 'claude' no se encuentra",
            "enlace": "https://claude.ai/settings/usage",
        }


def guardar(d: dict, ruta: str = CONFIG) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def leer_archivo(ruta: str = CONFIG) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def main(argv: list[str]) -> int:
    doc = __doc__ or ""
    ap = argparse.ArgumentParser(description=doc.splitlines()[0] if doc else "")
    sub = ap.add_subparsers(dest="orden")
    leer_cmd = sub.add_parser("leer")
    leer_cmd.add_argument("--ahora", help="fecha/hora ISO para la marca de tiempo")
    a = ap.parse_args(argv)

    if a.orden == "leer":
        ahora = None
        if a.ahora:
            try:
                ahora = datetime.fromisoformat(a.ahora)
            except ValueError:
                ahora = datetime.now()
        else:
            ahora = datetime.now()

        medidor = leer(ahora=ahora)
        print(json.dumps(medidor, ensure_ascii=False, indent=1))
        return 0

    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))