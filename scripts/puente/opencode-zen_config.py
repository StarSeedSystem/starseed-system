#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · deja OpenCode Zen listo en la configuración de opencode.

Por qué existe (CAP1119): la rotación pide `opencode/glm-5.3-flash-free` y sus hermanos, y
`medios_disponibles` y el renovador dan Zen por «usable pero sin configurar». Faltaba declarar
esos modelos en `~/.config/opencode/opencode.json` sin pisar otros proveedores. Zen usa la
sesión de `opencode auth login` (o `OPENCODE_API_KEY`): aquí NO se escribe ninguna clave.

Lógica PURA (`bloque_zen`, `fusionar`, `ya_configurado`); `leer`/`guardar`/`configurar` tocan disco.
"""

import copy
import json
import os
import sys

PROVEEDOR = "opencode"
MODELOS = ("glm-5.3-flash-free", "deepseek-v4.1-flash-free",
           "minimax-m3.1-flash-free", "big-pickle")
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"


def bloque_zen():
    """El bloque del proveedor `opencode` con los modelos gratuitos de Zen.

    Solo declara `models`: el endpoint y la autenticación son los del proveedor
    integrado de opencode (sesión de `auth login` o `OPENCODE_API_KEY`). Escribir
    aquí una `apiKey` literal rompería la sesión de la Mac y la auditoría lo bloquea.
    """
    return {"models": {modelo: {"name": modelo} for modelo in MODELOS}}


def fusionar(config):
    """Copia de `config` con el proveedor Zen asegurado; no muta la entrada.

    Conserva los demás proveedores, las claves de la raíz y los modelos que el
    proveedor `opencode` ya tuviera: solo suma los que falten. Idempotente.
    """
    base = copy.deepcopy(config) if isinstance(config, dict) else {}
    proveedores = base.get("provider")
    if not isinstance(proveedores, dict):
        proveedores = {}
    actual = proveedores.get(PROVEEDOR)
    if not isinstance(actual, dict):
        actual = {}
    modelos = actual.get("models")
    if not isinstance(modelos, dict):
        modelos = {}
    for modelo, datos in bloque_zen()["models"].items():
        modelos.setdefault(modelo, datos)
    actual["models"] = modelos
    proveedores[PROVEEDOR] = actual
    base["provider"] = proveedores
    return base


def ya_configurado(config):
    """¿Están ya todos los modelos Zen en la configuración?"""
    if not isinstance(config, dict) or not isinstance(config.get("provider"), dict):
        return False
    bloque = config["provider"].get(PROVEEDOR)
    modelos = bloque.get("models") if isinstance(bloque, dict) else None
    if not isinstance(modelos, dict):
        return False
    return all(modelo in modelos for modelo in MODELOS)


def leer(ruta=None):
    """Lee el JSON; ausente → {}, ilegible → None (para no pisar un archivo roto)."""
    ruta = os.path.expanduser(ruta or RUTA_POR_DEFECTO)
    try:
        with open(ruta, encoding="utf-8") as fh:
            datos = json.load(fh)
    except FileNotFoundError:
        return {}
    except Exception:
        return None
    return datos if isinstance(datos, dict) else None


def guardar(config, ruta=None):
    """Escribe el JSON de forma atómica y devuelve la ruta usada."""
    ruta = os.path.expanduser(ruta or RUTA_POR_DEFECTO)
    carpeta = os.path.dirname(ruta)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    temporal = ruta + ".tmp-zen"
    with open(temporal, "w", encoding="utf-8") as fh:
        json.dump(config, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    os.replace(temporal, ruta)
    return ruta


def configurar(ruta=None):
    """Añade Zen si falta y devuelve un resumen; no reescribe si ya está."""
    ruta = os.path.expanduser(ruta or RUTA_POR_DEFECTO)
    config = leer(ruta)
    if config is None:
        return {"cambiado": False, "error": "config ilegible", "ruta": ruta}
    if ya_configurado(config):
        return {"cambiado": False, "proveedor": PROVEEDOR,
                "modelos": list(MODELOS), "ruta": ruta}
    guardar(fusionar(config), ruta)
    return {"cambiado": True, "proveedor": PROVEEDOR,
            "modelos": list(MODELOS), "ruta": ruta}


def main(argv=None):
    """CLI: imprime el resumen en JSON y devuelve 1 si la config era ilegible."""
    args = list(sys.argv[1:] if argv is None else argv)
    resultado = configurar(args[0] if args else None)
    print(json.dumps(resultado, ensure_ascii=False))
    return 1 if resultado.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
