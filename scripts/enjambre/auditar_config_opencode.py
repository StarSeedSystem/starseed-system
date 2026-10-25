# -*- coding: utf-8 -*-
"""Guardia PURA de la configuración de opencode del enjambre (Ola 1025R · AGT1025E).

La `~/.config/opencode/opencode.json` que escribe el orquestador
(`refrescar_bloque_opencode` en `starseed-enjambre.py`: apiKey siempre como
`{env:VARIABLE}` o «sin-clave», `lsp.typescript.disabled = true` porque un
tsserver gasta ~2 GB en la Mac de 8 GB, vetos en `permission.bash`) puede ser
editada por fuera: oh-my-opencode-slim añade plugins y propone variables, y un
MCP o un plugin colados lanzan subagentes que se saltan el gobernador. Esta
guardia la LEE y avisa: no escribe ningún archivo y NO se engancha todavía al
orquestador (eso lo decide Alex). Python 3, solo biblioteca estándar.
"""

import json
import os
import re
import sys
from urllib.parse import urlsplit

# Única sintaxis de apiKey que admite el orquestador: el NOMBRE de la variable.
_ENV = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")


def _hallazgo(ident, nivel, texto, arreglo):
    return {"id": ident, "nivel": nivel, "texto": texto, "arreglo": arreglo}


def _plugins(cfg, admitidos):
    """Regla 1: un plugin no admitido puede lanzar subagentes ajenos presumidos."""
    crudos = cfg.get("plugin")
    if isinstance(crudos, str):
        crudos = [crudos]
    if not isinstance(crudos, list):
        return []
    admitidos = set(admitidos)
    return [
        _hallazgo(
            "plugin-externo",
            "bloquea",
            "El plugin «%s» no está en los admitidos del enjambre: puede lanzar "
            "subagentes en paralelo que se salten el gobernador de recursos." % entrada,
            "Quítalo de `plugin` o decláralo en STARSEED_PLUGINS_OPENCODE_ADMITIDOS "
            "tras revisarlo de verdad.",
        )
        for entrada in crudos
        if entrada not in admitidos
    ]


def _mcp(cfg):
    """Regla 2: cada MCP activo gasta contexto en cada turno de cada agente."""
    servidores = cfg.get("mcp")
    if not isinstance(servidores, dict):
        return []
    hallazgos = []
    for nombre, definicion in servidores.items():
        if isinstance(definicion, dict) and definicion.get("enabled") is False:
            continue
        texto = "El MCP «%s» está activo y gasta contexto en cada turno." % nombre
        if isinstance(definicion, dict) and isinstance(definicion.get("url"), str):
            # Solo el HOST: sin ruta ni parámetros (nunca filtrar nada sensible).
            host = urlsplit(definicion["url"]).hostname or ""
            texto += " Servidor remoto en el host «%s»." % host
        hallazgos.append(
            _hallazgo(
                "mcp-activo",
                "avisa",
                texto,
                "Ponle `enabled: false` si no se usa en este momento.",
            )
        )
    return hallazgos


def _proveedores(cfg):
    """Regla 3: una apiKey en claro en `provider.<id>.options.apiKey` bloquea."""
    proveedores = cfg.get("provider")
    if not isinstance(proveedores, dict):
        return []
    hallazgos = []
    for pid, bloque in proveedores.items():
        opciones = bloque.get("options") if isinstance(bloque, dict) else None
        if not isinstance(opciones, dict) or "apiKey" not in opciones:
            continue
        clave = opciones["apiKey"]
        if clave == "sin-clave" or _ENV.match(str(clave)):
            continue
        # Solo la LONGITUD: jamás el valor ni parte de él.
        hallazgos.append(
            _hallazgo(
                "clave-en-claro",
                "bloquea",
                "El proveedor «%s» lleva una apiKey en claro de %d caracteres; el "
                "orquestador solo escribe «{env:VARIABLE}» o «sin-clave»."
                % (pid, len(str(clave))),
                "Sustitúyela por «{env:NOMBRE_DE_VARIABLE}»: el valor vive solo en "
                "archivos de entorno (~/.starseed/env, ~/.hermes/.env).",
            )
        )
    return hallazgos


def _lsp(cfg):
    """Regla 4: sin `lsp.typescript.disabled`, un tsserver se come la Mac."""
    tipos = cfg.get("lsp")
    if (
        isinstance(tipos, dict)
        and isinstance(tipos.get("typescript"), dict)
        and tipos["typescript"].get("disabled") is True
    ):
        return []
    return [
        _hallazgo(
            "lsp-typescript",
            "avisa",
            "`lsp.typescript.disabled` no es true: un tsserver gasta ~2 GB en la "
            "Mac de 8 GB, y cada motor con LSP encendido la tumbaría.",
            "Añade `\"lsp\": {\"typescript\": {\"disabled\": true}}`.",
        )
    ]


def _permisos(cfg):
    """Regla 5: sin `permission.bash` nadie veta las órdenes prohibidas de la Mac."""
    permisos = cfg.get("permission")
    if isinstance(permisos, dict) and "bash" in permisos:
        return []
    return [
        _hallazgo(
            "sin-vetos-bash",
            "avisa",
            "No hay vetos en `permission.bash`: la Mac lleva órdenes vetadas que "
            "cualquier motor del enjambre ejecutaría sin preguntar.",
            "Restaura el bloque `permission.bash` con los vetos de la Mac.",
        )
    ]


def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Devuelve puros hallazgos de `cfg` (dict de la config de opencode): cada uno
    {id, nivel, texto, arreglo}. ¿Por qué puro? Se puede encajar en el orquestador,
    en un director Python o en una prueba, sin tocar disco ni lanzar nada.
    Entrada que no sea dict (o marcada «__ilegible__») → un solo hallazgo que
    bloquea. Nunca lanza."""
    if not isinstance(cfg, dict) or cfg.get("__ilegible__") is True:
        return [
            _hallazgo(
                "config-ilegible",
                "bloquea",
                "La configuración no se pudo leer como JSON de objeto: la guardia "
                "no puede opinar de lo que no ve.",
                "Abre el archivo, arregla su sintaxis y guarda de nuevo.",
            )
        ]
    return (
        _plugins(cfg, plugins_admitidos)
        + _mcp(cfg)
        + _proveedores(cfg)
        + _lsp(cfg)
        + _permisos(cfg)
    )


def leer_config(ruta):
    """Lee el JSON de `ruta`; archivo ausente → {} y JSON roto → el marcador
    «__ilegible__» que la guardia convierte en «config-ilegible»."""
    try:
        with open(ruta, encoding="utf-8") as archivo:
            return json.load(archivo)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {"__ilegible__": True}


def main(argv=None):
    """Imprime «{hallazgos: […], bloquea: N}» en stdout y devuelve 1 si hay
    hallazgos que bloquean (0 si no). Los plugins admitidos salen de la variable
    STARSEED_PLUGINS_OPENCODE_ADMITIDOS (separados por comas, vacía por defecto)."""
    argumentos = list(sys.argv[1:] if argv is None else argv)
    ruta = argumentos[0] if argumentos else os.path.expanduser(
        "~/.config/opencode/opencode.json"
    )
    variables = os.environ.get("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "")
    admitidos = [n for n in variables.split(",") if n]
    hallazgos = auditar_config_opencode(leer_config(ruta), admitidos)
    print(
        json.dumps(
            {
                "hallazgos": hallazgos,
                "bloquea": sum(1 for h in hallazgos if h["nivel"] == "bloquea"),
            },
            ensure_ascii=False,
        )
    )
    return 1 if any(h["nivel"] == "bloquea" for h in hallazgos) else 0
