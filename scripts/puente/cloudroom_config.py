#!/usr/bin/env python3
"""Configura y prueba Cloudroom para la próxima ola: comprueba CLI, cuenta, proyecto, modelos y
claves, aplica el setup de la nube cuando se pide y dice si se puede lanzar con `cloudroom_lanzar`.
Nunca guarda ni muestra valores de claves: solo NOMBRES de variables de entorno.
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

RUTA_SETUP = "scripts/cloudroom/setup-nube.sh"
RUTA_MODELOS = "config/cloudroom-pi-modelos.json"
ORDEN_LANZAR = "python3 scripts/puente/cloudroom_lanzar.py lanzar --ids …"


def leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def nombres_env(respuesta):
    datos = respuesta.get("data", respuesta) if isinstance(respuesta, dict) else {}
    variables = datos.get("variables") if isinstance(datos, dict) else None
    if not isinstance(variables, list):
        return None
    return {str(v["name"]) for v in variables if isinstance(v, dict) and v.get("name")}

def diagnosticar(local, nube, entorno, proyectos, raiz, ruta_modelos=None) -> dict:
    medio = MC.interpretar(local, nube, None)
    datos = leer_json(ruta_modelos or os.path.join(os.path.dirname(DIRECTORIO), RUTA_MODELOS), {})
    modelos = [m.strip() for m in datos.get("modelos", []) if isinstance(m, str) and m.strip()]
    claves = {str(k).lower(): str(v) for k, v in (datos.get("claves") or {}).items()
              if isinstance(v, str) and v.strip()}
    resultado = {"listo": False, "estado": medio["estado"], "detalle": medio["detalle"], "pasos": [],
                 "proyecto": "", "modelos": modelos, "claves": sorted(set(claves.values()))}
    if medio["estado"] != "usable":
        resultado["pasos"] = [medio.get("siguiente_paso") or "instala y abre Cloudroom e inicia sesión en la app"]
        return resultado
    lista = proyectos.get("projects", []) if isinstance(proyectos, dict) else proyectos or []
    destino = os.path.realpath(raiz)
    proyecto = next((str(p.get("id") or "") for p in lista
                     if isinstance(p, dict) and any(isinstance(s, dict) and s.get("path") and
                     os.path.realpath(str(s["path"])) == destino for s in p.get("sources") or [])), "")
    resultado["proyecto"] = proyecto
    pasos = []
    hs = (nube.get("data", nube) if isinstance(nube, dict) else {}).get("harnesses") or []
    if not any(isinstance(h, dict) and h.get("available") is not False and h.get("connected") is not False for h in hs):
        pasos.append("conecta un agente de código (Pi, Codex o Claude Code) en la app Cloudroom")
    if not modelos:
        pasos.append("revisa %s: no hay modelos declarados" % RUTA_MODELOS)
    nombres = nombres_env(entorno)
    if nombres is None:
        pasos.append("comprueba `room-cli cloud env list --json` (solo da NOMBRES de variables)")
    elif faltan := sorted({v for v in claves.values() if v not in nombres}):
        pasos.append("pon en la nube de Cloudroom las claves: %s" % ", ".join(faltan))
    if not proyecto:
        pasos.append("conecta %s como proyecto de Cloudroom" % raiz)
    if pasos:
        resultado.update(estado="requiere_alex", detalle="Cloudroom conectado, pero faltan %d paso(s)" % len(pasos),
                         pasos=pasos)
        return resultado
    resultado.update(listo=True, estado="listo", detalle="lista para la próxima ola: %s" % ORDEN_LANZAR)
    return resultado


def configurar(aplicar=False, run=subprocess.run, cli=None, raiz=None, entorno=None, ruta_modelos=None) -> dict:
    raiz = raiz or os.path.dirname(DIRECTORIO)
    cli = cli or MC.cli_path(entorno if entorno is not None else os.environ)
    if not cli:
        return dict(diagnosticar(None, None, None, None, raiz, ruta_modelos),
                    configurado=False, prueba={"ok": False, "detalle": "sin CLI"})

    def pedir(*args):
        try:
            p = run([cli, *args, "--json"], capture_output=True, text=True, timeout=MC.TOPE_CLI_S)
            return json.loads(p.stdout or "null") if p.returncode == 0 else None
        except (OSError, subprocess.SubprocessError, ValueError):
            return None

    aplicado = False
    if aplicar:
        try:
            with open(os.path.join(raiz, RUTA_SETUP), encoding="utf-8") as f:
                run([cli, "cloud", "setup", "set"], input=f.read(), capture_output=True, text=True,
                    timeout=MC.TOPE_CLI_S)
            aplicado = True
        except (OSError, subprocess.SubprocessError):
            pass
    local = pedir("status")
    nube = pedir("cloud", "status")
    entorno_nube = pedir("cloud", "env", "list")
    proyectos = pedir("project", "list")
    conteo = pedir("thread", "count")
    informe = diagnosticar(local, nube, entorno_nube, proyectos, raiz, ruta_modelos)
    informe["configurado"] = aplicado
    informe["prueba"] = {"ok": conteo is not None and informe["listo"],
                         "detalle": "thread count: %s" % (conteo.get("count", 0) if isinstance(conteo, dict) else "sin lectura")}
    if aplicar and not aplicado:
        informe["pasos"].insert(0, "no pude aplicar el setup de la nube; revisa %s" % RUTA_SETUP)
    return informe


def main(argv=None):
    print(json.dumps(configurar(aplicar="--aplicar" in (argv or sys.argv[1:])), ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
