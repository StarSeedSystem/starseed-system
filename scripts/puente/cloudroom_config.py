#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y activación de Cloudroom (CAP1119).

Lee `config/cloudroom-pi-modelos.json`, lo valida y dice si Cloudroom está listo para
recibir tareas: CLI y sesión, proyecto conectado, claves de cada proveedor en la nube
(solo NOMBRES de variable) y al menos un modelo utilizable. `activar` abre la app si
hace falta y vuelve a sondear; nunca escribe claves ni valores secretos.

  revisar  → informe {listo, faltan, pasos, modelos, avisos}
  activar  → lo mismo, abriendo antes la app si no estaba disponible
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json")

DEFAULTS = {"modelos": [], "claves": {}, "simultaneos": {}}
VAR_ENV = re.compile(r"^[A-Z][A-Z0-9_]*$")


def _es_modelo(v):
    return isinstance(v, str) and "/" in v and " " not in v.strip() and bool(v.strip())


def _es_clave(v):
    return isinstance(v, str) and bool(VAR_ENV.match(v))


def _es_tope(v):
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def validar(datos):
    """Errores de una configuración (lista vacía si es válida). Ignora bloques ausentes."""
    if not isinstance(datos, dict):
        return ["la configuración debe ser un objeto JSON"]
    errores = []
    if "modelos" in datos:
        m = datos["modelos"]
        if not isinstance(m, list) or not all(_es_modelo(x) for x in m):
            errores.append("'modelos' debe ser una lista de «proveedor/modelo»")
    if "claves" in datos:
        c = datos["claves"]
        if not isinstance(c, dict) or not all(_es_clave(v) for v in c.values()):
            errores.append("'claves' debe mapear proveedor → NOMBRE_DE_VARIABLE")
    if "simultaneos" in datos:
        s = datos["simultaneos"]
        if not isinstance(s, dict) or not all(_es_tope(v) for v in s.values()):
            errores.append("'simultaneos' debe mapear proveedor → entero >= 0")
    if "_retirados" in datos:
        r = datos["_retirados"]
        if not isinstance(r, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in r.items()
        ):
            errores.append("'_retirados' debe ser un objeto de texto → motivo")
    return errores


def _copia(d):
    return json.loads(json.dumps(d))


def cargar(ruta=None):
    """(cfg, avisos): fusiona el JSON sobre DEFAULTS y descarta lo inválido con su aviso."""
    cfg, avisos = _copia(DEFAULTS), []
    try:
        with open(ruta or CONFIG, encoding="utf-8") as fh:
            datos = json.load(fh)
    except (OSError, ValueError):
        return cfg, avisos
    if not isinstance(datos, dict):
        return cfg, avisos
    if isinstance(datos.get("modelos"), list):
        cfg["modelos"] = [m for m in datos["modelos"] if _es_modelo(m)]
        if len(cfg["modelos"]) != len(datos["modelos"]):
            avisos.append("'modelos' tiene entradas inválidas, se descartan")
    elif "modelos" in datos:
        avisos.append("'modelos' no es una lista, se usa la de por defecto")
    for bloque, valida, aviso in (
        ("claves", _es_clave, "'claves.%s' no es un NOMBRE_DE_VARIABLE, se descarta"),
        ("simultaneos", _es_tope, "'simultaneos.%s' no es un entero >= 0, se descarta"),
    ):
        if isinstance(datos.get(bloque), dict):
            for k, v in datos[bloque].items():
                if valida(v):
                    cfg[bloque][k] = v
                else:
                    avisos.append(aviso % k)
        elif bloque in datos:
            avisos.append("'%s' no es un objeto, se ignora" % bloque)
    if isinstance(datos.get("_retirados"), dict):
        cfg["_retirados"] = {
            k: v for k, v in datos["_retirados"].items()
            if isinstance(k, str) and isinstance(v, str)
        }
    return cfg, avisos


def faltan_claves(claves, nombres_env):
    """Proveedores cuya variable no aparece en la nube. Sin lectura (`None`) no se acusa a nadie."""
    if nombres_env is None:
        return []
    return sorted(p for p, var in (claves or {}).items() if var and var not in nombres_env)


def modelos_listos(cfg, nombres_env):
    """Modelos cuyo proveedor tiene su clave en la nube (o que no pide una clave conocida)."""
    claves = (cfg or {}).get("claves") or {}
    salida = []
    for m in (cfg or {}).get("modelos") or []:
        var = claves.get(str(m).split("/", 1)[0].lower(), "")
        if (nombres_env is None or not var or var in nombres_env) and m not in salida:
            salida.append(m)
    return salida


