"""Auditoría pura de la configuración de opencode.

Lee un dict de configuración y devuelve hallazgos sobre plugins, MCP,
claves en claro, LSP y permisos. Sin efectos secundarios.
"""

import json
import os
import re
from urllib.parse import urlparse


def auditar_config_opencode(cfg, plugins_admitidos=()):
    if not isinstance(cfg, dict) or cfg.get("__ilegible__"):
        return [{
            "id": "config-ilegible",
            "nivel": "bloquea",
            "texto": "La configuración no es un diccionario o está ilegible",
            "arreglo": "Verificar el archivo JSON de opencode",
        }]

    hallazgos = []

    plugins = cfg.get("plugin") or []
    if isinstance(plugins, list):
        for p in plugins:
            if p not in plugins_admitidos:
                hallazgos.append({
                    "id": "plugin-externo",
                    "nivel": "bloquea",
                    "texto": f"Plugin externo detectado: {p}",
                    "arreglo": "Quitar el plugin o añadirlo a STARSEED_PLUGINS_OPENCODE_ADMITIDOS",
                })

    mcp = cfg.get("mcp") or {}
    if isinstance(mcp, dict):
        for nombre, definicion in mcp.items():
            if isinstance(definicion, dict) and definicion.get("enabled") is not False:
                texto = f"MCP '{nombre}' está activo y gasta contexto en cada turno"
                url = definicion.get("url")
                if isinstance(url, str):
                    host = urlparse(url).hostname or ""
                    if host:
                        texto += f" en host {host}"
                hallazgos.append({
                    "id": "mcp-activo",
                    "nivel": "avisa",
                    "texto": texto,
                    "arreglo": "Desactivar el MCP (enabled: false) o eliminarlo",
                })

    proveedores = cfg.get("provider") or {}
    if isinstance(proveedores, dict):
        patron_env = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")
        for pid, prov in proveedores.items():
            if isinstance(prov, dict):
                opts = prov.get("options") or {}
                api_key = opts.get("apiKey")
                if api_key != "sin-clave" and not (isinstance(api_key, str) and patron_env.match(api_key)):
                    longitud = len(str(api_key)) if api_key is not None else 0
                    hallazgos.append({
                        "id": "clave-en-claro",
                        "nivel": "bloquea",
                        "texto": f"Proveedor {pid} usa apiKey en claro de longitud {longitud}",
                        "arreglo": "Usar sintaxis {env:VARIABLE} o la palabra 'sin-clave'",
                    })

    lsp = cfg.get("lsp") or {}
    ts = lsp.get("typescript") if isinstance(lsp, dict) else None
    disabled = ts.get("disabled") if isinstance(ts, dict) else None
    if disabled is not True:
        hallazgos.append({
            "id": "lsp-typescript",
            "nivel": "avisa",
            "texto": "El LSP de TypeScript no está desactivado; un tsserver gasta ~2 GB en la Mac de 8 GB",
            "arreglo": "Establecer lsp.typescript.disabled = true",
        })

    permiso = cfg.get("permission")
    if not isinstance(permiso, dict) or "bash" not in permiso:
        hallazgos.append({
            "id": "sin-vetos-bash",
            "nivel": "avisa",
            "texto": "Falta veto de bash en permission",
            "arreglo": "Añadir permission.bash con los vetos habituales",
        })

    return hallazgos


def leer_config(ruta):
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception:
        return {"__ilegible__": True}


def main(argv=None):
    import sys
    if argv is None:
        argv = sys.argv[1:]
    ruta = argv[0] if argv else os.path.expanduser("~/.config/opencode/opencode.json")
    cfg = leer_config(ruta)
    env = os.getenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "")
    admitidos = [p.strip() for p in env.split(",") if p.strip()]
    hallazgos = auditar_config_opencode(cfg, admitidos)
    bloquea = sum(1 for h in hallazgos if h["nivel"] == "bloquea")
    out = {"hallazgos": hallazgos, "bloquea": bloquea}
    print(json.dumps(out, ensure_ascii=False))
    return 1 if bloquea else 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
