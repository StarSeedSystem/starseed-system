#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Oracle Always Free: entrega de claves por SSH a cada máquina."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Regla del contrato: nombres solo [A-Z][A-Z0-9_]+
_NOMBRE_VALIDO = re.compile(r"^[A-Z][A-Z0-9_]*$")
ENV_LOCAL = Path.home() / ".starseed/env"
ORACLE_JSON = Path.home() / ".starseed/oracle.json"
SSH_KEY_PATH = Path.home() / ".ssh/starseed_oracle_ed25519"

def _leer_env_local() -> dict[str, str]:
    resultado: dict[str, str] = {}
    if not ENV_LOCAL.exists():
        return resultado
    with ENV_LOCAL.open(encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            clave = clave.strip()
            valor = valor.strip()
            if (valor.startswith('"') and valor.endswith('"')) or \
               (valor.startswith("'") and valor.endswith("'")):
                valor = valor[1:-1]
            resultado[clave] = valor
    return resultado

def _leer_oracle_ip() -> str | None:
    if not ORACLE_JSON.exists():
        return None
    try:
        with ORACLE_JSON.open(encoding="utf-8") as f:
            datos = json.load(f)
        instancias = datos.get("instancias", []) if isinstance(datos, dict) else []
        for i in instancias:
            if isinstance(i, dict) and i.get("nombre") == "starseed-a1":
                ip = i.get("ip_publica")
                if ip:
                    return str(ip)
        for i in instancias:
            if isinstance(i, dict) and i.get("ip_publica"):
                return str(i["ip_publica"])
    except (OSError, json.JSONDecodeError):
        pass


def validar_nombres(vars_solicitadas: list[str]) -> list[str]:
    errores = []
    for v in vars_solicitadas:
        if not _NOMBRE_VALIDO.match(v):
            errores.append(f"{v} (no coincide con [A-Z][A-Z0-9_]+)")
    return errores


def construir_contenido(env_local: dict[str, str], vars_solicitadas: list[str]) -> str:
    lineas = []
    for v in vars_solicitadas:
        if v in env_local:
            lineas.append(f"{v}={env_local[v]}")
    return "\n".join(lineas) + ("\n" if lineas else "")


def entregas_por_ssh(maquina: str, contenido: str, simular: bool = False, usuario: str = "starseed") -> int:
    if simular:
        print(f"[simular] ssh {usuario}@{maquina} 'sudo install -m 600 -o root /etc/starseed/env < stdin'")
        for linea in contenido.splitlines():
            if "=" in linea:
                k = linea.split("=", 1)[0]
                print(f"  {k}=***")
        return 0
    orden_ssh = [
        "ssh", "-i", str(SSH_KEY_PATH), "-o", "StrictHostKeyChecking=accept-new",
        f"{usuario}@{maquina}",
        "sudo install -m 600 -o root /etc/starseed/env /dev/stdin"
    ]
    proc = subprocess.run(orden_ssh, input=contenido, text=True, capture_output=True)
    if proc.returncode != 0:
        print(f"Error ssh: {proc.stderr}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("maquina", help="Nombre de la máquina destino")
    parser.add_argument("variables", nargs="+", help="Variables [A-Z][A-Z0-9_]*")
    parser.add_argument("--simular", action="store_true", help="Describe lo que haría sin ejecutar")
    args = parser.parse_args(argv)

    errores = validar_nombres(args.variables)
    if errores:
        for e in errores:
            print(f"Rechazado: {e}")
        return 2

    env_local = _leer_env_local()
    resultados: list[str] = []
    contenido_lineas: list[str] = []
    for v in args.variables:
        if v in env_local:
            resultados.append(f"{v} ✓")
            contenido_lineas.append(f"{v}={env_local[v]}")
        else:
            resultados.append(f"{v} (no está en tu env)")
    for r in resultados:
        print(r)

    contenido = "\n".join(contenido_lineas) + ("\n" if contenido_lineas else "")
    destino = _leer_oracle_ip() or args.maquina
    return entregas_por_ssh(destino, contenido, simular=args.simular)

if __name__ == "__main__":
    raise SystemExit(main())
