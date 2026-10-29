# -*- coding: utf-8 -*-
"""Guardia pura de la configuración de opencode del enjambre (Ola 1025R · AGT1025E).

Lee `~/.config/opencode/opencode.json` (o la ruta que se le dé) y avisa de lo que puede
saltarse el gobernador de recursos: plugins externos, MCP activos que gastan contexto en
cada turno, claves escritas en claro, el servidor de lenguaje de TypeScript encendido o
la falta de los vetos de `bash`. No escribe nada, no toca la red y nunca lanza: cada
problema es un hallazgo con su nivel (`bloquea` o `avisa`) y su arreglo.

Ningún hallazgo repite el valor de una clave: solo se publica su longitud.
"""

import json
import os
import re
import sys
from urllib.parse import urlsplit

PATRON_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")
SIN_CLAVE = "sin-clave"
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"


def _hallazgo(ident, nivel, texto, arreglo):
    """Arma un hallazgo con la forma común del contrato."""
    return {"id": ident, "nivel": nivel, "texto": texto, "arreglo": arreglo}


def _ilegible():
    """Hallazgo único para una configuración que no es un objeto JSON legible."""
    return _hallazgo(
        "config-ilegible",
        "bloquea",
        "La configuración de opencode no es un objeto JSON legible.",
        "Revisa el archivo y deja un objeto JSON válido.",
    )


def _host(url):
    """Devuelve solo el host de una URL, sin ruta, parámetros ni credenciales."""
    if not isinstance(url, str) or not url:
        return ""
    partes = urlsplit(url)
    if not partes.hostname and "//" not in url:
        partes = urlsplit("//" + url)
    return partes.hostname or ""


def _longitud(valor):
    """Longitud del valor sin exponerlo; vale también para valores no textuales."""
    return len(valor) if isinstance(valor, str) else len(str(valor))


def auditar_config_opencode(cfg: dict, plugins_admitidos=()) -> list:
    """Devuelve los hallazgos de la configuración; nunca lanza."""
    try:
        if not isinstance(cfg, dict) or cfg.get("__ilegible__"):
            return [_ilegible()]
        hallazgos = []
        admitidos = set(plugins_admitidos or ())
        plugins = cfg.get("plugin")
        if isinstance(plugins, list):
            for entrada in plugins:
                if entrada not in admitidos:
                    hallazgos.append(_hallazgo(
                        "plugin-externo", "bloquea",
                        "Plugin externo en opencode.json: «%s»; puede lanzar subagentes "
                        "o gastar contexto sin pasar por el gobernador." % (entrada,),
                        "Quita el plugin o añádelo a STARSEED_PLUGINS_OPENCODE_ADMITIDOS "
                        "si Alex lo aprueba.",
                    ))
        mcp = cfg.get("mcp")
        if isinstance(mcp, dict):
            for nombre, definicion in mcp.items():
                if isinstance(definicion, dict) and definicion.get("enabled") is False:
                    continue
                host = _host(definicion.get("url")) if isinstance(definicion, dict) else ""
                donde = " (host %s)" % host if host else ""
                hallazgos.append(_hallazgo(
                    "mcp-activo", "avisa",
                    "MCP activo «%s»%s: gasta contexto en cada turno." % (nombre, donde),
                    "Pon \"enabled\": false en ese MCP si no hace falta en el enjambre.",
                ))
        proveedores = cfg.get("provider")
        if isinstance(proveedores, dict):
            for prov, definicion in proveedores.items():
                opciones = definicion.get("options") if isinstance(definicion, dict) else None
                if not isinstance(opciones, dict) or "apiKey" not in opciones:
                    continue
                valor = opciones.get("apiKey")
                if valor == SIN_CLAVE:
                    continue
                if isinstance(valor, str) and PATRON_ENV.fullmatch(valor):
                    continue
                hallazgos.append(_hallazgo(
                    "clave-en-claro", "bloquea",
                    "Clave en claro en provider.%s.options.apiKey (%d caracteres)."
                    % (prov, _longitud(valor)),
                    "Usa la sintaxis literal {env:VARIABLE} o «sin-clave»; nunca el valor.",
                ))
        lsp = cfg.get("lsp")
        typescript = lsp.get("typescript") if isinstance(lsp, dict) else None
        if not (isinstance(typescript, dict) and typescript.get("disabled") is True):
            hallazgos.append(_hallazgo(
                "lsp-typescript", "avisa",
                "El servidor de lenguaje de TypeScript está encendido: un tsserver gasta "
                "~2 GB en la Mac de 8 GB.",
                "Pon lsp.typescript.disabled = true en opencode.json.",
            ))
        permiso = cfg.get("permission")
        if not isinstance(permiso, dict) or "bash" not in permiso:
            hallazgos.append(_hallazgo(
                "sin-vetos-bash", "avisa",
                "Faltan los vetos de bash: permission.bash no está definido.",
                "Añade permission.bash con los vetos de la Mac.",
            ))
        return hallazgos
    except Exception:
        return [_ilegible()]


def leer_config(ruta: str) -> dict:
    """Lee el JSON de la ruta; ausente devuelve {} y roto devuelve el centinela."""
    raise NotImplementedError


def main(argv=None) -> int:
    """Imprime los hallazgos en JSON y devuelve 1 si alguno bloquea."""
    raise NotImplementedError


if __name__ == "__main__":
    sys.exit(main())
