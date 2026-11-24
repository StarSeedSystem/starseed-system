#!/usr/bin/env python3
"""opencode-zen_config · deja OpenCode Zen configurado y activo, sin escribir ninguna clave.

Por qué existe (CAP1119). OpenCode Zen es el primer escritor gratuito de la flota, pero exige
dos cosas a la vez: el proveedor `opencode` en la configuración y una credencial (la clave en
OPENCODE_API_KEY o el login de `opencode auth`). Sin la primera, `medios_disponibles` lo ve
«usable» y el enjambre no lo usa; sin la segunda, opencode falla en silencio y la tarea gasta
su intento. Este script comprueba ambas y deja la configuración escrita una sola vez.

Reglas: solo entran los modelos GRATUITOS (los `-free` y `big-pickle`); la clave viaja como
`{env:OPENCODE_API_KEY}`; nada se imprime con valor.
"""

import json
import os
import re
import sys

MODELOS_GRATIS = (
    "glm-5.3-flash-free",
    "deepseek-v4.1-flash-free",
    "minimax-m3.1-flash-free",
    "big-pickle",
)
BASE_ZEN = "https://opencode.ai/inference/openai/v1"
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"
ARCHIVOS_CLAVE = ("~/.starseed/env", "~/.hermes/.env")
RUTA_AUTH = "~/.local/share/opencode/auth.json"
PATRON_CLAVE = re.compile(r"\s*(?:export\s+)?OPENCODE_API_KEY\s*=\s*\S")


def _proveedor():
    return {
        "npm": "@ai-sdk/openai-compatible",
        "name": "OpenCode Zen (StarSeed)",
        "options": {"baseURL": BASE_ZEN, "apiKey": "{env:OPENCODE_API_KEY}"},
        "models": {m: {"name": m} for m in MODELOS_GRATIS},
    }


def configurar(config):
    """Devuelve una copia con el proveedor Zen fusionado; nunca muta la entrada."""
    copia = json.loads(json.dumps(config if isinstance(config, dict) else {}))
    proveedores = copia.setdefault("provider", {})
    if not isinstance(proveedores, dict):
        proveedores = copia["provider"] = {}
    actual = proveedores.get("opencode")
    actual = dict(actual) if isinstance(actual, dict) else {}
    opciones = dict(actual.get("options") or {})
    opciones.setdefault("baseURL", BASE_ZEN)
    opciones.setdefault("apiKey", "{env:OPENCODE_API_KEY}")
    actual["options"] = opciones
    modelos = dict(actual.get("models") or {})
    for modelo in MODELOS_GRATIS:
        modelos.setdefault(modelo, {"name": modelo})
    actual["models"] = modelos
    actual.setdefault("npm", "@ai-sdk/openai-compatible")
    actual.setdefault("name", "OpenCode Zen (StarSeed)")
    proveedores["opencode"] = actual
    return copia


def tiene_zen(config):
    """¿La configuración ya declara el proveedor Zen?"""
    if not isinstance(config, dict):
        return False
    proveedores = config.get("provider")
    if not isinstance(proveedores, dict):
        return False
    return any("opencode" in str(k).lower() or "zen" in str(k).lower()
               for k in proveedores)


def hay_clave(entorno=None, auth=None, archivos=None):
    """¿Hay credencial de Zen? Solo mira si existe; jamás devuelve su valor."""
    entorno = os.environ if entorno is None else entorno
    if str((entorno or {}).get("OPENCODE_API_KEY") or "").strip():
        return True
    for archivo in (ARCHIVOS_CLAVE if archivos is None else archivos):
        try:
            with open(os.path.expanduser(archivo), encoding="utf-8") as f:
                if any(PATRON_CLAVE.match(linea) for linea in f):
                    return True
        except OSError:
            pass
    ruta = os.path.expanduser(auth or RUTA_AUTH)
    try:
        with open(ruta, encoding="utf-8") as f:
            return "opencode" in (json.load(f) or {})
    except (OSError, ValueError, TypeError):
        return False


def aplicar(ruta=RUTA_POR_DEFECTO, entorno=None):
    """Lee, configura y escribe solo si cambió. Un JSON roto no se pisa."""
    ruta = os.path.expanduser(ruta)
    try:
        with open(ruta, encoding="utf-8") as f:
            config = json.load(f)
    except FileNotFoundError:
        config = {}
    except (OSError, ValueError):
        return {"ruta": ruta, "cambiado": False, "error": "json-ilegible",
                "activo": False}
    if not isinstance(config, dict):
        return {"ruta": ruta, "cambiado": False, "error": "json-ilegible",
                "activo": False}
    nuevo = configurar(config)
    cambiado = nuevo != config
    if cambiado:
        try:
            carpeta = os.path.dirname(ruta)
            if carpeta:
                os.makedirs(carpeta, exist_ok=True)
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(nuevo, f, ensure_ascii=False, indent=2)
                f.write("\n")
        except OSError as e:
            return {"ruta": ruta, "cambiado": False, "error": type(e).__name__,
                    "activo": False}
    clave = hay_clave(entorno)
    return {"ruta": ruta, "cambiado": cambiado, "configurado": tiene_zen(nuevo),
            "clave": clave, "activo": tiene_zen(nuevo) and clave,
            "modelos": len(nuevo["provider"]["opencode"]["models"])}


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    ruta = args[0] if args and not args[0].startswith("-") else RUTA_POR_DEFECTO
    resultado = aplicar(ruta)
    print(json.dumps(resultado, ensure_ascii=False))
    if resultado.get("error"):
        return 2
    return 0 if resultado.get("activo") else 1


if __name__ == "__main__":
    sys.exit(main())
