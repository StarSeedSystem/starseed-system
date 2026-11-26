#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configura y prueba Cloudroom antes de que el enjambre abra hilos de su nube (CAP1119).

Qué hace, en seco (`estado`) o aplicando (`aplicar`/`probar`):
1. Encuentra `room-cli` con la misma ruta que la sonda `medio_cloudroom`.
2. Lee `cloud status`, `cloud env list` (SOLO NOMBRES), `project list` y el setup del repo.
3. Compara lo que la cuenta tiene con lo que declara `config/cloudroom-pi-modelos.json`: sesión
   iniciada, claves de los proveedores gratuitos, proyecto del repo y modelos disponibles.
4. Aplica lo seguro y sin cupo: `cloud setup set < scripts/cloudroom/setup-nube.sh` (idempotente)
   y `cloud check`. Nunca abre hilos: eso gasta los 100 del ciclo y lo decide `cloudroom_lanzar`.
5. Dice lo que solo puede hacer Alex (iniciar sesión, poner claves con `cloud env set NOMBRE`).

Nunca imprime ni guarda valores de claves. Las decisiones son puras (`test_cloudroom_config.py`).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import cloudroom_modelos as CM  # noqa: E402
import medio_cloudroom  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
TOPE_CLI_S = 60
USO = "uso: cloudroom_config.py [estado|aplicar|probar] [--json]"


def sesion_iniciada(estado):
    """PURA: la cuenta de Cloudroom tiene sesión iniciada según `cloud status --json`."""
    d = estado.get("data", estado) if isinstance(estado, dict) else {}
    if not isinstance(d, dict):
        return False
    login = d.get("authenticated", d.get("logged_in", d.get("signed_in")))
    return bool(login or d.get("user") or d.get("account"))


def proyecto_de(proyectos, raiz):
    """PURA: id del proyecto de Cloudroom cuya fuente local es `raiz`; "" si no hay."""
    lista = (proyectos if isinstance(proyectos, list)
             else (proyectos or {}).get("projects", []) if isinstance(proyectos, dict) else [])
    destino = os.path.realpath(raiz)
    for p in lista or []:
        if not isinstance(p, dict):
            continue
        for fuente in p.get("sources") or []:
            if (isinstance(fuente, dict) and fuente.get("path")
                    and os.path.realpath(str(fuente["path"])) == destino):
                return str(p.get("id") or "")
    return ""


def modelos_nube(estado):
    """PURA: [(harness, modelo)] que la cuenta lista en la nube (`cloud status --json`)."""
    return [(h, m) for h, _d, modelos in CM.harnesses_nube(estado) for m in modelos]


def claves_faltantes(declaradas, nombres):
    """PURA: NOMBRES de variables declaradas que la nube aún no tiene. `nombres=None` (no se pudo
    leer la lista) devuelve []: no se inventa lo que falta ni se pide una clave a ciegas."""
    if nombres is None:
        return []
    return sorted({str(v) for v in (declaradas or {}).values() if v and str(v) not in nombres})


def plan(estado_nube, nombres_env, proyectos, raiz, declaradas, setup_existe=True):
    """PURA: qué tiene Cloudroom y qué falta para servir hilos al enjambre. `requiere_alex` son los
    pasos que solo puede dar el dueño de la cuenta; `acciones` lo que el script aplica sin cupo."""
    sesion = sesion_iniciada(estado_nube)
    faltan = claves_faltantes(declaradas, nombres_env)
    proyecto = proyecto_de(proyectos, raiz)
    modelos = modelos_nube(estado_nube)
    requiere, acciones = [], []
    if not sesion:
        requiere.append("inicia sesión en la app Cloudroom")
    if not setup_existe:
        requiere.append("falta scripts/cloudroom/setup-nube.sh en el repo")
    elif sesion:
        acciones.append({"que": "escribir la config de los sandboxes", "orden": ["cloud", "setup", "set"]})
    if faltan:
        requiere.append("pon las claves en la nube (solo Alex): "
                        + ", ".join("cloud env set %s" % n for n in faltan))
    if not proyecto:
        requiere.append("conecta el repo en la app (ningún proyecto tiene la carpeta %s)" % raiz)
    if sesion and not modelos:
        requiere.append("conecta un agente (Codex, opencode o Pi) en la app")
    if sesion:
        acciones.append({"que": "validar la cuenta y los agentes", "orden": ["cloud", "check"]})
    listo = bool(sesion and setup_existe and proyecto and modelos)
    return {"sesion": sesion, "proyecto": proyecto, "modelos": ["%s/%s" % x for x in modelos],
            "claves_faltan": faltan, "requiere_alex": requiere, "acciones": acciones,
            "listo": listo, "completo": listo and not faltan}


