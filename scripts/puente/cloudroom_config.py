#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y activación de Cloudroom (CAP1119).

Reúne lo que Cloudroom necesita para servir agentes al enjambre: la ruta de `room-cli`,
el cupo del plan gratis, el script que escribe los proveedores gratuitos en cada sandbox
y las VARIABLES de entorno (solo NOMBRES) que deben existir en la nube. Guarda
`~/.starseed/cloudroom-config.json` con validación y comprueba la activación sin
ejecutar la CLI cuando se le inyecta un `run` falso.

Módulo de servidor: nunca guarda claves, solo nombres de variable.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

try:
    from medidor_cloudroom import ruta_cli
except ImportError:  # pragma: no cover - solo si se mueve el módulo hermano
    def ruta_cli(entorno=None, existe=None, buscar=None):
        import shutil

        entorno = os.environ if entorno is None else entorno
        existe = existe or os.path.exists
        buscar = buscar or shutil.which
        for candidata in (entorno.get("CLOUDROOM_CLI"), os.path.expanduser("~/.local/bin/room-cli")):
            if candidata and existe(candidata):
                return candidata
        return buscar("room-cli")

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SETUP = os.path.join(RAIZ, "scripts", "cloudroom", "setup-nube.sh")
PI_MODELOS = os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json")
RUTA_DEFECTO = os.path.expanduser("~/.starseed/cloudroom-config.json")
CUPO_GRATIS = 100
CICLO_DIAS = 30
TOPE_S = int(os.environ.get("STARSEED_CLOUDROOM_TOPE_S", "45") or 45)

DEFAULTS = {
    "activo": True,
    "cli": "",
    "aplicar_setup": True,
    "cupo_nube": CUPO_GRATIS,
    "ciclo_dias": CICLO_DIAS,
}

PATRON_ENV = re.compile(r"\{env:([A-Za-z_][A-Za-z0-9_]*)\}")
PATRON_CLAVE = re.compile(r"\$([A-Z][A-Z0-9_]*_KEY)\b")


def variables_necesarias(texto_setup, config_pi=None):
    """PURA: NOMBRES de variable que piden el setup y los modelos de Pi, sin repetir."""
    nombres = PATRON_ENV.findall(texto_setup or "") + PATRON_CLAVE.findall(texto_setup or "")
    claves = (config_pi or {}).get("claves") if isinstance(config_pi, dict) else None
    if isinstance(claves, dict):
        nombres.extend(str(v) for v in claves.values() if isinstance(v, str))
    vistas, fuera = set(), []
    for nombre in nombres:
        if nombre and nombre.endswith("_KEY") and nombre not in vistas:
            vistas.add(nombre)
            fuera.append(nombre)
    return fuera


def validar(raw):
    """PURA: errores de una configuración candidata ([] si es válida)."""
    if not isinstance(raw, dict):
        return False, ["La configuración debe ser un objeto JSON"]
    errores = []
    if "activo" in raw and not isinstance(raw["activo"], bool):
        errores.append("'activo' debe ser booleano")
    if "aplicar_setup" in raw and not isinstance(raw["aplicar_setup"], bool):
        errores.append("'aplicar_setup' debe ser booleano")
    if "cli" in raw and not isinstance(raw["cli"], str):
        errores.append("'cli' debe ser texto (ruta o vacío)")
    for clave in ("cupo_nube", "ciclo_dias"):
        if clave in raw and not _entero(raw[clave], 1):
            errores.append("'%s' debe ser un entero ≥ 1" % clave)
    return not errores, errores


def _entero(valor, minimo):
    return isinstance(valor, int) and not isinstance(valor, bool) and valor >= minimo


