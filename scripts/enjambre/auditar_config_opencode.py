# -*- coding: utf-8 -*-
"""Guardia pura de `~/.config/opencode/opencode.json` (AGT1025E · Ola 1025R).

El orquestador (`refrescar_bloque_opencode`) escribe esa config con `apiKey` SIEMPRE `{env:VARIABLE}`
o «sin-clave», lsp.typescript apagado y vetos en permission.bash; un plugin o MCP metido fuera de
vista puede saltarse el gobernador o gastar contexto por turno. Solo lee y avisa (sin escribir, sin red).
"""

import json
import os
import re
import sys
from urllib.parse import urlsplit

PATRON_CLAVE_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")
RUTA_DEFECTO = os.path.join("~", ".config", "opencode", "opencode.json")


def _h(id_, nivel, texto, arreglo):
    return {"id": id_, "nivel": nivel, "texto": texto, "arreglo": arreglo}

def _dijo(d, clave):
    v = d.get(clave) if isinstance(d, dict) else None
    return v if isinstance(v, dict) else {}

def _plugin_externos(cfg, admitidos):
    """Regla 1: `plugin` con entradas no admitidas → bloquea; el texto nombra la entrada."""
    lista = cfg.get("plugin")
    if not isinstance(lista, list): return []
    unicos = dict.fromkeys(x for x in lista if isinstance(x, str))
    return [
        _h("plugin-externo", "bloquea",
           "El plugin «%s» no está en la lista de admitidos del enjambre" % nombre,
           "Quítalo de opencode.json o pídele a Alex meterlo en STARSEED_PLUGINS_OPENCODE_ADMITIDOS.")
        for nombre in unicos if nombre not in admitidos
    ]

def _mcp_activos(cfg):
    """Regla 2: cada `mcp` con `enabled` distinto de False → avisa (gasta contexto)."""
    mcp = cfg.get("mcp")
    if not isinstance(mcp, dict): return []
    hallazgos = []
    for nombre, definicion in sorted(mcp.items()):
        if isinstance(definicion, dict) and definicion.get("enabled") is False: continue
        url = definicion.get("url") if isinstance(definicion, dict) else None
        try:
            host = urlsplit(url or "").hostname or None  # solo el host, sin ruta ni parámetros
        except ValueError:
            host = None
        por = " (host %s)" % host if host else ""
        hallazgos.append(_h("mcp-activo", "avisa",
                           "El MCP «%s»%s está activo: gasta contexto en cada turno" % (nombre, por),
                           "Pon «enabled\": false si el enjambre no lo usa, o apruébalo con Alex."))
    return hallazgos

def _claves_en_claro(cfg):
    """Regla 3: `provider.<id>.options.apiKey` que no sea «sin-clave» ni {env:…} → bloquea."""
    proveedores = cfg.get("provider")
    if not isinstance(proveedores, dict): return []
    hallazgos = []
    for prov, bloque in sorted(proveedores.items()):
        valor = _dijo(bloque, "options").get("apiKey")
        if valor is None or valor == "sin-clave" or (isinstance(valor, str) and PATRON_CLAVE_ENV.match(valor)):
            continue
        longitud = len(valor) if isinstance(valor, str) else len(repr(valor))
        hallazgos.append(_h("clave-en-claro", "bloquea",
                           "provider.%s.options.apiKey tiene un valor en claro de %d caracteres"
                           % (prov, longitud),
                           "Escríbelo como «{env:NOMBRE_DE_VARIABLE}» o «sin-clave»; la clave solo vive en el entorno."))
    return hallazgos

def _lsp_y_vetos(cfg):
    """Reglas 4 y 5: lsp.typescript sin apagar y permission sin vetos «bash» → avisan."""
    hallazgos = []
    ts = _dijo(_dijo(cfg, "lsp"), "typescript")
    if ts.get("disabled") is not True:
        hallazgos.append(_h("lsp-typescript", "avisa",
                           "El lsp.typescript no está apagado: un tsserver gasta ~2 GB en la Mac de 8 GB",
                           "Pon «lsp»: {«typescript»: {«disabled»: true}} en opencode.json."))
    permisos = _dijo(cfg, "permission")
    if "bash" not in permisos:
        hallazgos.append(_h("sin-vetos-bash", "avisa",
                           "No hay vetos en permission.bash: cualquier agente puede ejecutar cualquier orden",
                           "Restaura los vetos de permission.bash que la Mac lleva en su opencode.json."))
    return hallazgos

def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Devuelve hallazgos [{id, nivel, texto, arreglo}] para el cfg dado. Nunca lanza."""
    if not isinstance(cfg, dict) or cfg.get("__ilegible__") is True:
        return [_h("config-ilegible", "bloquea",
                   "La configuración de opencode no es un objeto JSON legible",
                   "Regenerar opencode.json: el orquestador lo hace con refrescar_bloque_opencode.")]
    return (_plugin_externos(cfg, set(plugins_admitidos)) + _mcp_activos(cfg)
            + _claves_en_claro(cfg) + _lsp_y_vetos(cfg))

def leer_config(ruta):
    """Lee un JSON: archivo ausente → {}; roto o sin objeto raíz → {«__ilegible__»: True}."""
    try:
        with open(ruta, encoding="utf-8") as Gurig: datos = json.load(Gurig)
    except FileNotFoundError: return {}
    except Exception: return {"__ilegible__": True}
    return datos if isinstance(datos, dict) else {"__ilegible__": True}

def plugins_admitidos_entorno(variable="STARSEED_PLUGINS_OPENCODE_ADMITIDOS"):
    """Admitidos por entorno: lista separada por comas, vacía por defecto."""
    return [t for t in (os.environ.get(variable) or "").split(",") if t]

def main(argv=None):
    """Imprime {«hallazgos»: […], «bloquea»: N} y devuelve 1 si algo bloquea, 0 si no."""
    args = sys.argv[1:] if argv is None else list(argv)
    ruta = os.path.expanduser(args[0] if args else RUTA_DEFECTO)
    hallazgos = auditar_config_opencode(leer_config(ruta), plugins_admitidos_entorno())
    bloquea = sum(1 for h in hallazgos if h["nivel"] == "bloquea")
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquea}, ensure_ascii=False))
    return 1 if bloquea else 0


if __name__ == "__main__":
    sys.exit(main())
