#!/usr/bin/env python3
"""Guardia pura de la configuración de opencode del enjambre.

Devuelve hallazgos ``bloquea``/``avisa`` sin red, disco ni reloj y sin exponer jamás el
valor de una clave: solo su longitud. ``leer_config`` es la única puerta al disco.
"""

from __future__ import annotations

import json
import os
import re
import sys
from urllib.parse import urlsplit

PATRON_CLAVE = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"

def _hallazgo(ident: str, nivel: str, texto: str, arreglo: str) -> dict:
    return {"id": ident, "nivel": nivel, "texto": texto, "arreglo": arreglo}

def _host(url: object) -> str:
    """Devuelve solo el host de una URL; sin ruta, sin parámetros y sin lanzar."""
    try:
        return urlsplit(str(url)).hostname or ""
    except Exception:
        return ""

def _longitud(valor: object) -> int:
    return len(valor) if hasattr(valor, "__len__") else 0  # type: ignore[arg-type]

def auditar_config_opencode(cfg: dict, plugins_admitidos=()) -> list[dict]:
    """Audita la configuración de opencode y devuelve la lista de hallazgos.

    ``plugins_admitidos`` es una colección de nombres de plugin permitidos. La función es
    pura y nunca lanza: ante una entrada ilegible devuelve un único hallazgo que bloquea.
    """
    ilegible = [_hallazgo("config-ilegible", "bloquea",
                          "La configuración de opencode no es un objeto legible.",
                          "Corrige el JSON de ~/.config/opencode/opencode.json.")]
    try:
        if not isinstance(cfg, dict) or cfg.get("__ilegible__") is True:
            return ilegible
        hallazgos: list[dict] = []
        admitidos = {str(p).strip() for p in (plugins_admitidos or ()) if str(p).strip()}
        plugins = cfg.get("plugin")
        if isinstance(plugins, (list, tuple)):
            for entrada in plugins:
                nombre = str(entrada)
                if nombre not in admitidos:
                    hallazgos.append(_hallazgo(
                        "plugin-externo", "bloquea",
                        "Plugin no admitido en la configuración: «%s»." % nombre,
                        "Quita el plugin o añádelo a STARSEED_PLUGINS_OPENCODE_ADMITIDOS."))
        mcp = cfg.get("mcp")
        if isinstance(mcp, dict):
            for nombre, definicion in mcp.items():
                habilitado = definicion.get("enabled") if isinstance(definicion, dict) else None
                if habilitado is not False:
                    host = _host(definicion.get("url")) if isinstance(definicion, dict) else ""
                    detalle = " (%s)" % host if host else ""
                    hallazgos.append(_hallazgo(
                        "mcp-activo", "avisa",
                        "MCP «%s» activo%s: gasta contexto en cada turno." % (nombre, detalle),
                        'Desactívalo con "enabled": false mientras no se esté usando.'))
        proveedores = cfg.get("provider")
        if isinstance(proveedores, dict):
            for ident, bloque in proveedores.items():
                opciones = bloque.get("options") if isinstance(bloque, dict) else None
                if not isinstance(opciones, dict) or "apiKey" not in opciones:
                    continue
                clave = opciones.get("apiKey")
                if clave == "sin-clave" or (
                    isinstance(clave, str) and PATRON_CLAVE.match(clave)
                ):
                    continue
                hallazgos.append(_hallazgo(
                    "clave-en-claro", "bloquea",
                    "El proveedor «%s» lleva una apiKey en claro de %d caracteres."
                    % (ident, _longitud(clave)),
                    "Sustitúyela por la sintaxis literal {env:VARIABLE} o por «sin-clave»."))
        lsp = cfg.get("lsp")
        ts = lsp.get("typescript") if isinstance(lsp, dict) else None
        desactivado = ts.get("disabled") if isinstance(ts, dict) else None
        if desactivado is not True:
            hallazgos.append(_hallazgo(
                "lsp-typescript", "avisa",
                "El LSP de TypeScript no está desactivado: un tsserver gasta ~2 GB en la Mac de 8 GB.",
                'Añade "lsp": {"typescript": {"disabled": true}}.'))
        permiso = cfg.get("permission")
        if not isinstance(permiso, dict) or "bash" not in permiso:
            hallazgos.append(_hallazgo(
                "sin-vetos-bash", "avisa",
                "No hay vetos de bash en permission: un agente puede lanzar lo que quiera.",
                'Declara "permission": {"bash": {...}} con los vetos de la Mac.'))
        return hallazgos
    except Exception:
        return ilegible


def leer_config(ruta: str) -> dict:
    """Lee el JSON de opencode: ausente → {} y roto → marca de ilegible."""
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else {"__ilegible__": True}
    except FileNotFoundError:
        return {}
    except Exception:
        return {"__ilegible__": True}

def main(argv=None) -> int:
    """Imprime el informe en JSON y devuelve 1 si algo bloquea."""
    ruta = (list(sys.argv[1:] if argv is None else argv) or [RUTA_POR_DEFECTO])[0]
    admitidos = os.environ.get("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "").split(",")
    hallazgos = auditar_config_opencode(leer_config(ruta), admitidos)
    bloquea = sum(h["nivel"] == "bloquea" for h in hallazgos)
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquea}, ensure_ascii=False))
    return 1 if bloquea else 0
