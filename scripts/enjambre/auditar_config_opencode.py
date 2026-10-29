# -*- coding: utf-8 -*-
"""Guardia de la configuración de opencode del enjambre (Ola 1025R · AGT1025E).

oh-my-opencode-slim y Kilo Code se instalan como plugin o sustituyen a OpenCode, y su
instalador edita `~/.config/opencode/opencode.json`: añade plugins, propone activar
subagentes en segundo plano y MCP externos. Esa misma configuración la usa el enjambre
de MetaGenesis, y un plugin o MCP añadido sin que nadie lo vea puede lanzar subagentes en
paralelo que se saltan el gobernador de recursos o gastar contexto en cada turno.

Esta guardia es PURA: recibe el cfg ya leído (o `leer_config` lo lee del disco) y devuelve
hallazgos `{"id", "nivel", "texto", "arreglo"}`. JAMÁS imprime ni devuelve el valor de una
clave: solo su longitud. Contrato: architecture/repos-libreria-1025.md (grupo agentes).
"""

import json
import os
import re
import sys
from urllib.parse import urlparse

_CLAVE_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")
_SIN_CLAVE = "sin-clave"
_ILEGIBLE = "__ilegible__"


def _hallazgo(id_hallazgo, nivel, texto, arreglo):
    """Un hallazgo es un dict plano: id, nivel (bloquea|avisa), qué pasó y cómo arreglarlo."""
    return {"id": id_hallazgo, "nivel": nivel, "texto": texto, "arreglo": arreglo}


def _host_de_url(valor):
    """De una URL devuelve SOLO el host (sin ruta, puerto ni parámetros); si no es una
    cadena parseable, devuelve None para que el hallazgo no la nombre."""
    if not isinstance(valor, str):
        return None
    try:
        host = urlparse(valor).hostname
    except (ValueError, AttributeError):
        return None
    return host or None


def _revisar_plugins(cfg, plugins_admitidos, hallazgos):
    """Regla 1: cualquier plugin que no esté en la lista de admitidos bloquea, porque un
    plugin puede lanzar subagentes en paralelo que se salten el gobernador de recursos."""
    plugins = cfg.get("plugin")
    if not isinstance(plugins, list):
        return
    for entrada in plugins:
        if str(entrada) in plugins_admitidos:
            continue
        hallazgos.append(
            _hallazgo(
                "plugin-externo",
                "bloquea",
                "plugin externo «%s» en la configuración de opencode del enjambre"
                % (str(entrada),),
                "quítalo de `plugin` o añádelo a STARSEED_PLUGINS_OPENCODE_ADMITIDOS",
            )
        )


def _revisar_mcp(cfg, hallazgos):
    """Regla 2: cada MCP activo avisa — gasta contexto en cada turno del enjambre.
    Si la definición lleva `url`, el texto nombra solo el host, jamás ruta ni parámetros."""
    mcp = cfg.get("mcp")
    if not isinstance(mcp, dict):
        return
    for nombre, definicion in mcp.items():
        if isinstance(definicion, dict) and definicion.get("enabled") is False:
            continue
        host = _host_de_url(definicion.get("url") if isinstance(definicion, dict) else None)
        donde = " (host «%s»)" % (host,) if host else ""
        hallazgos.append(
            _hallazgo(
                "mcp-activo",
                "avisa",
                "MCP «%s» activo%s: gasta contexto en cada turno" % (str(nombre), donde),
                "ponle \"enabled\": false o quítalo de `mcp`",
            )
        )


def _revisar_claves(cfg, hallazgos):
    """Regla 3: una apiKey que no sea «sin-clave» ni la sintaxis literal {env:VARIABLE}
    bloquea. El hallazgo da el id del proveedor y la LONGITUD del valor, jamás el valor."""
    proveedores = cfg.get("provider")
    if not isinstance(proveedores, dict):
        return
    for id_prov, bloque in proveedores.items():
        if not isinstance(bloque, dict):
            continue
        opciones = bloque.get("options")
        if not isinstance(opciones, dict):
            continue
        valor = opciones.get("apiKey")
        if valor == _SIN_CLAVE:
            continue
        if isinstance(valor, str) and _CLAVE_ENV.match(valor):
            continue
        if isinstance(valor, str):
            tamano = "longitud %d" % len(valor)
        else:
            tamano = "valor de tipo inesperado (%s)" % type(valor).__name__
        hallazgos.append(
            _hallazgo(
                "clave-en-claro",
                "bloquea",
                "provider «%s» tiene una apiKey en claro (%s); jamás se escribe su valor"
                % (str(id_prov), tamano),
                "cámbiala por la sintaxis literal {env:VARIABLE} o por «sin-clave»",
            )
        )


