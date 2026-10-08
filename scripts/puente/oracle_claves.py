#!/usr/bin/env python3
"""Herramienta de Alex: copia variables de env a máquina remota por SSH.

Uso:
    oracle_claves.py <maquina> VAR1 VAR2 ...

Funcionalidad:
- Lee SOLO esas variables de ~/.starseed/env
- Construye env en memoria, lo deja en /etc/starseed/env (modo 0600, root) en la máquina remota
- Salida: "VAR1 ✓, VAR2 (no está en tu env)"
- Nunca imprime valores
- Rechaza nombres que no sean [A-Z][A-Z0-9_]+
- --simular: solo dice qué haría
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from unittest import mock

VARIABLE_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")


def _leer_env_archivo(home: str | Path) -> dict[str, str]:
    """Lee ~/.starseed/env, devuelve un dict de nombres a valores (sin espacios en blanco extra)."""
    ruta = Path(home) / ".starseed" / "env"
    if not ruta.exists():
        return {}
    with ruta.open(encoding="utf-8") as archivo:
        lines = archivo.read().splitlines()
        parsed = {}
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if key and not re.search(r"\s=", key):
                parsed[key] = val
        return parsed


def _construir_archivo_env(envs: dict[str, str]) -> str:
    """Devuelve contenido de /etc/starseed/env sin comentarios ni adicionales."""
    lines = []
    for key in sorted(envs):
        lines.append(f"{key}={envs[key]}")
    return "\n".join(lines) + "\n"


def _validar_nombres(nombres: list[str]) -> list[str]:
    """Rechaza nombres que no sean [A-Z][A-Z0-9_]+; devuelve solo válidos."""
    invalidos = []
    for n in nombres:
        if not VARIABLE_PATTERN.fullmatch(n):
            invalidos.append(n)
    return invalidos


def _probar_ssh(host: str, key_file: str, user: str, comando: str) -> subprocess.CompletedProcess:
    """Ejecuta ssh -i key -o StrictHostKeyChecking=no user@host <<< comando.
    Para la simulación, no ejecuta nada; para lo real, sí.
    """
    cmd = ["ssh", "-i", key_file, "-o", "StrictHostKeyChecking=no", f"{user}@{host}", "sudo", "install", "-m", "600", "-o", "root", "/etc/starseed/env"]
    return subprocess.run(cmd, input=comando.encode(), capture_output=True, check=False)


def _leer_oracle_json(home: str | Path) -> dict:
    """Lee ~/.starseed/oracle.json si existe."""
    ruta = Path(home) / ".starseed" / "oracle.json"
    if not ruta.exists():
        return {}
    with ruta.open(encoding="utf-8") as archivo:
        import json
        return json.load(archivo)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simular", action="store_true", help="Solo imprime qué haría")
    parser.add_argument("maquina", help="Máquina remota (IP o host)")
    parser.add_argument("variables", nargs="+", help="Variables [A-Z][A-Z0-9_]+ a copiar")
    args = parser.parse_args(argv)

    home = Path.home()
    invalid_names = _validar_nombres(args.variables)
    if invalid_names:
        print(f"Error: Nombres inválidos rechazan: {' '.join(invalid_names)}")
        print(f"Requiere: [A-Z][A-Z0-9_]+")
        return 1

    envs = _leer_env_archivo(home)
    env_solicitadas = {v: envs.get(v, "") for v in args.variables if v in envs}
    env_no_solicitadas = {v: envs.get(v, "") for v in args.variables if v not in envs}

    resultados = []
    for v in args.variables:
        if v in env_solicitadas:
            resultados.append(f"{v} ✓")
        else:
            resultados.append(f"{v} (no está en tu env)")
    print(", ".join(resultados))

    if not args.simular:
        oracle = _leer_oracle_json(home)
        ip = oracle.get("ip_publica") if oracle else None
        if not ip:
            # Intentar leer desde la máquina (esto es solo un ejemplo, en la implementación real usaremos la pasada)
            ip = args.maquina
        key_file = home / ".ssh" / "starseed_oracle_ed25519"
        if not key_file.exists():
            print(f"Error: Llave SSH no encontrada: {key_file}")
            return 1

        comando = _construir_archivo_env(env_solicitadas)
        resultado = _probar_ssh(ip, str(key_file), "starseed", comando)
        if resultado.returncode != 0:
            print(f"Error al instalar en máquina {ip}: {resultado.stderr.decode('utf-8', errors='replace')}")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