def revisar(medio, nombres_env, cfg, proyecto="", avisos=()):
    """Informe de si Cloudroom puede recibir tareas y qué falta, con pasos sin valores secretos."""
    medio = medio if isinstance(medio, dict) else {}
    cfg = cfg if isinstance(cfg, dict) else {}
    faltan, pasos = [], []
    if medio.get("estado") != "usable":
        faltan.append("CLI/sesión: %s" % (medio.get("detalle") or "Cloudroom no está disponible"))
        if medio.get("siguiente_paso"):
            pasos.append(str(medio["siguiente_paso"]))
    if not proyecto:
        faltan.append("proyecto conectado")
        pasos.append(
            "conecta la carpeta del repo en la app Cloudroom o fija STARSEED_CLOUDROOM_PROYECTO"
        )
    claves = cfg.get("claves") or {}
    for prov in faltan_claves(claves, nombres_env):
        faltan.append("clave de %s en la nube" % prov)
        pasos.append(
            "pon la clave de %s: `room-cli cloud env set %s` (el valor por la entrada estándar)"
            % (prov, claves[prov])
        )
    listos = modelos_listos(cfg, nombres_env)
    if not listos:
        faltan.append("ningún modelo utilizable")
        pasos.append("declara modelos en config/cloudroom-pi-modelos.json y pon sus claves")
    return {"listo": not faltan, "faltan": faltan, "pasos": pasos, "modelos": listos,
            "avisos": list(avisos or ())}


def activar(medio, run=subprocess.run, abrir=None, sondear=None):
    """Si el medio no está usable, abre la app y vuelve a sondear. Nunca toca claves."""
    import medio_cloudroom

    sondear = sondear or medio_cloudroom.sondear
    medio = medio if isinstance(medio, dict) else {}
    if medio.get("estado") == "usable":
        return medio, False
    try:
        abierto = bool((abrir or medio_cloudroom.abrir_app)(run))
    except (OSError, subprocess.SubprocessError):
        abierto = False
    if not abierto:
        return medio, False
    return sondear(run=run), True


def _json_cli(run, cli, args, timeout=45):
    """JSON de una orden de `room-cli`; None si no se pudo leer. Nunca lanza."""
    try:
        p = run([cli, *args, "--json"], capture_output=True, text=True, timeout=timeout)
        return json.loads(p.stdout) if p.returncode == 0 else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def estado_en_vivo(run=subprocess.run, abrir=None):
    """(medio, nombres_env, cfg, proyecto, avisos) leídos del disco y de `room-cli`."""
    import medio_cloudroom
    import cloudroom_modelos as CM

    cfg, avisos = cargar()
    medio = medio_cloudroom.sondear(run=run, abrir=abrir)
    cli = medio_cloudroom.cli_path()
    nombres = CM.nombres_env(_json_cli(run, cli, ["cloud", "env", "list"])) if cli else None
    proyecto = os.environ.get("STARSEED_CLOUDROOM_PROYECTO", "")
    if not proyecto and cli:
        try:
            import cloudroom_lanzar as CL

            proyecto = CL.proyecto_del_repo(_json_cli(run, cli, ["project", "list"]), RAIZ)
        except (ImportError, OSError, subprocess.SubprocessError):
            proyecto = ""
    return medio, nombres, cfg, proyecto, avisos


def main(argv):
    if not argv or argv[0] not in ("revisar", "activar"):
        print("uso: cloudroom_config.py revisar|activar [--json]")
        return 2
    medio, nombres, cfg, proyecto, avisos = estado_en_vivo(abrir=lambda _r: False)
    if argv[0] == "activar":
        medio, _abierto = activar(medio)
    r = revisar(medio, nombres, cfg, proyecto, avisos)
    if "--json" in argv:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    elif r["listo"]:
        print("Cloudroom listo · %d modelo(s): %s" % (len(r["modelos"]), ", ".join(r["modelos"])))
    else:
        print("Cloudroom NO listo:")
        print("\n".join("· " + f for f in r["faltan"]))
        if r["pasos"]:
            print("\nPasos:\n" + "\n".join("· " + p for p in r["pasos"]))
    return 0 if r["listo"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