def _revisar_lsp(cfg, hallazgos):
    """Regla 4: el servidor de lenguaje de TypeScript encendido avisa — un tsserver gasta
    ~2 GB en la Mac de 8 GB y el orquestador lo apaga a propósito."""
    lsp = cfg.get("lsp")
    typescript = lsp.get("typescript") if isinstance(lsp, dict) else None
    if not (isinstance(typescript, dict) and typescript.get("disabled") is True):
        hallazgos.append(
            _hallazgo(
                "lsp-typescript",
                "avisa",
                "lsp.typescript.disabled no está a true: un tsserver gasta ~2 GB en la Mac de 8 GB",
                "añade \"lsp\": {\"typescript\": {\"disabled\": true}} a la configuración",
            )
        )


def _revisar_permisos(cfg, hallazgos):
    """Regla 5: sin un dict `permission` con la clave `bash` faltan los vetos de terminal
    que la Mac lleva puestos; sin ellos un plugin podría ejecutar lo que quiera."""
    permisos = cfg.get("permission")
    if not (isinstance(permisos, dict) and "bash" in permisos):
        hallazgos.append(
            _hallazgo(
                "sin-vetos-bash",
                "avisa",
                "permission sin la clave bash: faltan los vetos de terminal del enjambre",
                "añade a `permission` el bloque `bash` con los mismos vetos de la Mac",
            )
        )


def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Función pura: recibe el cfg de opencode y devuelve la lista de hallazgos.

    Una entrada que no sea un dict (o el marcador de JSON roto de `leer_config`) produce un
    único hallazgo «config-ilegible» que bloquea. Nunca lanza: notifica y sigue.
    """
    if not isinstance(cfg, dict) or cfg.get(_ILEGIBLE) is True:
        return [
            _hallazgo(
                "config-ilegible",
                "bloquea",
                "la configuración de opencode no es un JSON legible: cualquier cambio del "
                "instalador pasará inadvertido",
                "restaura un opencode.json válido y vuelve a lanzar la guardia",
            )
        ]
    admitidos = set(plugins_admitidos)
    # admitidos puede llegar desde `main` como lista del entorno, ya partida por comas.
    hallazgos = []
    _revisar_plugins(cfg, admitidos, hallazgos)
    _revisar_mcp(cfg, hallazgos)
    _revisar_claves(cfg, hallazgos)
    _revisar_lsp(cfg, hallazgos)
    _revisar_permisos(cfg, hallazgos)
    return hallazgos


def leer_config(ruta):
    """Lee el JSON de `ruta` SIN convertirlo en cfg: archivo ausente → {} (nada que
    vigilar todavía); JSON roto → marcador {\"__ilegible__\": True} que la guardia
    convierte en hallazgo «config-ilegible». Nunca lanza."""
    try:
        with open(ruta, encoding="utf-8") as archivo:
            return json.load(archivo)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError, json.JSONDecodeError):
        return {_ILEGIBLE: True}


def plugins_de_entorno(valor):
    """La lista de plugins admitidos sale de STARSEED_PLUGINS_OPENCODE_ADMITIDOS, separada
    por comas; vacía por defecto. Es serie: sin la variable, todo plugin bloquea."""
    if not valor:
        return set()
    return {nombre.strip() for nombre in valor.split(",") if nombre.strip()}


def main(argv=None):
    """Imprime {\"hallazgos\": [...], \"bloquea\": N} para la ruta dada (por defecto
    ~/.config/opencode/opencode.json) y devuelve 1 si algo bloquea, 0 si no. NO escribe
    ningún archivo y no se engancha todavía al orquestador: lo decide Alex después."""
    ruta = sys.argv[1] if argv is None and len(sys.argv) > 1 else (argv[0] if argv else "~/.config/opencode/opencode.json")
    ruta = os.path.expanduser(ruta)
    plugins = plugins_de_entorno(os.environ.get("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", ""))
    hallazgos = auditar_config_opencode(leer_config(ruta), plugins)
    bloquean = sum(1 for h in hallazgos if h["nivel"] == "bloquea")
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquean}, ensure_ascii=False))
    return 1 if bloquean else 0


if __name__ == "__main__":
    sys.exit(main())
