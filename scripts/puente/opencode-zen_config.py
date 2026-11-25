#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · configura y comprueba el proveedor OpenCode Zen (CAP1119).

Zen es la capa gratuita de opencode (glm-5.3-flash, deepseek-v4.1-flash, minimax-m3.1-flash
y big-pickle). En la Mac basta `opencode auth login`; en el A1 y la nube la clave viaja como
OPENCODE_API_KEY y el proveedor debe estar en `~/.config/opencode/opencode.json` para que el
orquestador lo vea. Este guion lo declara sin pisar nada y dice, sin imprimir valores, qué
falta.

  opencode-zen_config.py estado [--json]
  opencode-zen_config.py aplicar [--entorno]
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import shutil
import tempfile

PROVEEDOR, NOMBRE = "opencode", "OpenCode Zen"
BASE_URL = "https://opencode.ai/inference/openai/v1"
NPM, VAR_CLAVE = "@ai-sdk/openai-compatible", "OPENCODE_API_KEY"
MODELOS_GRATIS = ("glm-5.3-flash-free", "deepseek-v4.1-flash-free",
                  "minimax-m3.1-flash-free", "big-pickle")
RUTA_CONFIG = "~/.config/opencode/opencode.json"
RUTA_AUTH = "~/.local/share/opencode/auth.json"
ARCHIVOS_CLAVE = ("~/.starseed/env", "~/.hermes/.env")


def bloque_proveedor(con_entorno=False):
    """PURA. Bloque `provider.opencode` con los cuatro modelos gratis.

    Sin `con_entorno` no toca opciones (la Mac usa auth.json); con él declara baseURL y
    `{env:OPENCODE_API_KEY}` para el A1 y la nube. Nunca lleva el valor de una clave.
    """
    bloque = {"name": NOMBRE, "models": {m: {"name": m} for m in MODELOS_GRATIS}}
    if con_entorno:
        bloque["npm"] = NPM
        bloque["options"] = {"baseURL": BASE_URL, "apiKey": "{env:%s}" % VAR_CLAVE}
    return bloque


def modelos_faltantes(config):
    """PURA. Modelos gratis que le faltan al bloque `provider.opencode`."""
    if not isinstance(config, dict):
        return list(MODELOS_GRATIS)
    proveedores = config.get("provider")
    bloque = proveedores.get(PROVEEDOR) if isinstance(proveedores, dict) else None
    crudo = bloque.get("models") if isinstance(bloque, dict) else None
    modelos = crudo if isinstance(crudo, dict) else {}
    return [m for m in MODELOS_GRATIS if m not in modelos]


def fusionar(config, con_entorno=False):
    """PURA. (config nueva, cambios). No muta la entrada; no pisa modelos ni apiKey ajenos."""
    nuevo = copy.deepcopy(config) if isinstance(config, dict) else {}
    if not isinstance(nuevo.get("provider"), dict):
        nuevo["provider"] = {}
    proveedores = nuevo["provider"]
    actual = proveedores.get(PROVEEDOR)
    if not isinstance(actual, dict):
        actual = {}
    deseado, cambios = bloque_proveedor(con_entorno), []
    for campo in ("npm", "name"):
        if campo in deseado and not actual.get(campo):
            actual[campo] = deseado[campo]
            cambios.append("%s.%s" % (PROVEEDOR, campo))
    opciones = actual.get("options")
    if not isinstance(opciones, dict):
        opciones = {}
    for campo, valor in (deseado.get("options") or {}).items():
        if not opciones.get(campo):
            opciones[campo] = valor
            cambios.append("%s.options.%s" % (PROVEEDOR, campo))
    if opciones:
        actual["options"] = opciones
    modelos = actual.get("models")
    if not isinstance(modelos, dict):
        modelos = {}
    for modelo, ficha in deseado["models"].items():
        if modelo not in modelos:
            modelos[modelo] = ficha
            cambios.append("%s.models.%s" % (PROVEEDOR, modelo))
    actual["models"] = modelos
    proveedores[PROVEEDOR] = actual
    return nuevo, cambios


