# -*- coding: utf-8 -*-
"""Guardia de la configuración de opencode del enjambre (Ola 1025 · AGT1025E).

El orquestador escribe `~/.config/opencode/opencode.json` con reglas duras: claves solo
como {env:VARIABLE} o «sin-clave», tsserver apagado y vetos en permission.bash. Un
plugin o MCP añadido por otra mano puede lanzar subagentes en paralelo o gastar
contexto en cada turno. Esto solo LEE y avisa: nunca escribe y jamás imprime una clave.
"""

import json
import os
import re
import sys
from urllib.parse import urlparse

RUTA_POR_DEFECTO = os.path.join(os.path.expanduser("~"), ".config", "opencode", "opencode.json")
VAR_ENTORNO_PLUGINS = "STARSEED_PLUGINS_OPENCODE_ADMITIDOS"
PATRON_CLAVE_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")


def _f(i, n, t, a):
    """Hallazgo compacto."""
    return {"id": i, "nivel": n, "texto": t, "arreglo": a}


ILEGIBLE = _f(
    "config-ilegible", "bloquea",
    "la configuración no es un JSON legible",
    "regénrala desde el orquestador (refrescar_bloque_opencode)",
)


def _anfitrion(url):
    """Host de una URL: solo el anfitrión, sin ruta, parámetros ni puerto."""
    try:
        return urlparse(str(url)).hostname
    except (ValueError, TypeError):
        return None


def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Devuelve una lista de hallazgos {id, nivel, texto, arreglo} para cfg."""
    if not isinstance(cfg, dict) or "__ilegible__" in cfg:
        return [dict(ILEGIBLE)]
    hallazgos = []
    admitidos = {str(p) for p in plugins_admitidos}
    entradas = cfg.get("plugin", [])
    normales = entradas if isinstance(entradas, list) else [entradas] if isinstance(entradas, str) else []
    for entrada in normales:
        nombre = str(entrada)
        if nombre not in admitidos:
            hallazgos.append(_f("plugin-externo", "bloquea", "plugin externo «{0}» no está entre los admitidos".format(nombre), "quítalo de `plugin` o añádelo a " + VAR_ENTORNO_PLUGINS + " tras revisarlo"))
    mapa = cfg.get("mcp", {})
    for nombre, defi in mapa.items() if isinstance(mapa, dict) else []:
        defi = defi if isinstance(defi, dict) else {}
        if defi.get("enabled") is False:
            continue
        host = _anfitrion(defi["url"]) if "url" in defi else None
        detalle = " ({0})".format(host) if host else ""
        texto = "MCP «{0}» está activo{1}: gasta contexto en cada turno".format(nombre, detalle)
        hallazgos.append(_f("mcp-activo", "avisa", texto, "pon su `enabled` en false si no se usa en este medio"))
    proveedores = cfg.get("provider", {})
    for ident, datos in proveedores.items() if isinstance(proveedores, dict) else []:
        opciones = datos.get("options") if isinstance(datos, dict) else None
        valor = opciones.get("apiKey") if isinstance(opciones, dict) else None
        es_env = isinstance(valor, str) and PATRON_CLAVE_ENV.match(valor)
        if valor is None or valor == "sin-clave" or es_env:
            continue
        texto = "provider «{0}» tiene apiKey en claro (longitud {1})".format(ident, len(str(valor)))
        hallazgos.append(_f("clave-en-claro", "bloquea", texto, "ponla como {env:NOMBRE_DE_VARIABLE} o «sin-clave»"))
    lsp = cfg.get("lsp", {})
    apagado = isinstance(lsp, dict) and isinstance(lsp.get("typescript"), dict) and lsp["typescript"].get("disabled") is True
    if not apagado:
        texto = "el lsp de TypeScript no está apagado: un tsserver gasta ~2 GB en la Mac de 8 GB"
        hallazgos.append(_f("lsp-typescript", "avisa", texto, "pon lsp.typescript.disabled en true"))
    permisos = cfg.get("permission")
    if not (isinstance(permisos, dict) and "bash" in permisos):
        texto = "falta permission.bash: la Mac lleva vetos de terminal que así se pierden"
        hallazgos.append(_f("sin-vetos-bash", "avisa", texto, "añade permission.bash con los vetos del enjambre"))
    return hallazgos


def plugins_desde_entorno(valor=None):
    """Lista de plugins admitidos desde una cadena separada por comas."""
    if valor is None:
        valor = os.environ.get(VAR_ENTORNO_PLUGINS, "")
    return [p.strip() for p in valor.split(",") if p.strip()]


def leer_config(ruta):
    """Lee un JSON de configuración; ausente → {}, roto → {\"__ilegible__\": True}."""
    if not os.path.exists(ruta):
        return {}
    try:
        with open(ruta, "r", encoding="utf-8") as archivo:
            dato = json.load(archivo)
    except (OSError, ValueError, UnicodeDecodeError):
        return {"__ilegible__": True}
    return dato if isinstance(dato, dict) else {"__ilegible__": True}


def main(argv=None):
    """Imprime {\"hallazgos\": [...], \"bloquea\": N} en stdout y devuelve 1/0."""
    pila = list(sys.argv[1:] if argv is None else argv)
    ruta = pila[0] if pila else RUTA_POR_DEFECTO
    hallazgos = auditar_config_opencode(leer_config(ruta), plugins_desde_entorno())
    bloquean = [h for h in hallazgos if h.get("nivel") == "bloquea"]
    print(json.dumps({"hallazgos": hallazgos, "bloquea": len(bloquean)}))
    return 1 if bloquean else 0
