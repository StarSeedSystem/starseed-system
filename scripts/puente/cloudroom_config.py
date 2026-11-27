#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configura y activa Cloudroom como medio del enjambre (CAP1119).

Dice si Cloudroom puede lanzar agentes y qué le falta: app, sesión, proyecto del
repo, agente conectado, claves (solo NOMBRES) y setup de modelos gratuitos.
`configurar --aplicar` aplica lo que un director puede hacer solo (escribir el
setup de modelos) y guarda la activación en `~/.starseed/cloudroom-config.json`;
las claves y los inicios de sesión salen como el comando exacto para Maggasukha,
nunca se piden por chat ni se imprimen valores.

  python3 scripts/puente/cloudroom_config.py [estado|configurar] [--aplicar] [--json]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from contextlib import nullcontext

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_PI = os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json")
SETUP = os.path.join(RAIZ, "scripts", "cloudroom", "setup-nube.sh")
RUTA = os.path.expanduser("~/.starseed/cloudroom-config.json")


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def defectos(ruta_pi=None):
    """Configuración base: repo, guion de setup y claves/modelos de Pi (solo nombres)."""
    d = _leer_json(ruta_pi or CONFIG_PI, {})
    d = d if isinstance(d, dict) else {}
    return {
        "activo": False,
        "repo": RAIZ,
        "setup": SETUP,
        "claves": {str(k).lower(): str(v) for k, v in (d.get("claves") or {}).items() if isinstance(v, str) and v},
        "modelos": [m for m in d.get("modelos") or [] if isinstance(m, str) and m.strip()],
        "setup_aplicado_t": 0,
        "activado_t": 0,
    }


def leer(ruta=RUTA):
    """Configuración guardada sobre la base; ignora lo que no sea del tipo esperado."""
    cfg, g = defectos(), _leer_json(ruta, {})
    g = g if isinstance(g, dict) else {}
    if isinstance(g.get("activo"), bool):
        cfg["activo"] = g["activo"]
    if isinstance(g.get("repo"), str) and g["repo"].strip():
        cfg["repo"] = g["repo"].strip()
    if isinstance(g.get("setup"), str) and g["setup"].strip():
        cfg["setup"] = g["setup"].strip()
    if isinstance(g.get("claves"), dict):
        cfg["claves"] = {str(a).lower(): b for a, b in g["claves"].items() if isinstance(b, str) and b}
    if isinstance(g.get("modelos"), list):
        cfg["modelos"] = [m for m in g["modelos"] if isinstance(m, str) and m.strip()]
    for k in ("setup_aplicado_t", "activado_t"):
        if isinstance(g.get(k), (int, float)) and not isinstance(g.get(k), bool):
            cfg[k] = float(g[k])
    return cfg


def _conectado(valor):
    """PURA: un conector está listo si no es un objeto que se declare desconectado."""
    if isinstance(valor, dict):
        return bool(valor.get("connected", valor.get("authenticated", True)))
    return bool(valor)


def pasos(estado, config):
    """PURA: qué está listo y qué falta para configurar y activar Cloudroom."""
    e = estado if isinstance(estado, dict) else {}
    cfg = config if isinstance(config, dict) else {}
    nube = e.get("nube") or {}
    nube = nube if isinstance(nube, dict) else {}
    cli, repo = str(e.get("cli") or ""), cfg.get("repo") or RAIZ
    login = bool(nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
                 or nube.get("user") or nube.get("account"))
    agentes = [h for h in nube.get("harnesses") or [] if isinstance(h, dict)
               and h.get("available") is not False and h.get("connected") is not False]
    nombres = e.get("env") if isinstance(e.get("env"), (set, list, tuple)) else None
    proyectos = e.get("proyectos")
    lista = proyectos if isinstance(proyectos, list) else (proyectos or {}).get("projects", []) if isinstance(proyectos, dict) else []
    destino = os.path.realpath(repo)
    proyecto = next((str(p.get("id") or "sí") for p in lista if isinstance(p, dict)
                     for f in p.get("sources") or [] if isinstance(f, dict) and f.get("path")
                     and os.path.realpath(str(f["path"])) == destino), "")
    out = []

    def paso(pid, titulo, est, detalle, obligatorio=True, comando=None, manual=False, entrada=""):
        out.append({"id": pid, "titulo": titulo, "estado": est, "detalle": detalle, "obligatorio": obligatorio,
                    "comando": list(comando or []), "manual": manual, "entrada": entrada})

    paso("app", "App de Cloudroom", "listo" if cli else "requiere_alex",
         cli or "instala Cloudroom (macOS Apple Silicon o Linux x64)")
    paso("sesion", "Sesión de la cuenta", "listo" if login else "requiere_alex",
         "cuenta conectada" if login else "inicia sesión en la app Cloudroom")
    paso("agente", "Agente conectado", "listo" if agentes else "requiere_alex",
         "%d agente(s) en la nube" % len(agentes) if agentes else "conecta Claude Code, Codex u opencode en la app",
         obligatorio=False)
    paso("github", "GitHub conectado", "listo" if _conectado(nube.get("github")) else "requiere_alex",
         "GitHub conectado" if _conectado(nube.get("github")) else "conecta GitHub en la app (los hilos empujan su rama)",
         obligatorio=False)
    paso("proyecto", "Proyecto del repo", "listo" if proyecto else "requiere_alex",
         "proyecto %s" % proyecto if proyecto else "conecta la carpeta %s en la app" % repo)
    for prov, var in sorted((cfg.get("claves") or {}).items()):
        presente = nombres is not None and var in nombres
        paso("clave:%s" % var, "Clave %s" % prov, "listo" if presente else "falta",
             "presente en la nube" if presente else
             "ponla con `room-cli cloud env set %s` (valor por la entrada estándar)" % var,
             obligatorio=False, comando=["room-cli", "cloud", "env", "set", var], manual=True)
    aplicado = float(cfg.get("setup_aplicado_t") or 0) > 0
    paso("modelos", "Modelos gratuitos (Pi)", "listo" if aplicado else "falta",
         "setup aplicado" if aplicado else "aplica %s en la nube" % os.path.basename(str(cfg.get("setup") or SETUP)),
         obligatorio=False, comando=["room-cli", "cloud", "setup", "set"], entrada=str(cfg.get("setup") or SETUP))
    return out


