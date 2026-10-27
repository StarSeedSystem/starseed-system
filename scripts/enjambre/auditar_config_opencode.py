# -*- coding: utf-8 -*-
"""Guardia de la configuración de opencode del enjambre (Ola 1025R · AGT1025E).

Lee la configuración que escribe `refrescar_bloque_opencode` (el bloque de opencode del
orquestador) y avisa de plugins externos, MCP activos, claves en claro, tsserver encendido
y vetos de bash ausentes. Puro y de solo lectura: nunca escribe archivos ni se engancha
al orquestador (eso lo decide Alex después).
"""

import json, os, re, sys
from urllib.parse import urlsplit

RE_CLAVE_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")


def _hallazgo(identificador, nivel, texto, arreglo):
    return {"id": identificador, "nivel": nivel, "texto": texto, "arreglo": arreglo}

def _config_ilegible():
    texto = "La configuración de opencode no es un JSON de objeto legible."
    arreglo = "Revisa la ruta del archivo o regenera el bloque con el orquestador."
    return [_hallazgo("config-ilegible", "bloquea", texto, arreglo)]

def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Audita un dict de configuración de opencode y devuelve la lista de hallazgos."""
    if not isinstance(cfg, dict) or cfg.get("__ilegible__") is True:
        return _config_ilegible()
    hallazgos = _plugins_externos(cfg, plugins_admitidos)
    hallazgos += _mcp_activos(cfg) + _claves_en_claro(cfg)
    hallazgos += _lsp_typescript(cfg) + _vetos_bash(cfg)
    return hallazgos

def _plugins_externos(cfg, admitidos):
    plugins = cfg.get("plugin")
    if not isinstance(plugins, list):
        return []
    hallazgos = []
    for entrada in plugins:
        if isinstance(entrada, str) and entrada in admitidos:
            continue
        nombre = entrada if isinstance(entrada, str) else repr(entrada)
        texto = f"Plugin externo en la configuración: {nombre}."
        arreglo = "Quítalo de la configuración o pídeselo como admitido a Alex."
        hallazgos.append(_hallazgo("plugin-externo", "bloquea", texto, arreglo))
    return hallazgos

def _mcp_activos(cfg):
    mcp = cfg.get("mcp")
    if not isinstance(mcp, dict):
        return []
    hallazgos = []
    for nombre, definicion in mcp.items():
        if isinstance(definicion, dict) and definicion.get("enabled") is False:
            continue
        host = ""
        if isinstance(definicion, dict) and isinstance(definicion.get("url"), str):
            host = urlsplit(definicion["url"]).netloc
        detalle = f" (host: {host})" if host else ""
        texto = f"MCP activo «{nombre}»{detalle}: gasta contexto en cada turno."
        hallazgos.append(_hallazgo("mcp-activo", "avisa", texto, "Apágalo con «enabled»: false si el enjambre no lo necesita."))
    return hallazgos

def _claves_en_claro(cfg):
    proveedores = cfg.get("provider")
    if not isinstance(proveedores, dict):
        return []
    hallazgos = []
    for id_proveedor, bloque in proveedores.items():
        opciones = bloque.get("options") if isinstance(bloque, dict) else None
        if not isinstance(opciones, dict) or not isinstance(opciones.get("apiKey"), str):
            continue
        clave = opciones["apiKey"]
        if clave == "sin-clave" or RE_CLAVE_ENV.match(clave):
            continue
        texto = f"apiKey en claro en el proveedor «{id_proveedor}» (longitud {len(clave)})."
        arreglo = f"Usa la sintaxis literal {{env:NOMBRE}} en provider.{id_proveedor}.options.apiKey."
        hallazgos.append(_hallazgo("clave-en-claro", "bloquea", texto, arreglo))
    return hallazgos

def _lsp_typescript(cfg):
    lsp = cfg.get("lsp")
    typescript = lsp.get("typescript") if isinstance(lsp, dict) else None
    if isinstance(typescript, dict) and typescript.get("disabled") is True:
        return []
    texto = "lsp.typescript no está desactivado: un tsserver gasta ~2 GB en la Mac de 8 GB."
    arreglo = "Pon «disabled»: true en lsp.typescript de la configuración."
    return [_hallazgo("lsp-typescript", "avisa", texto, arreglo)]

def _vetos_bash(cfg):
    permisos = cfg.get("permission")
    if isinstance(permisos, dict) and "bash" in permisos:
        return []
    texto = "permission está ausente o sin la clave bash: faltan los vetos de la Mac."
    arreglo = "Añade el bloque permission.bash con los vetos que mantiene el orquestador."
    return [_hallazgo("sin-vetos-bash", "avisa", texto, arreglo)]

def leer_config(ruta):
    """Lee un JSON: archivo ausente → {}; JSON roto o que no sea objeto → {"__ilegible__": True}."""
    if not os.path.exists(ruta):
        return {}
    try:
        with open(ruta, "r", encoding="utf-8") as archivo:
            contenido = json.load(archivo)
    except (OSError, ValueError):
        return {"__ilegible__": True}
    return contenido if isinstance(contenido, dict) else {"__ilegible__": True}

def main(argv=None):
    """Imprime JSON {"hallazgos": [...], "bloquea": N} y devuelve 1 si algo bloquea."""
    argumentos = sys.argv[1:] if argv is None else list(argv)
    ruta = argumentos[0] if argumentos else "~/.config/opencode/opencode.json"
    bruta = os.environ.get("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "")
    admitidos = [nombre.strip() for nombre in bruta.split(",") if nombre.strip()]
    hallazgos = auditar_config_opencode(leer_config(os.path.expanduser(ruta)), admitidos)
    bloquean = sum(1 for hallazgo in hallazgos if hallazgo["nivel"] == "bloquea")
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquean}, ensure_ascii=False))
    return 1 if bloquean else 0

if __name__ == "__main__":
    sys.exit(main())