def fusionar(base, parcial):
    """PURA: aplica `parcial` sobre `base` descartando lo inválido con avisos."""
    cfg = json.loads(json.dumps(base if isinstance(base, dict) else DEFAULTS))
    avisos = []
    if not isinstance(parcial, dict):
        return cfg, avisos
    if "activo" in parcial:
        if isinstance(parcial["activo"], bool):
            cfg["activo"] = parcial["activo"]
        else:
            avisos.append("'activo' inválido; se conserva el anterior")
    if "aplicar_setup" in parcial:
        if isinstance(parcial["aplicar_setup"], bool):
            cfg["aplicar_setup"] = parcial["aplicar_setup"]
        else:
            avisos.append("'aplicar_setup' inválido; se conserva el anterior")
    if "cli" in parcial:
        if isinstance(parcial["cli"], str):
            cfg["cli"] = parcial["cli"].strip()
        else:
            avisos.append("'cli' inválido; se conserva el anterior")
    for clave in ("cupo_nube", "ciclo_dias"):
        if clave in parcial:
            if _entero(parcial[clave], 1):
                cfg[clave] = parcial[clave]
            else:
                avisos.append("'%s' inválido; se conserva el anterior" % clave)
    return cfg, avisos


def cargar(ruta=None):
    """Carga la configuración de disco fusionándola con DEFAULTS."""
    try:
        with open(ruta or RUTA_DEFECTO, encoding="utf-8") as f:
            datos = json.loads(f.read())
    except (OSError, ValueError):
        return json.loads(json.dumps(DEFAULTS)), []
    return fusionar(DEFAULTS, datos)


