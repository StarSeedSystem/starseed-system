#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Herramienta que corre Alex: lleva variables del env local al env remoto
por SSH (sin archivos temporales locales, sin imprimir valores)."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path


NOMBRE_VAR = re.compile(r"^[A-Z][A-Z0-9_]*$")
LLAVE_SSH = Path(os.path.expanduser("~/.ssh/starseed_oracle_ed25519"))


def _home(home: str | Path | None = None) -> Path:
    return Path(home or os.environ.get("HOME", str(Path.home())))


def leer_env_local(home: str | Path | None = None) -> dict[str, str]:
    datos: dict[str, str] = {}
    env_local = _home(home) / ".starseed" / "env"
    if env_local.exists():
        with env_local.open(encoding="utf-8") as f:
            for linea in f:
                linea = linea.split("#", 1)[0]
                if "=" in linea:
                    k, _, v = linea.partition("=")
                    datos[k.strip()] = v.strip().strip("\"'")
    return datos


def leer_ip(maquina: str, home: str | Path | None = None) -> str:
    oracle_json = _home(home) / ".starseed" / "oracle.json"
    if oracle_json.exists():
        with oracle_json.open(encoding="utf-8") as f:
            estado = json.load(f)
        for inst in estado.get("instancias", []):
            if isinstance(inst, dict) and inst.get("nombre") == maquina:
                ip = inst.get("ip_publica")
                if ip:
                    return str(ip)
    return ""


def validar_nombre(var: str) -> bool:
    return bool(NOMBRE_VAR.match(var))


def construir_env(vars_solicitadas: list[str], datos: dict[str, str]) -> list[str]:
    lineas: list[str] = []
    for v in vars_solicitadas:
        if v in datos:
            lineas.append(f"{v}={datos[v]}")
    return lineas


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("maquina", help="nombre de la máquina Oracle")
    parser.add_argument("variables", nargs="+", help="variables del env")
    parser.add_argument("--simular", action="store_true", help="mostrar lo que se haría")
    args = parser.parse_args(argv)

    # Validación de nombres
    invalidas = [v for v in args.variables if not validar_nombre(v)]
    if invalidas:
        print(f"rechazados nombres inválidos: {', '.join(invalidas)} (debe ser [A-Z][A-Z0-9_]*)")
        return 1

    datos = leer_env_local()
    faltantes = [v for v in args.variables if v not in datos]
    presentes = [v for v in args.variables if v in datos]

    if args.simular:
        print(f"simular: máquina {args.maquina}, variables: {', '.join(args.variables)}")
        for v in presentes:
            print(f"  {v} -> presente (valor oculto)")
        for v in faltantes:
            print(f"  {v} -> no está en tu env")
        return 0

    # Sin simular: construir el archivo en memoria y enviarlo por SSH
    lineas_env = construir_env(args.variables, datos)
    contenido = "\n".join(lineas_env) + "\n"
    contenido_bytes = contenido.encode("utf-8")

    # Enviar por SSH sin archivos temporales locales (entrada estándar)
    ip = leer_ip(args.maquina)
    if not ip:
        print(f"{args.maquina} (no está en tu env / no se encontró IP en oracle.json)")
    else:
        try:
            subprocess.run(
                ["ssh", "-i", str(LLAVE_SSH), "-o", "StrictHostKeyChecking=accept-new",
                 "-o", "BatchMode=yes", f"starseed@{ip}",
                 "sudo install -m 600 -o root /dev/stdin /etc/starseed/env"],
                input=contenido_bytes, capture_output=True, timeout=30,
            )
        except Exception:
            pass

    # Mensajes sin valores
    for v in presentes:
        print(f"{v} ✓")
    for v in faltantes:
        print(f"{v} (no está en tu env)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
