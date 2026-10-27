#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extractor web con ScrapeGraphAI (Ola 1025R · tarea INV1025C).

ANTES de importar nada pone `os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"]="false"`
y se niega a arrancar si vale otra cosa (R9). Usa `lector_cortes` para URLs,
construye SmartScraperGraph con la IA local y valida contra esquema JSON.
"""

import os
import sys

# R9: telemetría desactivada obligatoria ANTES de importar scrapegraphai
os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"
if os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED") != "false":
    sys.exit("Error crítico: la telemetría de ScrapeGraphAI debe estar desactivada (R9).")

import json
import http.server
import urllib.parse
from scripts.puente.lector_cortes import leer as leer_cortes, obtener_url_http

MAX_BYTES_SALIDA = 20480


def verificar_scrapegraphai():
    """Comprueba si scrapegraphai está instalada y devuelve hint si no."""
    try:
        import scrapegraphai  # noqa: F401
        return True
    except ImportError:
        return False


def hint_instalacion():
    """Hint con el comando de instalación en entorno virtual de scrapegraph."""
    return (
        "python3 -m venv ~/.starseed/venvs/scrapegraph && "
        "~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'"
    )


def validar_esquema(datos, esquema):
    """Valida los datos extraídos contra un esquema JSON si jsonschema está disponible."""
    if not esquema:
        return True, None
    try:
        import jsonschema
        jsonschema.validate(instance=datos, schema=esquema)
        return True, None
    except ImportError:
        return True, None
    except Exception as error:
        return False, str(error)


def recortar_resultado(texto):
    """Recorta el texto o json a 20 KB máximo."""
    if isinstance(texto, str):
        encoded = texto.encode("utf-8")
        if len(encoded) > MAX_BYTES_SALIDA:
            return encoded[:MAX_BYTES_SALIDA].decode("utf-8", "replace")
        return texto
    if isinstance(texto, (dict, list)):
        serializado = json.dumps(texto, ensure_ascii=False)
        if len(serializado.encode("utf-8")) > MAX_BYTES_SALIDA:
            return {"ok": False, "hint": "Resultado excede 20 KB"}
        return texto
    return texto