def activacion(pasos_):
    """PURA: si Cloudroom se puede activar (obligatorios listos) y qué queda para el parte."""
    lista = list(pasos_ or [])
    faltan = [p["id"] for p in lista if p.get("obligatorio") and p.get("estado") != "listo"]
    manuales = [p["id"] for p in lista if p.get("estado") != "listo" and p.get("manual")]
    listos = sum(1 for p in lista if p.get("estado") == "listo")
    if faltan:
        texto = "Cloudroom aún no se puede activar: falta %s" % ", ".join(faltan)
    elif manuales:
        texto = "Cloudroom se puede activar; quedan claves por poner (%s)" % ", ".join(manuales)
    else:
        texto = "Cloudroom listo para activar (%d/%d pasos)" % (listos, len(lista))
    return {"activar": not faltan, "listos": listos, "total": len(lista),
            "faltan": faltan, "manuales": manuales, "texto": texto}


def comandos(pasos_):
    """PURA: órdenes que un director puede aplicar solo, con su entrada estándar si la piden."""
    return [{"argv": p["comando"], "entrada": p.get("entrada") or ""} for p in pasos_ or []
            if p.get("comando") and not p.get("manual") and p.get("estado") != "listo"]


def _cli_json(run, cli, args, timeout=45):
    try:
        p = run([cli, *args, "--json"], capture_output=True, text=True, timeout=timeout)
        return json.loads(p.stdout) if p.returncode == 0 else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def sondear(run=subprocess.run, env=None):
    """Lee app, cuenta, proyectos y NOMBRES de claves; nunca lanza ni imprime valores."""
    import medio_cloudroom

    cli = medio_cloudroom.cli_path(env)
    if not cli:
        return {"cli": "", "nube": None, "proyectos": None, "env": None}
    lista = _cli_json(run, cli, ["cloud", "env", "list"])
    datos = lista.get("data", lista) if isinstance(lista, dict) else None
    nombres = ({str(v.get("name")) for v in datos["variables"]
                if isinstance(v, dict) and v.get("name")}
               if isinstance(datos, dict) and isinstance(datos.get("variables"), list) else None)
    return {"cli": cli, "nube": _cli_json(run, cli, ["cloud", "status"]),
            "proyectos": _cli_json(run, cli, ["project", "list"]), "env": nombres}


def configurar(aplicar=False, run=subprocess.run, env=None, ruta=RUTA):
    """Sondea, calcula el plan y, con `aplicar`, ejecuta lo automático y guarda la activación."""
    cfg = leer(ruta)
    e = sondear(run=run, env=env)
    plan = pasos(e, cfg)
    act, aplicados, errores = activacion(plan), [], []
    if aplicar and e.get("cli"):
        for o in comandos(plan):
            try:
                with (open(o["entrada"], encoding="utf-8") if o["entrada"] else nullcontext()) as f:
                    kw = {"stdin": f} if o["entrada"] else {}
                    p = run(o["argv"], capture_output=True, text=True, timeout=120, **kw)
                if p.returncode == 0:
                    aplicados.append(" ".join(o["argv"]))
                    if o["argv"][1:3] == ["cloud", "setup"]:
                        cfg["setup_aplicado_t"] = time.time()
                else:
                    errores.append(" ".join(o["argv"]))
            except (OSError, subprocess.SubprocessError) as err:
                errores.append("%s: %s" % (" ".join(o["argv"]), type(err).__name__))
        if act["activar"]:
            cfg = dict(cfg, activo=True, activado_t=time.time())
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=1)
    return {"plan": plan, "activacion": act, "aplicados": aplicados, "errores": errores, "config": cfg}


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    r = configurar(aplicar="--aplicar" in argv)
    if "--json" in argv:
        print(json.dumps(r, ensure_ascii=False))
    else:
        for p in r["plan"]:
            print("%-12s %s · %s" % (p["estado"], p["id"], p["detalle"]))
        print(r["activacion"]["texto"])
        for o in comandos(r["plan"]):
            print("  → %s" % " ".join(o["argv"]))
        for e in r["errores"]:
            print("  ! %s" % e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
