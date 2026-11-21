#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y prueba de Cloudroom como medio del enjambre (CAP1119).

Deja en `~/.starseed/cloudroom-config.json` los ajustes que el resto del sistema leerá en la
próxima ola (ritmo del cupo, hilos a la vez, tiempos de gracia, CLI y proyecto), con valores por
defecto honestos y validación de tipos y rangos. No guarda claves: solo los NOMBRES de variable
que la nube de Cloudroom debe tener (`room-cli cloud env`), que se comprueban contra
`cloud env list --json`.

  cloudroom_config.py ver [--json]
  cloudroom_config.py activar [--json]
  cloudroom_config.py desactivar [--json]
  cloudroom_config.py configurar --max-vivos 2 --tope-dia 4 [--json]
  cloudroom_config.py probar [--sin-red] [--json]

`probar` es la prueba del medio: config válida, activado, CLI encontrada, sesión iniciada,
modelos gratuitos declarados y sus claves presentes en la nube. Sale con código 1 si algo falla.
Las decisiones son PURAS (`validar`, `fusionar`, `evaluar`, `prueba`) y se prueban en
`test_cloudroom_config.py`, sin room-cli, sin red y sin disco.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
RUTA_DEFECTO = os.path.expanduser("~/.starseed/cloudroom-config.json")
PI_MODELOS = os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json")

#: Ajustes del medio. Los topes reales del plan (100 hilos/30 días, 3 a la vez) no se inventan:
#: son los que Cloudroom publica; aquí solo se administra cómo los reparte el enjambre.
DEFAULTS = {
    "activo": False,
    "max_vivos": 3,
    "tope_dia": 6,
    "ciclo_total": 100,
    "repetir_tras_h": 24,
    "max_por_tarea": 2,
    "gracia_h": 12,
    "pausa_medio_h": 12,
    "tope_cli_s": 45,
    "proyecto": "",
    "cli": "",
    "pi_modelos": "",
    "permisos": "full",
}

#: Rangos de los enteros ajustables (mínimo, máximo), en las unidades que dice su nombre.
REGLAS = {
    "max_vivos": (1, 10),
    "tope_dia": (0, 100),
    "ciclo_total": (1, 1000),
    "repetir_tras_h": (1, 168),
    "max_por_tarea": (1, 5),
    "gracia_h": (1, 72),
    "pausa_medio_h": (0, 72),
    "tope_cli_s": (5, 300),
}
PERMISOS = ("full", "ask")
TEXTOS = ("proyecto", "cli", "pi_modelos")
