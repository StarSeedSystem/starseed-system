# -*- coding: utf-8 -*-
"""Guardia pura de la configuración de opencode (`~/.config/opencode/opencode.json`) del
enjambre (AGT1025E): la misma que escribe el orquestador (`refrescar_bloque_opencode` en
`starseed-enjambre.py`). Un plugin o MCP añadido sin visto puede lanzar subagentes que se
saltan el gobernador de recursos. SOLO lee y avisa; jamás delata un valor de clave.
"""
import json
import os
import re
import sys
from urllib.parse import urlsplit

PATRON_CLAVE_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")

HALLAZGO_ILEGIBLE = {"id": "config-ilegible", "nivel": "bloquea",
    "texto": "La configuración de opencode no es JSON legible ni un objeto.",
    "arreglo": "Revisa ~/.config/opencode/opencode.json a mano y deja que el orquestador la regenere."}
def _hallazgo(id_, nivel, texto, arreglo):
    return {"id": id_, "nivel": nivel, "texto": texto, "arreglo": arreglo}

def _host_de(url):
    """Solo el host de una URL: sin ruta, sin parámetros, sin credenciales."""
    try:
        return urlsplit(str(url)).hostname or str(url)
    except Exception:
        return str(url)

def _plugins(cfg, admitidos):
    """Plugins de `cfg[\"plugin\"]` fuera de la lista admitida: «bloquea»."""
    lista = cfg.get("plugin")
    if not isinstance(lista, list):
        return []
    return [_hallazgo("plugin-externo", "bloquea",
        "Plugin externo «%s» en la configuración del enjambre: puede lanzar subagentes en"
        " paralelo que se salten el gobernador de recursos." % str(e),
        "Quítalo, o decláralo en STARSEED_PLUGINS_OPENCODE_ADMITIDOS si ya lo aprueba Alex.")
        for e in lista if str(e) not in set(admitidos)]

def _mcp(cfg):
    """MCP cuya `enabled` no sea False: «avisa», uno por entrada; remoto → solo el host."""
    mcp = cfg.get("mcp")
    if not isinstance(mcp, dict):
        return []
    return [_hallazgo("mcp-activo", "avisa", "MCP activo %s: gasta contexto en cada turno." % (
        ("remoto en «%s»" % _host_de(d["url"])) if isinstance(d, dict) and "url" in d
        else "«%s»" % n), "Ponle enabled: false si la tarea no lo necesita, o quítalo.")
        for n, d in sorted(mcp.items()) if not (isinstance(d, dict) and d.get("enabled") is False)]

def _claves(cfg):
    """apiKey que no sea «sin-clave» ni {env:VARIABLE} literal: «bloquea». El texto delata
    el id del proveedor y la LONGITUD del valor, jamás el valor ni parte de él."""
    proveedores = cfg.get("provider")
    if not isinstance(proveedores, dict):
        return []
    hallazgos = []
    for prov, bloque in sorted(proveedores.items()):
        opciones = bloque.get("options") if isinstance(bloque, dict) else None
        api = opciones.get("apiKey") if isinstance(opciones, dict) else None
        if api is None or (isinstance(api, str) and (api == "sin-clave" or PATRON_CLAVE_ENV.match(api))):
            continue
        medida = ("valor de %d caracteres" % len(api)) if isinstance(api, str) else (
            "valor de tipo %s" % type(api).__name__)
        hallazgos.append(_hallazgo("clave-en-claro", "bloquea",
            "El proveedor «%s» tiene apiKey sin la sintaxis literal {env:VARIABLE} ni"
            " «sin-clave» (%s)." % (prov, medida),
            "Sustitúyelo por «{env:NOMBRE_DE_VARIABLE}» o «sin-clave»; el valor va solo en"
            " la variable de entorno, jamás en el archivo."))
    return hallazgos

def _lsp(cfg):
    """`lsp.typescript.disabled` distinto de True: «avisa» (tsserver ~2 GB en 8 GB)."""
    lsp = cfg.get("lsp")
    tipos = lsp.get("typescript") if isinstance(lsp, dict) else None
    if isinstance(tipos, dict) and tipos.get("disabled") is True:
        return []
    return [_hallazgo("lsp-typescript", "avisa", "lsp.typescript.disabled no es true:"
        " un tsserver gasta ~2 GB en la Mac de 8 GB.",
        "Pon lsp.typescript.disabled = true; tsc ya corre por turno con tsc-turno.sh.")]

def _permisos(cfg):
    """Sin `permission.bash` (ausente, no dict o sin la clave): «avisa»."""
    permisos = cfg.get("permission")
    if isinstance(permisos, dict) and "bash" in permisos:
        return []
    return [_hallazgo("sin-vetos-bash", "avisa",
        "Sin vetos en permission.bash: un agente podría ejecutar órdenes de más en esta máquina.",
        "Añade en permission.bash los vetos que la Mac ya lleva (ver starseed-enjambre.py).")]

def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Devuelve la lista de hallazgos de la configuración. Nunca lanza."""
    if not isinstance(cfg, dict) or cfg.get("__ilegible__"):
        return [dict(HALLAZGO_ILEGIBLE)]
    return _plugins(cfg, plugins_admitidos) + _mcp(cfg) + _claves(cfg) + _lsp(cfg) + _permisos(cfg)

def leer_config(ruta):
    """JSON: archivo ausente → {}; JSON roto → {"__ilegible__": True}."""
    if not os.path.isfile(ruta):
        return {}
    try:
        with open(ruta, encoding="utf-8") as archivo:
            return json.load(archivo)
    except Exception:
        return {"__ilegible__": True}

def main(argv=None):
    """Imprime {"hallazgos": [...], "bloquea": N} y devuelve 1 si algo bloquea, 0 si no.
    Plugins admitidos: variable STARSEED_PLUGINS_OPENCODE_ADMITIDOS (separados por comas)."""
    argumentos = list(sys.argv[1:] if argv is None else argv)
    ruta = argumentos[0] if argumentos else os.path.join(
        os.path.expanduser("~"), ".config/opencode/opencode.json")
    crudos = os.environ.get("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "")
    admitidos = tuple(x.strip() for x in crudos.split(",") if x.strip())
    hallazgos = auditar_config_opencode(leer_config(ruta), admitidos)
    bloquea = sum(1 for h in hallazgos if h.get("nivel") == "bloquea")
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquea}, ensure_ascii=False))
    return 1 if bloquea else 0

if __name__ == "__main__":
    sys.exit(main())
