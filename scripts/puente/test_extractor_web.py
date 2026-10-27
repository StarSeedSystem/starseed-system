#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test_extractor_web (INV1025C · Ola 1025R): unittest —corre en PHPUnit vía procfs
script y pytest parece no estar; sin mocks de Node (aquí no existe arteria alguna).

Cubre lector_cortes (esquema, SSRF en mas cupboard o tras salto, robots, pausa, saltos,
cabecera X-Robots-Tag, <meta robots>, tipos, estado, tamano, reloj, GET real en lopo)
y extractor_web (telemetría, entrada, config, grafo, jsonschema recorte cupo servidor
con token). Estilo vigia_: ctx inyectable con dicts, nada de importar route.py.
"""

import json
import os
import sys
import threading
import unittest
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extractor_web import (  # noqa: E402
    HINT_INSTALAR,
    TOPE_RESPUESTA,
    _TELES,
    construir_servidor,
    extraer,
)
import extractor_web  # noqa: E402
import lector_cortes  # noqa: E402
from lector_cortes import crear_ctx, leer  # noqa: E402

ROBOTS_ABIERTO = b"User-agent: *\nAllow: /\n"
ROBOTS_PRIVADO = b"User-agent: *\nDisallow: /privado/\n"
HTML_PLANO = b"<html><body><p>jard\u00edn</p></body></html>"


def _respuesta(status=200, cabeceras=None, cuerpo=HTML_PLANO):
    return {"status": status, "cabeceras": dict(cabeceras or {}), "cuerpo": cuerpo}


class RedFalsa(dict):
    """ctx["peticion"] de juguete sobre un dict {url → respuesta}; lleva hitas de qué
    URL se pidió (para contar robots) y puede decir None (red fail)."""

    def __init__(self, mapa, fallos=()):
        super().__init__(mapa)
        self.fallos = set(fallos)
        self.pedidas = []

    def __call__(self, url, timeout):
        self.pedidas.append(url)
        if url in self.fallos:
            return None
        return self.get(url)