def guardar(cfg, ruta=None):
    """Valida, normaliza y guarda atómicamente en disco."""
    normalizada, _ = fusionar(DEFAULTS, cfg)
    destino = ruta or RUTA_DEFECTO
    carpeta = os.path.dirname(destino)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    tmp = "%s.tmp-%d" % (destino, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(normalizada, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, destino)
    return normalizada


def nombres_env(lista_env):
    """NOMBRES de `room-cli cloud env list --json`; None si no se pudo leer."""
    d = lista_env.get("data", lista_env) if isinstance(lista_env, dict) else None
    if not isinstance(d, dict) or not isinstance(d.get("variables"), list):
        return None
    return {str(v.get("name")) for v in d["variables"] if isinstance(v, dict) and v.get("name")}


def interpretar(cfg, cli, nube, lista_env, hilos, variables, errores=()):
    """PURA: salidas de `room-cli` → estado de activación y siguiente paso."""
    cfg = cfg if isinstance(cfg, dict) else DEFAULTS
    cupo = cfg.get("cupo_nube", CUPO_GRATIS)
    ciclo = cfg.get("ciclo_dias", CICLO_DIAS)
    base = {
        "listo": False, "cli": cli or "", "sesion": False, "hilos": 0,
        "cupo": {"nube": cupo, "ciclo_dias": ciclo}, "variables_faltantes": [],
        "avisos": [], "siguiente_paso": "", "detalle": "",
    }
    motivo = next((str(e) for e in errores if e), "")
    if not cli:
        base["avisos"].append(motivo or "room-cli no encontrado")
        base["siguiente_paso"] = "instala Cloudroom y su CLI room-cli (https://cloudroom.dev)"
        return base
    if nube is None:
        base["avisos"].append(motivo or "Cloudroom no contestó")
        base["siguiente_paso"] = "abre Cloudroom e inicia sesión (la persona, no el agente)"
        return base
    if not isinstance(nube, dict):
        base["avisos"].append("respuesta inválida de room-cli cloud status")
        base["siguiente_paso"] = "actualiza room-cli o revisa la salida de cloud status"
        return base
    login = nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
    base["sesion"] = bool(login or nube.get("user") or nube.get("account"))
    if not base["sesion"]:
        base["siguiente_paso"] = "inicia sesión en Cloudroom (la persona, no el agente)"
        return base
    cuenta = (hilos or {}).get("count", 0) if isinstance(hilos, dict) else 0
    base["hilos"] = cuenta if _entero(cuenta, 0) else 0
    nombres = nombres_env(lista_env)
    if nombres is None:
        base["avisos"].append("no se pudo leer `cloud env list`: no se comprobaron las claves")
    else:
        base["variables_faltantes"] = [v for v in variables or [] if v not in nombres]
    if base["variables_faltantes"]:
        base["siguiente_paso"] = (
            "añade en la nube las claves que faltan con `room-cli cloud env set NOMBRE` "
            "(el valor por la entrada estándar): " + ", ".join(base["variables_faltantes"])
        )
        base["detalle"] = "cuenta conectada · faltan %d clave(s)" % len(base["variables_faltantes"])
        return base
    base["listo"] = True
    base["detalle"] = "cuenta conectada · %d hilo(s) abierto(s) · %d por ciclo de %d días" % (
        base["hilos"], cupo, ciclo)
    if not cfg.get("activo", True):
        base["listo"] = False
        base["detalle"] = "Cloudroom desactivado en la configuración · %d hilo(s) abierto(s)" % base["hilos"]
        base["siguiente_paso"] = "pon `activo: true` en ~/.starseed/cloudroom-config.json"
    return base


def _leer(ruta, defecto=""):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return defecto


def _config_pi(texto):
    try:
        d = json.loads(texto or "{}")
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def _variables_de_disco(leer, existe):
    setup = leer(SETUP, "") if existe(SETUP) else ""
    pi = _config_pi(leer(PI_MODELOS, "") if existe(PI_MODELOS) else "")
    return variables_necesarias(setup, pi)


def _pedir(run, cli, args, entrada=None):
    extra = {"input": entrada} if entrada is not None else {}
    try:
        p = run([cli, *args], capture_output=True, text=True, timeout=TOPE_S, **extra)
    except (OSError, subprocess.TimeoutExpired) as e:
        return None, type(e).__name__
    if p.returncode != 0:
        return None, (p.stderr or "comando fallido").strip()
    try:
        return json.loads(p.stdout or "{}"), ""
    except ValueError:
        return None, "respuesta inválida"


def estado(cfg=None, run=None, env=None, existe=None, buscar=None, leer=None):
    """Comprueba si Cloudroom está configurado y activo (solo lee, nunca aplica el setup)."""
    run = run or subprocess.run
    existe = existe or os.path.isfile
    leer = leer or _leer
    cfg = cfg if isinstance(cfg, dict) else cargar()[0]
    cli = cfg.get("cli") or ruta_cli(env, existe, buscar)
    variables = _variables_de_disco(leer, existe)
    if not cli:
        return interpretar(cfg, "", None, None, None, variables, ("room-cli no encontrado",))
    nube, e1 = _pedir(run, cli, ["cloud", "status", "--json"])
    lista, e2 = _pedir(run, cli, ["cloud", "env", "list", "--json"])
    hilos, e3 = _pedir(run, cli, ["thread", "count", "--json"])
    return interpretar(cfg, cli, nube, lista, hilos, variables, (e1, e2, e3))


def activar(cfg=None, run=None, env=None, existe=None, buscar=None, leer=None):
    """Aplica el setup de la nube (si toca) y devuelve el estado resultante."""
    run = run or subprocess.run
    existe = existe or os.path.isfile
    leer = leer or _leer
    cfg = cfg if isinstance(cfg, dict) else cargar()[0]
    cli = cfg.get("cli") or ruta_cli(env, existe, buscar)
    aviso = ""
    if cli and cfg.get("activo", True) and cfg.get("aplicar_setup", True) and existe(SETUP):
        texto = leer(SETUP, "")
        if texto:
            _, error = _pedir(run, cli, ["cloud", "setup", "set"], entrada=texto)
            aviso = error
    resultado = estado(cfg=dict(cfg, cli=cli), run=run, env=env,
                       existe=existe, buscar=buscar, leer=leer)
    if aviso:
        resultado["avisos"].append("no se pudo aplicar el setup: " + aviso)
    return resultado


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    resultado = activar() if args and args[0] in ("activar", "aplicar") else estado()
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    return 0 if resultado.get("listo") else 1


if __name__ == "__main__":
    raise SystemExit(main())
