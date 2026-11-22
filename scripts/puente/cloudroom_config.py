#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configura y activa Cloudroom para el enjambre (CAP1119).

Aplica los proveedores gratuitos (`scripts/cloudroom/setup-nube.sh`) y dice, sin inventar,
qué falta (app, sesión, agentes, claves). Las claves solo se nombran; nunca se escribe su
valor. Al quedar listo, la próxima pasada de `buscar_capacidad` ya lo usa.
"""
from __future__ import annotations

import json, os, subprocess, sys

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path: sys.path.insert(0, DIR)
import cloudroom_modelos as CM  # noqa: E402
import medio_cloudroom as MC  # noqa: E402

SETUP = os.path.join(os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIR)), "scripts", "cloudroom", "setup-nube.sh")
def cuenta_conectada(nube):
    """PURA: ¿la cuenta de Cloudroom está iniciada?"""
    if not isinstance(nube, dict):
        return False
    login = nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
    return bool(login or nube.get("user") or nube.get("account"))
def _resultado(estado, detalle, pasos, faltan=(), modelos=()):
    return {"estado": estado, "detalle": detalle, "pasos": pasos,
            "faltan": list(faltan), "modelos": list(modelos)}

def plan(local, nube, env_lista, setup_texto="setup", claves=None):
    """PURA: estado y pasos para dejar Cloudroom configurado y usable."""
    if local is None and isinstance(nube, dict) and (nube.get("ready") or nube.get("account")):
        local = {}
    if local is None:
        return _resultado("no_disponible", "app sin instalar: instala Cloudroom y vuelve a probar", [{"tipo": "instalar", "detalle": "instala Cloudroom y abre la app"}])
    if not isinstance(local, dict):
        return _resultado("no_disponible", "respuesta inválida de room-cli status", [])
    if nube is None:
        return _resultado("requiere_alex", "no se pudo consultar la cuenta Cloudroom", [{"tipo": "iniciar_sesion", "detalle": "abre Cloudroom e inicia sesión"}])
    if not isinstance(nube, dict):
        return _resultado("no_disponible", "respuesta inválida de room-cli cloud status", [])
    if not cuenta_conectada(nube):
        return _resultado("requiere_alex", "inicia sesión en la app Cloudroom", [{"tipo": "iniciar_sesion", "detalle": "inicia sesión en la app Cloudroom"}])
    if not setup_texto:
        return _resultado("no_disponible", "falta scripts/cloudroom/setup-nube.sh", [{"tipo": "revisar_setup", "detalle": "restaura scripts/cloudroom/setup-nube.sh"}])
    nombres = CM.nombres_env(env_lista)
    claves = CM.claves_declaradas() if claves is None else claves
    faltan = [] if nombres is None else [v for v in dict.fromkeys((claves or {}).values()) if v and v not in nombres]
    pasos: list[dict] = [{"tipo": "poner_clave", "variable": v, "detalle": "falta %s: room-cli cloud env set %s (lo pone Alex; nunca el valor aquí)" % (v, v)} for v in faltan]
    pasos.append({"tipo": "aplicar_setup", "orden": ["room-cli", "cloud", "setup", "set"], "detalle": "aplicar proveedores gratuitos: room-cli cloud setup set < scripts/cloudroom/setup-nube.sh"})
    harnesses = CM.harnesses_nube(nube)
    modelos = [m for _h, _d, ms in harnesses for m in ms]
    if not harnesses or not modelos:
        pasos.append({"tipo": "conectar_agente", "detalle": "conecta un agente (Claude Code, Codex u opencode) en la app Cloudroom"})
        return _resultado("requiere_alex", "ningún agente de la nube lista modelos", pasos, faltan, modelos)
    if faltan:
        return _resultado("requiere_alex", "faltan %d clave(s) de proveedor en la nube" % len(faltan), pasos, faltan, modelos)
    return _resultado("listo", "cuenta conectada · %d modelo(s) en la nube" % len(modelos), pasos, faltan, modelos)

def _cli(run, orden, entrada=""):
    """(salida, error) de una orden de room-cli; nunca lanza."""
    try:
        p = run(orden, input=entrada, capture_output=True, text=True, timeout=60)
        if not p.returncode:
            return p.stdout or "", ""
        return "", ((p.stderr or p.stdout or "").strip().splitlines() or ["salió con %s" % p.returncode])[-1][:200]
    except (OSError, subprocess.SubprocessError) as e:
        return "", type(e).__name__

def _json(run, orden):
    """(JSON, error) de una orden de room-cli; nunca lanza."""
    salida, error = _cli(run, orden)
    if error:
        return None, error
    try:
        return json.loads(salida or "null"), ""
    except ValueError as e:
        return None, type(e).__name__

def configurar(run=subprocess.run, cli=None, seco=False, ruta_setup=None, claves=None):
    """Lee el estado real y aplica el setup (salvo en seco). Nunca escribe claves."""
    cli = cli or MC.cli_path()
    local = nube = env_lista = None
    if cli:
        local = _json(run, [cli, "status", "--json"])[0]
        nube = _json(run, [cli, "cloud", "status", "--json"])[0]
        env_lista = _json(run, [cli, "cloud", "env", "list", "--json"])[0]
    try:
        setup_texto = open(ruta_setup or SETUP, encoding="utf-8").read()
    except OSError:
        setup_texto = ""
    r = plan(local, nube, env_lista, setup_texto, claves)
    r["setup"] = {"aplicado": False, "ok": False, "error": ""}
    if cli and not seco and setup_texto and cuenta_conectada(nube):
        error = _cli(run, [cli, "cloud", "setup", "set"], setup_texto)[1]
        r["setup"] = {"aplicado": True, "ok": not error, "error": error}
        for p in r["pasos"]:
            if p.get("tipo") == "aplicar_setup":
                p["hecho"], p["detalle"] = not error, ("setup aplicado" if not error else "el setup falló: %s" % error)
        if error and r["estado"] in ("listo", "usable"):
            r["estado"], r["detalle"] = "requiere_alex", "el setup no se aplicó: %s" % error
    return r

def texto(resultado):
    """Informe legible del resultado de `configurar`/`plan`."""
    r = resultado if isinstance(resultado, dict) else {}
    lineas = ["Cloudroom: %s · %s" % (r.get("estado", "?"), r.get("detalle", ""))]
    if r.get("modelos"):
        lineas.append("  modelos: %s" % ", ".join(r["modelos"][:5]))
    lineas += ["  %s %s" % ("✓" if p.get("hecho") else ("✗" if p.get("hecho") is False else "·"), p.get("detalle", "")) for p in r.get("pasos") or []]
    return "\n".join(lineas)

def main(argv=None):
    """CLI: configura Cloudroom y devuelve 0 si queda listo o usable."""
    argv = list(sys.argv[1:] if argv is None else argv)
    r = configurar(seco="--seco" in argv)
    print(json.dumps(r, ensure_ascii=False, indent=1) if "--json" in argv else texto(r))
    return 0 if r.get("estado") in ("listo", "usable") else 1

if __name__ == "__main__":
    raise SystemExit(main())
