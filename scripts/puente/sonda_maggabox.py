#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda de vida para Maggabox viva. Verifica espacio y estado de almacenamiento."""
from __future__ import annotations

import json
import subprocess
from typing import Any, Callable, Dict, List, Optional

SSH_BASE = [
    "ssh",
    "-i", "~/.ssh/starseed_nodo1",
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "UserKnownHostsFile=$HOME/.ssh/known_hosts_starseed_nodo",
    "maggasukha@starseed-nodo-1.local",
]

DIRECTORIOS_ALMACEN = ["espejo", "versiones", "respaldos", "pesados", "capas_privadas", "capas_publicas", "nube"]


def sonda_maggabox(ssh_fn: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    if ssh_fn is None:
        ssh_fn = subprocess.run
    return _consultar_estado(ssh_fn)


def _ejecutar_ssh(argv: List[str], ssh_fn: Callable[..., Any]) -> str:
    try:
        r = ssh_fn(argv, capture_output=True, text=True, timeout=8)
        return (r.stdout or "").strip()
    except Exception:
        return ""


def _parsedf_bg(output: str) -> int:
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 4:
            return int(parts[3].rstrip("G"))
    return 0


def _parsefree_mb(output: str) -> int:
    for line in output.splitlines():
        if line.startswith("Mem:"):
            parts = line.split()
            if len(parts) >= 4:
                try:
                    return int(parts[3])
                except ValueError:
                    pass
    return 0


def _parse_du_sizes(output: str, directorios: List[str]) -> Dict[str, int]:
    result = {d: 0 for d in directorios}
    for line in output.splitlines():
        for d in directorios:
            if d in line:
                parts = line.split()
                if parts:
                    size_str = parts[0].rstrip("G")
                    try:
                        result[d] = int(size_str)
                    except ValueError:
                        pass
    return result


def _consultar_estado(ssh_fn: Callable[..., Any]) -> Dict[str, Any]:
    df_out = _ejecutar_ssh(SSH_BASE + ["df", "-BG", "/"], ssh_fn)
    cpu_out = _ejecutar_ssh(SSH_BASE + ["nproc"], ssh_fn)
    free_out = _ejecutar_ssh(SSH_BASE + ["free", "-m"], ssh_fn)
    du_base = SSH_BASE + ["du", "-BG", "$HOME/StarSeed-almacen/espejo", "$HOME/StarSeed-almacen/versiones", "$HOME/StarSeed-almacen/respaldos", "$HOME/StarSeed-almacen/pesados", "$HOME/StarSeed-almacen/capas_privadas", "$HOME/StarSeed-almacen/capas_publicas", "$HOME/StarSeed-almacen/nube"]
    du_out = _ejecutar_ssh(du_base, ssh_fn)

    carpetas = {}
    for d in DIRECTORIOS_ALMACEN:
        carpetas[d] = _parse_du_sizes(du_out, [d]).get(d, 0)

    has_docker = False
    try:
        r = ssh_fn(SSH_BASE + ["which", "docker"], capture_output=True, text=True, timeout=8)
        has_docker = r.returncode == 0
    except Exception:
        pass
    has_podman = False
    try:
        r = ssh_fn(SSH_BASE + ["which", "podman"], capture_output=True, text=True, timeout=8)
        has_podman = r.returncode == 0
    except Exception:
        pass

    return {
        "discoLibreGb": _parsedf_bg(df_out),
        "ramLibreMb": _parsefree_mb(free_out),
        "cpu": int(cpu_out) if cpu_out.isdigit() else 2,
        "contenedores": has_docker or has_podman,
        "carpetas_starSeed_almacen": carpetas,
    }


if __name__ == "__main__":
    print(json.dumps(sonda_maggabox(), ensure_ascii=False, indent=2))