def clave_presente(entorno=None, auth=None, textos_env=()):
    """PURA. ¿Existe la clave? En el entorno, en auth.json o en los textos de archivos.

    Una línea vacía (`OPENCODE_API_KEY=`) no cuenta: es el fallo silencioso que hay que ver.
    """
    if isinstance(entorno, dict) and str(entorno.get(VAR_CLAVE) or "").strip():
        return True
    if isinstance(auth, dict) and PROVEEDOR in auth:
        return True
    patron = re.compile(r"^\s*(?:export\s+)?%s\s*=\s*(.*)$" % VAR_CLAVE, re.MULTILINE)
    for texto in textos_env or ():
        if not isinstance(texto, str):
            continue
        for valor in patron.findall(texto):
            if valor.strip().strip('"').strip("'").strip():
                return True
    return False


def _parte(nombre, faltan, clave, detalle, paso):
    return {"proveedor": PROVEEDOR, "estado": nombre, "configurado": not faltan,
            "activo": bool(clave), "faltan": faltan, "detalle": detalle,
            "siguiente_paso": paso}


def estado(config, clave, instalado=True):
    """PURA. Estado y siguiente paso: no_disponible, requiere_alex, usable o listo."""
    faltan = modelos_faltantes(config)
    casos = (
        (not instalado, "no_disponible", "opencode no está instalado",
         "npm install -g opencode-ai@1.18.33"),
        (not faltan and clave, "listo", "configurado y con clave", ""),
        (not faltan, "requiere_alex", "configurado; falta la clave",
         "opencode auth login (OpenCode Zen) o OPENCODE_API_KEY en ~/.starseed/env"),
        (clave, "usable", "hay clave; falta declarar los modelos",
         "python3 scripts/puente/opencode-zen_config.py aplicar"),
        (True, "requiere_alex", "faltan el bloque y la clave",
         "python3 scripts/puente/opencode-zen_config.py aplicar && opencode auth login"),
    )
    for condicion, nombre, detalle, paso in casos:
        if condicion:
            return _parte(nombre, faltan, clave, detalle, paso)
    return _parte("requiere_alex", faltan, clave, "sin estado", "")


def leer_json(ruta, defecto=None):
    """Lee un JSON; si no existe o no vale, devuelve `defecto` (nunca lanza)."""
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        return defecto or {}
    return datos if isinstance(datos, dict) else (defecto or {})


def escribir_json(ruta, datos):
    """Escribe el JSON de forma atómica y con permisos de solo el dueño."""
    ruta = os.path.expanduser(ruta)
    directorio = os.path.dirname(ruta) or "."
    os.makedirs(directorio, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directorio, prefix=".opencode-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, ruta)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _textos(rutas):
    """Contenidos de los archivos de claves, para buscar NOMBRES. Nunca se imprimen."""
    fuera = []
    for ruta in rutas or ():
        try:
            with open(os.path.expanduser(ruta), encoding="utf-8", errors="replace") as f:
                fuera.append(f.read())
        except OSError:
            continue
    return fuera


def _config(ruta):
    """(datos, error). Si el archivo existe y no es un objeto JSON válido, NO se toca."""
    ruta = os.path.expanduser(ruta)
    if not os.path.exists(ruta):
        return {}, ""
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError) as exc:
        return {}, "opencode.json ilegible (%s); no se sobrescribe" % type(exc).__name__
    return (datos, "") if isinstance(datos, dict) else ({}, "opencode.json no es un objeto JSON")