def texto_plan(p):
    """PURA: el parte legible del plan (nombres de variables, nunca valores)."""
    lineas = ["Cloudroom: %s" % ("listo" if p["listo"] else "falta configuración")]
    lineas.append("· sesión: %s" % ("iniciada" if p["sesion"] else "sin iniciar"))
    lineas.append("· proyecto del repo: %s" % (p["proyecto"] or "sin conectar"))
    lineas.append("· modelos en la nube: %s" % (", ".join(p["modelos"][:8]) or "ninguno"))
    if p["claves_faltan"]:
        lineas.append("· claves que faltan (solo nombres): %s" % ", ".join(p["claves_faltan"]))
    lineas.extend("→ Alex: %s" % r for r in p["requiere_alex"])
    return "\n".join(lineas)


def _json(run, orden, timeout=TOPE_CLI_S, cwd=None):
    """(JSON, error) de una orden de room-cli; nunca lanza."""
    try:
        p = run(orden, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        if p.returncode:
            cola = (p.stderr or p.stdout or "").strip().splitlines() or ["salió con %s" % p.returncode]
            return None, cola[-1][:200]
        return json.loads(p.stdout or "null"), ""
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        return None, type(e).__name__


def _ejecutar(run, orden, entrada=None, timeout=TOPE_CLI_S, cwd=None):
    """(ok, error) de una orden que cambia algo; la entrada (el setup) va por la entrada estándar."""
    try:
        p = run(orden, input=entrada, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        if not p.returncode:
            return True, ""
        cola = (p.stderr or p.stdout or "").strip().splitlines() or ["salió con %s" % p.returncode]
        return False, cola[-1][:200]
    except (OSError, subprocess.SubprocessError) as e:
        return False, type(e).__name__


def configurar(seco=False, run=subprocess.run, cli=None, raiz=None, setup=None, declaradas=None):
    """Lee la cuenta y, si no es en seco, aplica setup y check (nunca abre hilos). Devuelve
    {"estado", "plan", "aplicado", "errores"}; `estado` es listo, usable, requiere_alex o no_disponible."""
    raiz = os.path.realpath(raiz or RAIZ)
    setup = setup or os.path.join(raiz, "scripts", "cloudroom", "setup-nube.sh")
    cli = cli if cli is not None else medio_cloudroom.cli_path()
    res = {"estado": "no_disponible", "plan": None, "aplicado": [], "errores": []}
    if not cli:
        res["errores"].append("app sin instalar")
        return res
    estado, err = _json(run, [cli, "cloud", "status", "--json"], cwd=raiz)
    if estado is None:
        res["errores"].append(err or "sin cloud status")
    env, _err_env = _json(run, [cli, "cloud", "env", "list", "--json"], cwd=raiz)
    proyectos, _err_proy = _json(run, [cli, "project", "list", "--json"], cwd=raiz)
    try:
        with open(setup, encoding="utf-8") as f:
            texto = f.read()
    except OSError:
        texto = ""
    p = plan(estado, CM.nombres_env(env), proyectos, raiz,
             CM.claves_declaradas() if declaradas is None else declaradas, bool(texto))
    res["plan"] = p
    res["estado"] = "listo" if p["completo"] else ("usable" if p["listo"] else "requiere_alex")
    if seco:
        return res
    if texto and p["sesion"]:
        ok, e = _ejecutar(run, [cli, "cloud", "setup", "set"], texto, cwd=raiz)
        res["aplicado"].append({"orden": [cli, "cloud", "setup", "set"], "ok": ok})
        if not ok:
            res["errores"].append("setup: %s" % e)
    if p["sesion"]:
        ok, e = _ejecutar(run, [cli, "cloud", "check"], cwd=raiz)
        res["aplicado"].append({"orden": [cli, "cloud", "check"], "ok": ok})
        if not ok:
            res["errores"].append("check: %s" % e)
    return res


def main(argv):
    accion = next((a for a in argv if not a.startswith("-")), "estado")
    if accion not in ("estado", "aplicar", "probar"):
        raise SystemExit(USO)
    r = configurar(seco=accion == "estado")
    p = r.get("plan")
    if p is None:
        texto = "Cloudroom: no disponible (%s)" % ("; ".join(r["errores"]) or "sin plan")
        print(json.dumps(r, ensure_ascii=False) if "--json" in argv else texto)
        return 0 if accion == "estado" else 1
    if accion == "probar":
        ok = bool(p.get("listo"))
        texto = texto_plan(p) + "\nprueba: %s" % ("OK" if ok else "falta configuración")
        print(json.dumps(dict(r, prueba=ok), ensure_ascii=False) if "--json" in argv else texto)
        return 0 if ok else 1
    print(json.dumps(r, ensure_ascii=False) if "--json" in argv else texto_plan(p))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
