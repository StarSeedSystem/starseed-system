#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda de vida para Maggabox viva. Verifica espacio y estado de almacenamiento."""
from __future__ import annotations

import json
import os
import subprocess
from typing import Any, Callable, Dict, List, Optional

SSH_BASE = [
    "ssh",
    "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
    # DIR1125O: `starseed-nodo-1.local` resuelve antes a una IPv6 de enlace local que no contesta: cada ssh tardaba 8,5 s y la
    # sonda (tope 8 s) daba ceros. Por IPv4, 0,6 s. `-n`: sin entrada estándar.
    "-o", "AddressFamily=inet",
    "-n",
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    # DIR1125O: sin shell, ssh no expande `$HOME` («Host key verification failed» y la sonda daba ceros).
    "-o", "UserKnownHostsFile=" + os.path.expanduser("~/.ssh/known_hosts_starseed_nodo"),
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


def _parsedf_campo(output: str, i: int) -> int:
    """DIR1125O: la columna `i` de `df -BG` (1 = total, 2 = usado, 3 = libre), en GB. 0 si no se lee."""
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) > i:
            try:
                return int(parts[i].rstrip("G"))
            except ValueError:
                return 0
    return 0


def parse_estado_externo(output: str) -> Dict[str, Any]:
    """MED1126A · lo que dice `starseed-almacen estado` del disco externo: JSON o líneas `clave: valor`.
    Devuelve `montado` (True/False/None si no lo dice), `errores` (int) y `smart` («ok», «fallo» o ""). Nunca lanza."""
    vacio: Dict[str, Any] = {"montado": None, "errores": 0, "smart": ""}
    if not output.strip():
        return vacio
    datos: Dict[str, Any] = {}
    try:
        crudo = json.loads(output)
        datos = crudo if isinstance(crudo, dict) else {}
    except ValueError:
        for linea in output.splitlines():
            clave, sep, valor = linea.partition(":") if ":" in linea else linea.partition("=")
            if sep:
                datos[clave.strip().lower()] = valor.strip()

    def texto(*claves: str) -> str:
        for c in claves:
            if datos.get(c) is not None:
                return str(datos[c]).strip().lower()
        return ""

    montado_t = texto("montado", "mounted")
    montado: Optional[bool] = None
    if montado_t in ("sí", "si", "yes", "true", "1", "montado"):
        montado = True
    elif montado_t in ("no", "false", "0", "desmontado"):
        montado = False
    errores_t = texto("errores", "errors")
    errores = int(errores_t) if errores_t.isdigit() else 0
    smart_t = texto("smart")
    smart = "" if not smart_t else ("ok" if smart_t in ("ok", "passed", "pass", "bien") else "fallo")
    return {"montado": montado, "errores": errores, "smart": smart}


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
    df_out_srv = _ejecutar_ssh(SSH_BASE + ["df", "-BG", "/srv/starseed-almacen"], ssh_fn)
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

    estado_ext = _ejecutar_ssh(SSH_BASE + ["starseed-almacen", "estado"], ssh_fn)
    df_libre_srv = _parsedf_bg(df_out_srv) if df_out_srv else None
    df_total_srv = _parsedf_campo(df_out_srv, 1) if df_out_srv else None
    df_usado_srv = _parsedf_campo(df_out_srv, 2) if df_out_srv else None
    return {
        "discoLibreGb": _parsedf_bg(df_out),
        "discoTotalGb": _parsedf_campo(df_out, 1),
        "discoUsadoGb": _parsedf_campo(df_out, 2),
        "discoLibreSrvGb": df_libre_srv,
        "discoTotalSrvGb": df_total_srv,
        "discoUsadoSrvGb": df_usado_srv,
        "almacenExterno": parse_estado_externo(estado_ext),
        "ramLibreMb": _parsefree_mb(free_out),
        "cpu": int(cpu_out) if cpu_out.isdigit() else 2,
        "contenedores": has_docker or has_podman,
        "carpetas_starSeed_almacen": carpetas,
    }


if __name__ == "__main__":
    print(json.dumps(sonda_maggabox(), ensure_ascii=False, indent=2))