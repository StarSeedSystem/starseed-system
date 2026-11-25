#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y validación de Cloudroom (CAP1119).
Lee/escribe config/cloudroom-pi-modelos.json, valida claves y topes,
y sondea el estado de la app y la cuenta en la nube."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from typing import Any

#: Ruta del archivo de configuración de modelos de Pi en la nube de Cloudroom.
RUTA_CONFIG = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "config",
    "cloudroom-pi-modelos.json",
)

#: Tope de cada orden de `room-cli` (status tarda ~12 s en Mac tranquila).
TOPE_CLI_S = int(os.environ.get("STARSEED_CLOUDROOM_TOPE_S", "45") or 45)


# ── tipos ──────────────────────────────────────────────────────────────────────────────
type ConfigDict = dict[str, Any]
type EstadoDict = dict[str, Any]


# ── lectura/escritura de config ────────────────────────────────────────────────────────


def leer_config(ruta: str | None = None) -> ConfigDict:
    """Lee la configuración de Cloudroom (simultaneos, claves, modelos).
    Tolera archivo faltante o JSON inválido: devuelve {}."""
    try:
        with open(ruta or RUTA_CONFIG, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(datos, dict):
        return {}
    return {
        "simultaneos": _filtrar_simultaneos(datos.get("simultaneos")),
        "claves": _filtrar_claves(datos.get("claves")),
        "modelos": _filtrar_modelos(datos.get("modelos")),
    }


def _filtrar_simultaneos(valor: Any) -> dict[str, int]:
    if not isinstance(valor, dict):
        return {}
    return {
        str(k).lower(): int(v)
        for k, v in valor.items()
        if isinstance(v, int) and not isinstance(v, bool) and v >= 0
    }


def _filtrar_claves(valor: Any) -> dict[str, str]:
    if not isinstance(valor, dict):
        return {}
    return {
        str(k).lower(): str(v)
        for k, v in valor.items()
        if isinstance(v, str) and v
    }


def _filtrar_modelos(valor: Any) -> list[str]:
    if not isinstance(valor, list):
        return []
    return [str(m).strip() for m in valor if isinstance(m, str) and m.strip()]


def simultaneos(config: ConfigDict) -> dict[str, int]:
    """Extrae los topes de hilos simultáneos por proveedor."""
    sim = config.get("simultaneos") if isinstance(config, dict) else None
    return sim if isinstance(sim, dict) else {}


def claves(config: ConfigDict) -> dict[str, str]:
    """Extrae los nombres de variables de entorno para las claves."""
    return config.get("claves", {}) if isinstance(config, dict) else {}


def modelos(config: ConfigDict) -> list[str]:
    """Extrae la lista de modelos declarados."""
    return config.get("modelos", []) if isinstance(config, dict) else []


# ── utilidades puras ───────────────────────────────────────────────────────────────────


def proveedor_de(modelo: str) -> str:
    """Devuelve el proveedor (prefijo antes de '/') en minúsculas, o '' si no hay barra."""
    if "/" in modelo:
        return modelo.split("/", 1)[0].strip().lower()
    return ""


def validar_config(config: ConfigDict) -> tuple[bool, list[str]]:
    """Valida que la config tiene simultaneos, claves y modelos coherentes.
    Devuelve (ok, lista_de_errores)."""
    errores = []
    if not isinstance(config, dict):
        return False, ["config no es un dict"]
    sim = simultaneos(config)
    cls = claves(config)
    mods = modelos(config)
    if not sim:
        errores.append("falta 'simultaneos' o está vacío")
    if not cls:
        errores.append("falta 'claves' o está vacío")
    if not mods:
        errores.append("falta 'modelos' o está vacío")
    # Cada modelo debe tener su proveedor en claves y en simultaneos
    for m in mods:
        prov = proveedor_de(m)
        if prov and prov not in cls:
            errores.append(f"modelo '{m}': proveedor '{prov}' no tiene clave declarada")
        if prov and prov not in sim:
            errores.append(f"modelo '{m}': proveedor '{prov}' no tiene tope en simultaneos")
    return (len(errores) == 0, errores)


def modelos_con_clave_nube(
    declarados: list[str], claves_decl: dict[str, str], nombres_nube: set[str] | None
) -> list[str]:
    """Filtra los modelos declarados cuyos proveedores tienen su clave en la nube de Cloudroom.
    Si `nombres_nube` es None (no se pudo leer), no filtra: mejor probar que dejar sin modelos."""
    if nombres_nube is None:
        return list(declarados or [])
    salida = []
    for m in declarados or []:
        prov = proveedor_de(m)
        var = claves_decl.get(prov, "")
        if not var or var in nombres_nube:
            salida.append(m)
    return salida


# ── sonda CLI ──────────────────────────────────────────────────────────────────────────


def cli_path(env: Any = None, which: Any = None) -> str:
    """Ruta del ejecutable `room-cli`: variable CLOUDROOM_CLI, PATH, o ~/.local/bin/room-cli."""
    if which is None:
        which = shutil.which
    env = env or os.environ
    ruta = env.get("CLOUDROOM_CLI", "") if hasattr(env, "get") else ""
    if ruta and os.path.isfile(ruta):
        return ruta
    if ruta:
        w = which(ruta)
        if w:
            return w
    w = which("room-cli")
    if w:
        return w
    local = os.path.expanduser("~/.local/bin/room-cli")
    if os.path.isfile(local):
        return local
    return ""


def interpretar(
    local: EstadoDict | None,
    nube: EstadoDict | None,
    hilos: EstadoDict | None = None,
    errores: tuple[str, ...] = (),
) -> EstadoDict:
    """PURA: interpreta respuestas JSON y errores de `room-cli status` y `cloud status`."""
    capacidad = "100 agentes en la nube / 30 días (plan gratis)"
    motivo = next((str(e) for e in errores if e), "")
    if local is None and isinstance(nube, dict) and (nube.get("ready") or nube.get("account")):
        local = {}
    if local is None:
        return medio("no_disponible", motivo or "app sin instalar", capacidad, "instala Cloudroom y vuelve a sondear")
    if not isinstance(local, dict):
        return medio("no_disponible", "respuesta inválida de room-cli status", capacidad)
    if nube is None:
        return medio("requiere_alex", motivo or "no se pudo consultar la cuenta Cloudroom", capacidad, "abre Cloudroom e inicia sesión")
    if not isinstance(nube, dict):
        return medio("no_disponible", "respuesta inválida de room-cli cloud status", capacidad)
    login = nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
    login = bool(login or nube.get("user") or nube.get("account"))
    if not login:
        return medio("requiere_alex", "sin iniciar sesión en Cloudroom", capacidad, "inicia sesión en la app Cloudroom")
    activos = int((hilos or {}).get("count", 0)) if isinstance(hilos, dict) else 0
    detalle = "cuenta conectada · %d hilo(s) abierto(s)" % activos
    return medio("usable", detalle, capacidad)


def medio(estado: str, detalle: str, capacidad: str, siguiente: str = "") -> EstadoDict:
    return {"id": "cloudroom", "nombre": "Cloudroom", "estado": estado, "detalle": detalle, "capacidad": capacidad, "siguiente_paso": siguiente}


def sondear(run=subprocess.run, env: dict[str, str] | None = None) -> EstadoDict:
    """Ejecuta `room-cli status --json`, `cloud status --json`, `thread count --json` y devuelve el estado interpretado."""
    ruta = cli_path(env)
    if not ruta:
        return interpretar(None, None, errores=("app sin instalar",))

    def pedir(args: list[str]) -> tuple[EstadoDict | None, str]:
        try:
            p = run([ruta, *args, "--json"], capture_output=True, text=True, timeout=TOPE_CLI_S)
            if p.returncode == 0:
                return json.loads(p.stdout), ""
            return None, (p.stderr or "comando fallido").strip()
        except FileNotFoundError:
            return None, "app sin instalar"
        except (OSError, subprocess.TimeoutExpired, ValueError) as e:
            return None, type(e).__name__

    local, e1 = pedir(["status"])
    nube, e2 = pedir(["cloud", "status"])
    hilos, _ = pedir(["thread", "count"])
    return interpretar(local, nube, hilos, (e1, e2))


# ── CLI ────────────────────────────────────────────────────────────────────────────────


def _cmd_validar(argv: list[str]) -> int:
    config = leer_config()
    ok, errores = validar_config(config)
    if ok:
        print("Configuración válida ✓")
        print(json.dumps(config, ensure_ascii=False, indent=1))
    else:
        print("Configuración INVÁLIDA:")
        for e in errores:
            print("  - %s" % e)
        if not config:
            print("(archivo no encontrado en %s)" % RUTA_CONFIG)
    return 0 if ok else 1


def _cmd_sondear(argv: list[str]) -> int:
    estado = sondear()
    print(json.dumps(estado, ensure_ascii=False, indent=1))
    return 0 if estado.get("estado") == "usable" else 1


def _cmd_modelos(argv: list[str]) -> int:
    config = leer_config()
    print("Modelos declarados:")
    for m in modelos(config):
        print("  %s" % m)
    print("\nClaves declaradas:")
    for prov, var in claves(config).items():
        print("  %s → %s" % (prov, var))
    print("\nTopes simultáneos:")
    for prov, n in simultaneos(config).items():
        print("  %s: %d" % (prov, n))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    if not argv:
        print("uso: cloudroom_config.py validar | sondear | modelos")
        return 1
    cmd = argv[0]
    if cmd == "validar":
        return _cmd_validar(argv[1:])
    if cmd == "sondear":
        return _cmd_sondear(argv[1:])
    if cmd == "modelos":
        return _cmd_modelos(argv[1:])
    print("comando desconocido: %s" % cmd)
    print("uso: cloudroom_config.py validar | sondear | modelos")
    return 1


if __name__ == "__main__":
    sys.exit(main())