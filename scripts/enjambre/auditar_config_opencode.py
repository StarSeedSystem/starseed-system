# -*- coding: utf-8 -*-
"""Guardia pura de la configuración de opencode del enjambre (Ola 1025R · AGT1025E).

La escribe el orquestador (`refrescar_bloque_opencode` en starseed-enjambre.py): apiKey
siempre como {env:VARIABLE} o «sin-clave» (la sintaxis literal), lsp.typescript apagado
(un tsserver gastaba ~2 GB en la Mac) y vetos en permission.bash. Un plugin o un MCP
añadido sin que nadie lo vea puede lanzar subagentes que se saltan el gobernador de
recursos. Solo biblioteca estándar; no escribe archivos ni se engancha al orquestador.
"""

import json
import os
import re
import sys
from urllib.parse import urlsplit

PATRON_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")

VARIABLE_PLUGINS = "STARSEED_PLUGINS_OPENCODE_ADMITIDOS"
RUTA_DEFECTO = os.path.join("~", ".config", "opencode", "opencode.json")


def _hallazgo(ident, nivel, texto, arreglo):
    return {"id": ident, "nivel": nivel, "texto": texto, "arreglo": arreglo}


def _host(url):
    """Solo el host de una URL, sin ruta, parámetros ni puerto."""
    try:
        return urlsplit(url).hostname or ""
    except Exception:
        return ""


def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Función pura: recibe el cfg y los plugins admitidos; devuelve hallazgos. Nunca lanza."""
    if not isinstance(cfg, dict) or cfg.get("__ilegible__") is True:
        causa = "es JSON roto" if isinstance(cfg, dict) else "no es un objeto JSON"
        return [_hallazgo(
            "config-ilegible", "bloquea",
            "La configuración de opencode %s." % (causa,),
            "Revisa el archivo: debe ser un objeto JSON válido.")]
    hallazgos = []
    plugins = cfg.get("plugin")
    if isinstance(plugins, list):
        for entrada in plugins:
            if entrada not in plugins_admitidos:
                hallazgos.append(_hallazgo(
                    "plugin-externo", "bloquea",
                    "Plugin externo: %s" % (entrada,),
                    "Quítalo del bloque \"plugin\" o añádelo a "
                    + VARIABLE_PLUGINS + "."))
    mcp = cfg.get("mcp")
    if isinstance(mcp, dict):
        for nombre, definicion in mcp.items():
            if isinstance(definicion, dict) and definicion.get("enabled") is not False:
                texto = "MCP «%s» activo: gasta contexto en cada turno." % (nombre,)
                url = definicion.get("url")
                if isinstance(url, str) and _host(url):
                    texto += " Host: %s." % (_host(url),)
                hallazgos.append(_hallazgo(
                    "mcp-activo", "avisa", texto,
                    "Ponle \"enabled\": false si no lo usas."))
    provider = cfg.get("provider")
    if isinstance(provider, dict):
        for prov, bloque in provider.items():
            opciones = bloque.get("options") if isinstance(bloque, dict) else None
            clave = opciones.get("apiKey") if isinstance(opciones, dict) else None
            if clave is None or (isinstance(clave, str)
                                 and (clave == "sin-clave" or PATRON_ENV.match(clave))):
                continue
            hallazgos.append(_hallazgo(
                "clave-en-claro", "bloquea",
                "apiKey del proveedor %s parece clave en claro (longitud %d)."
                % (prov, len(str(clave))),
                "Cambia apiKey a {env:VARIABLE} o \"sin-clave\"."))
    lsp = cfg.get("lsp")
    ts = lsp.get("typescript") if isinstance(lsp, dict) else None
    if not (isinstance(ts, dict) and ts.get("disabled") is True):
        hallazgos.append(_hallazgo(
            "lsp-typescript", "avisa",
            "lsp.typescript.disabled no está a true: un tsserver gasta ~2 GB en la Mac.",
            "Pon lsp.typescript.disabled = true."))
    perm = cfg.get("permission")
    if not isinstance(perm, dict) or "bash" not in perm:
        hallazgos.append(_hallazgo(
            "sin-vetos-bash", "avisa",
            "Falta permission.bash: los vetos de la Mac no están aplicados.",
            "Añade permission.bash con los vetos del orquestador."))
    return hallazgos


def leer_config(ruta):
    """Lee un JSON de disco: archivo ausente → {}; JSON roto → {"__ilegible__": True}."""
    try:
        with open(ruta, encoding="utf-8") as puntero:
            return json.load(puntero)
    except FileNotFoundError:
        return {}
    except Exception:
        return {"__ilegible__": True}


def main(argv=None):
    """Imprime {"hallazgos": [...], "bloquea": N}; 1 si algo bloquea, 0 si no.
    La ruta va por argv (defecto: la config del usuario); los plugins admitidos salen de
    STARSEED_PLUGINS_OPENCODE_ADMITIDOS (lista separada por comas)."""
    lista = list(sys.argv[1:] if argv is None else argv)
    ruta = lista[0] if lista else os.path.expanduser(RUTA_DEFECTO)
    adm = [e for e in os.environ.get(VARIABLE_PLUGINS, "").split(",") if e]
    hallazgos = auditar_config_opencode(leer_config(ruta), adm)
    bloquea = sum(1 for hallazgo in hallazgos if hallazgo["nivel"] == "bloquea")
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquea},
                     ensure_ascii=False, indent=2))
    return 1 if bloquea else 0


if __name__ == "__main__":
    sys.exit(main())
