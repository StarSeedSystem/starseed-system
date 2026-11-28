#!/usr/bin/env python3
"""Configura y activa Cloudroom (CAP1119 · `architecture/cloudroom-servidor-agentes.md`).

Aplica `room-cli cloud setup set < scripts/cloudroom/setup-nube.sh` (los proveedores gratuitos de
opencode y Pi en cada sandbox), comprueba sesión y claves declaradas en la nube (solo NOMBRES:
jamás un valor) y dice el siguiente paso. Las claves las pone Maggasukha en la app.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import cloudroom_modelos as CM  # noqa: E402  (claves declaradas y nombres de la nube, ya puros)

SETUP = os.path.join(os.path.dirname(os.path.dirname(DIRECTORIO)), "scripts", "cloudroom", "setup-nube.sh")
TOPE_S = int(os.environ.get("STARSEED_CLOUDROOM_TOPE_S", "45") or 45)

def leer_setup(ruta=None):
    """El contenido de `scripts/cloudroom/setup-nube.sh` ("" si no se puede leer)."""
    try:
        with open(ruta or SETUP, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""

def orden_setup(cli):
    """PURA: el setup real de Cloudroom, que lee el script por la entrada estándar."""
    return [cli, "cloud", "setup", "set"]

def informe(local, nube, env, declaradas, setup_ok=True, github=None):
    """PURA: qué le falta a Cloudroom para estar configurado y activado. `env` es la lista de
    `cloud env list --json` (solo nombres); `None` = no se pudo leer y no se culpa a nadie.
    `github` solo cuenta si la cuenta dice EXPLÍCITAMENTE que no está conectado."""
    if not isinstance(local, dict):
        return _salida("sin_app", "app sin instalar o sin responder", [],
                       "instala Cloudroom y vuelve a ejecutar este guion", False)
    if not isinstance(nube, dict):
        return _salida("sin_respuesta", "Cloudroom no devolvió el estado de la cuenta", [],
                       "abre la app Cloudroom y vuelve a intentarlo", False)
    sesion = bool(nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
                  or nube.get("user") or nube.get("account"))
    if not sesion:
        return _salida("sin_sesion", "sin iniciar sesión en Cloudroom", [],
                       "inicia sesión en la app Cloudroom (la hace Maggasukha)", False)
    if not setup_ok:
        return _salida("sin_setup", "falta scripts/cloudroom/setup-nube.sh", [],
                       "recupera el script del repo antes de configurar", False)
    nombres = CM.nombres_env(env)
    faltan = [] if nombres is None else sorted(
        v for v in (declaradas or {}).values() if v and v not in nombres)
    if faltan:
        return _salida("sin_claves", "faltan claves en la nube: " + ", ".join(faltan), faltan,
                       "room-cli cloud env set " + faltan[0] + "  (el valor, por la entrada estándar)", True)
    if github is False:
        return _salida("sin_repo", "GitHub sin conectar en Cloudroom", [],
                       "conecta GitHub en la app y abre el proyecto StarSeed", True)
    return _salida("configurado", "cuenta con sesión, setup aplicado y claves presentes", [],
                   "nada: el medio Cloudroom está listo para lanzar hilos", True)

def _salida(estado, detalle, faltan, siguiente, puede):
    return {"id": "cloudroom", "estado": estado, "detalle": detalle, "faltan": list(faltan),
            "siguiente_paso": siguiente, "puede_configurar": bool(puede)}

def _json_cli(run, orden, entrada=None, timeout=None):
    """(JSON, error) de una orden de room-cli; nunca lanza."""
    try:
        p = run(orden, input=entrada, capture_output=True, text=True, timeout=timeout or TOPE_S)
        if p.returncode:
            lineas = (p.stderr or p.stdout or "").strip().splitlines()
            return None, (lineas[-1] if lineas else "salió con %s" % p.returncode)[:200]
        return json.loads(p.stdout or "null"), ""
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        return None, type(e).__name__

def leer_fuentes(run, cli):
    """(local, nube, env) de room-cli; cada uno None si no se pudo leer."""
    return (_json_cli(run, [cli, "status", "--json"])[0],
            _json_cli(run, [cli, "cloud", "status", "--json"])[0],
            _json_cli(run, [cli, "cloud", "env", "list", "--json"])[0])

def configurar(run, cli, setup_texto, declaradas, leer, seco=False):
    """Aplica el setup (salvo `seco`) y devuelve el informe de DESPUÉS con `aplicado` y `error`."""
    local, nube, env = leer()
    antes = informe(local, nube, env, declaradas, bool(setup_texto))
    if seco or not antes["puede_configurar"]:
        return dict(antes, aplicado=False, error="")
    _datos, error = _json_cli(run, orden_setup(cli), entrada=setup_texto, timeout=120)
    local, nube, env = leer()
    despues = informe(local, nube, env, declaradas, bool(setup_texto))
    return dict(despues, aplicado=not error, error=error)

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    accion = argv[0] if argv and not argv[0].startswith("-") else "estado"
    seco, como_json = "--seco" in argv, "--json" in argv
    import medio_cloudroom  # noqa: PLC0415 — solo la CLI necesita buscar el binario

    cli = medio_cloudroom.cli_path()
    declaradas, setup = CM.claves_declaradas(), leer_setup()
    if not cli:
        r = informe(None, None, None, declaradas, False)
    elif accion == "configurar":
        r = configurar(subprocess.run, cli, setup, declaradas,
                       lambda: leer_fuentes(subprocess.run, cli), seco=seco)
    else:
        local, nube, env = leer_fuentes(subprocess.run, cli)
        r = informe(local, nube, env, declaradas, bool(setup))
    print(json.dumps(r, ensure_ascii=False) if como_json else
          "Cloudroom · %s: %s\n  siguiente: %s" % (r["estado"], r["detalle"], r["siguiente_paso"]))
    return 0 if r["estado"] == "configurado" else 1


if __name__ == "__main__":
    sys.exit(main())