def aplicar(ruta=RUTA_CONFIG, auth=RUTA_AUTH, archivos=ARCHIVOS_CLAVE, entorno=None,
            con_entorno=None, instalado=None):
    """E/S. Fusiona el bloque de Zen en opencode.json y devuelve el parte, sin secretos.

    `con_entorno=None` lo deduce: si auth.json ya tiene la sesión de opencode (la Mac) se deja
    el proveedor integrado intacto; si no, y la clave está en el entorno o en los archivos, se
    declara `{env:OPENCODE_API_KEY}` para el A1 y la nube.
    """
    entorno = dict(os.environ) if entorno is None else dict(entorno)
    textos = _textos(archivos)
    auth_datos = leer_json(auth)
    clave = clave_presente(entorno, auth_datos, textos)
    if con_entorno is None:
        tiene_sesion = isinstance(auth_datos, dict) and PROVEEDOR in auth_datos
        con_entorno = not tiene_sesion and clave_presente(entorno, None, textos)
    config, error = _config(ruta)
    if error:
        return {"ok": False, "error": error, "ruta": os.path.expanduser(ruta)}
    nuevo, cambios = fusionar(config, con_entorno)
    respaldo = ""
    if cambios:
        ruta = os.path.expanduser(ruta)
        try:
            if os.path.exists(ruta):
                respaldo = ruta + ".bak"
                shutil.copy2(ruta, respaldo)
            escribir_json(ruta, nuevo)
        except OSError as exc:
            return {"ok": False, "ruta": ruta,
                    "error": "no pude escribir opencode.json (%s)" % type(exc).__name__}
    if instalado is None:
        instalado = bool(shutil.which("opencode"))
    parte = estado(nuevo, clave, instalado)
    parte["ruta"] = os.path.expanduser(ruta)
    return {"ok": True, "ruta": parte["ruta"], "cambios": cambios, "respaldo": respaldo,
            "clave": clave, "con_entorno": bool(con_entorno), "estado": parte}


def informe(ruta=RUTA_CONFIG, auth=RUTA_AUTH, archivos=ARCHIVOS_CLAVE, entorno=None,
            instalado=None):
    """E/S. Estado de Zen sin escribir nada: config, clave y el siguiente paso."""
    entorno = dict(os.environ) if entorno is None else dict(entorno)
    config, error = _config(ruta)
    if instalado is None:
        instalado = bool(shutil.which("opencode"))
    parte = estado(config, clave_presente(entorno, leer_json(auth), _textos(archivos)), instalado)
    parte["ruta"] = os.path.expanduser(ruta)
    if error:
        parte["error"] = error
    return parte


def _imprimir(parte):
    """Parte legible. Solo NOMBRES de variables y rutas: nunca un valor de clave."""
    print("OpenCode Zen · %s" % parte.get("estado", "?"))
    print("  config: %s" % parte.get("ruta", RUTA_CONFIG))
    print("  clave %s: %s" % (VAR_CLAVE, "sí" if parte.get("activo") else "no"))
    if parte.get("faltan"):
        print("  faltan: %s" % ", ".join(parte["faltan"]))
    print("  detalle: %s" % parte.get("detalle", ""))
    if parte.get("siguiente_paso"):
        print("  siguiente: %s" % parte["siguiente_paso"])
    if parte.get("error"):
        print("  error: %s" % parte["error"])


def main(argv=None):
    """CLI: `estado` (por defecto) o `aplicar`. Nunca imprime el valor de una clave."""
    parser = argparse.ArgumentParser(description="Configura y comprueba OpenCode Zen.")
    parser.add_argument("accion", nargs="?", choices=("estado", "aplicar"), default="estado")
    parser.add_argument("--ruta", default=RUTA_CONFIG)
    parser.add_argument("--auth", default=RUTA_AUTH)
    parser.add_argument("--archivos", nargs="*", default=list(ARCHIVOS_CLAVE))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--entorno", dest="con_entorno", action="store_true", default=None)
    args = parser.parse_args(argv)
    if args.accion == "aplicar":
        parte = aplicar(args.ruta, args.auth, args.archivos, con_entorno=args.con_entorno)
        if args.json:
            print(json.dumps(parte, ensure_ascii=False, indent=1))
        elif not parte.get("ok"):
            print("OpenCode Zen · ERROR: %s" % parte.get("error"))
        else:
            cuantos = len(parte["cambios"])
            print("OpenCode Zen · %s (%d cambios)" % (
                "configuración aplicada" if cuantos else "sin cambios", cuantos))
            _imprimir(parte["estado"])
        return 0 if parte.get("ok") else 1
    parte = informe(args.ruta, args.auth, args.archivos)
    if args.json:
        print(json.dumps(parte, ensure_ascii=False, indent=1))
    else:
        _imprimir(parte)
    return 0 if parte["estado"] == "listo" else 1


if __name__ == "__main__":
    raise SystemExit(main())
