#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y prueba de Cloudroom (CAP1119 · `architecture/cloudroom-servidor-agentes.md`).

`configurar` aplica en la nube los proveedores gratuitos de Pi (`room-cli cloud setup set` con
`scripts/cloudroom/setup-nube.sh`); `probar` dice si el medio abre hilos y qué le falta. Nunca
guarda ni imprime claves: solo NOMBRES de variable. Decisiones PURAS probadas en
`test_cloudroom_config.py` (sin room-cli, sin red).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import medio_cloudroom as MC  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
RUTA_CONFIG = os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json")
RUTA_SETUP = os.path.join(RAIZ, "scripts", "cloudroom", "setup-nube.sh")


def _leer(ruta, texto=False):
    """JSON (o texto) de un archivo; vacío si no se puede leer (nunca lanza)."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read() if texto else json.load(f)
    except (OSError, ValueError):
        return "" if texto else {}


def env_nombres(lista_env):
    """PURA: NOMBRES de `room-cli cloud env list --json`; None si no se pudo leer."""
    d = lista_env.get("data", lista_env) if isinstance(lista_env, dict) else None
    if not isinstance(d, dict) or not isinstance(d.get("variables"), list):
        return None
    return {str(v.get("name")) for v in d["variables"] if isinstance(v, dict) and v.get("name")}


def claves_faltantes(config, nombres):
    """PURA: [(proveedor, VARIABLE)] cuya clave no está en la nube; [] si no se pudo leer."""
    if nombres is None or not isinstance(config, dict):
        return []
    claves = config.get("claves")
    claves = claves if isinstance(claves, dict) else {}
    return sorted((str(p).lower(), str(v)) for p, v in claves.items()
                  if isinstance(v, str) and v and v not in nombres)


def modelos_disponibles(config, nombres):
    """PURA: modelos cuyo proveedor tiene su clave en la nube (todos si no se pudo leer)."""
    if not isinstance(config, dict):
        return []
    claves = config.get("claves")
    claves = claves if isinstance(claves, dict) else {}
    salida = []
    modelos = config.get("modelos")
    for m in modelos if isinstance(modelos, list) else []:
        if not isinstance(m, str) or not m.strip():
            continue
        var = claves.get(m.split("/", 1)[0].lower(), "") if "/" in m else ""
        if nombres is None or not var or var in nombres:
            salida.append(m.strip())
    return salida


def interpretar(config, local, nube, hilos, nombres, proyectos):
    """PURA: informe de Cloudroom (listo, estado, problemas, siguiente, claves, modelos, proyecto)."""
    r = {"listo": False, "estado": "no_disponible", "problemas": [], "siguiente": [],
         "claves_faltantes": [], "modelos": [], "proyecto": "", "detalle": "app sin instalar"}
    if not isinstance(local, dict):
        r["problemas"].append("la app Cloudroom no responde")
        r["siguiente"].append("instala Cloudroom (macOS Apple Silicon ≥13 o Linux x64) y abre la app")
        return r
    nube = nube if isinstance(nube, dict) else {}
    login = bool(nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
                 or nube.get("user") or nube.get("account") or nube.get("ready"))
    if not login:
        r.update(estado="requiere_alex", detalle="sin sesión",
                 problemas=["sin iniciar sesión en Cloudroom"],
                 siguiente=["inicia sesión en la app Cloudroom (lo hace Alex, nunca un chat)"])
        return r
    r["claves_faltantes"] = faltan = claves_faltantes(config, nombres)
    r["modelos"] = modelos = modelos_disponibles(config, nombres)
    if isinstance(proyectos, dict):
        proyectos = proyectos.get("projects") or proyectos.get("data") or []
    lista = [p for p in proyectos if isinstance(p, dict)] if isinstance(proyectos, list) else []
    r["proyecto"] = str(lista[0].get("id") or "") if lista else ""
    if nombres is None:
        r["problemas"].append("no pude leer las claves de la nube (cloud env list)")
    if faltan:
        r["problemas"].append("faltan %d clave(s) en la nube" % len(faltan))
        r["siguiente"] += ["room-cli cloud env set %s (lo pone Alex en la app)" % v for _p, v in faltan]
    if not modelos:
        r["problemas"].append("ningún modelo de Pi tiene su clave en la nube")
        r["siguiente"].append("aplica el setup con `cloudroom_config.py configurar`")
    if not lista:
        r["problemas"].append("no hay proyecto conectado en Cloudroom")
        r["siguiente"].append("conecta la carpeta del repo en la app Cloudroom")
    r["listo"] = bool(modelos) and bool(lista)
    r["estado"] = "listo" if r["listo"] else "requiere_alex"
    activos = int(hilos.get("count") or 0) if isinstance(hilos, dict) else 0
    r["detalle"] = "cuenta conectada · %d hilo(s) abierto(s) · %d modelo(s)" % (activos, len(modelos))
    return r


def texto_informe(r):
    """PURA: el informe en palabras (solo NOMBRES de variable, nunca valores)."""
    cab = {"listo": "LISTO", "requiere_alex": "REQUIERE ALEX", "no_disponible": "NO DISPONIBLE"}
    lineas = ["Cloudroom: %s · %s" % (cab.get(r.get("estado"), "?"), r.get("detalle") or "")]
    if r.get("modelos"):
        lineas.append("· modelos: %s" % ", ".join(r["modelos"]))
    if r.get("proyecto"):
        lineas.append("· proyecto: %s" % r["proyecto"])
    lineas += ["· problema: %s" % p for p in r.get("problemas") or []]
    lineas += ["· siguiente: %s" % s for s in dict.fromkeys(r.get("siguiente") or [])]
    return "\n".join(lineas)


def _json_cli(run, cli, args):
    """JSON de una orden de room-cli con `--json`; None si falla o no parsea (nunca lanza)."""
    try:
        p = run([cli, *args, "--json"], capture_output=True, text=True, timeout=MC.TOPE_CLI_S)
        return json.loads(p.stdout or "null") if p.returncode == 0 else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def probar(run=subprocess.run, cli=None, config=None):
    """Sondea Cloudroom y devuelve el informe puro (sin room-cli: no_disponible)."""
    cli = cli if cli is not None else MC.cli_path()
    config = config if config is not None else _leer(RUTA_CONFIG)
    if not cli:
        return interpretar(config, None, None, None, None, None)
    return interpretar(config, _json_cli(run, cli, ["status"]), _json_cli(run, cli, ["cloud", "status"]),
                       _json_cli(run, cli, ["thread", "count"]),
                       env_nombres(_json_cli(run, cli, ["cloud", "env", "list"])),
                       _json_cli(run, cli, ["project", "list"]))


def configurar(run=subprocess.run, cli=None, ruta_setup=None):
    """Aplica el setup de Pi en la nube por la entrada estándar; no toca claves ni sesión."""
    cli = cli if cli is not None else MC.cli_path()
    if not cli:
        return {"ok": False, "aplicado": False, "detalle": "app sin instalar"}
    texto = _leer(ruta_setup or RUTA_SETUP, texto=True)
    if not isinstance(texto, str) or not texto.strip():
        return {"ok": False, "aplicado": False, "detalle": "no encuentro %s" % (ruta_setup or RUTA_SETUP)}
    try:
        p = run([cli, "cloud", "setup", "set"], input=texto, capture_output=True, text=True,
                timeout=MC.TOPE_CLI_S * 2)
    except (OSError, subprocess.SubprocessError) as e:
        return {"ok": False, "aplicado": False, "detalle": type(e).__name__}
    if p.returncode:
        motivo = (p.stderr or p.stdout or "salió con %s" % p.returncode).strip().splitlines()[-1][:200]
        return {"ok": False, "aplicado": False, "detalle": motivo}
    return {"ok": True, "aplicado": True, "detalle": "setup de Pi aplicado en la nube de Cloudroom"}


def main(argv):
    orden, como_json = (argv[0] if argv else "probar"), "--json" in argv
    if orden in ("probar", "test", "estado"):
        r = probar()
        print(json.dumps(r, ensure_ascii=False) if como_json else texto_informe(r))
        return 0 if r["listo"] else 1
    if orden in ("configurar", "activar", "setup"):
        c, r = configurar(), probar()
        if como_json:
            print(json.dumps({"configurar": c, "probar": r}, ensure_ascii=False))
        else:
            print("configurar: %s\n%s" % (c["detalle"], texto_informe(r)))
        return 0 if c["ok"] and r["listo"] else 1
    print("uso: cloudroom_config.py probar [--json] | configurar [--json]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
