#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · deja OpenCode Zen configurado y dice si está activo (CAP1119).

Zen son los modelos GRATIS del propio opencode. No son una pasarela HTTP: solo responden
dentro de opencode (fuera da 403 FreeTierError), así que aquí NO se inventa un baseURL ni un
`npm`. Hace falta: (1) que `provider.opencode.models` declare los gratuitos —así Genesis y el
renovador los ven configurados— y (2) una credencial: `OPENCODE_API_KEY` en el entorno o en
los archivos, o el proveedor `opencode` en `auth.json` tras `opencode auth login`.

La clave JAMÁS se escribe: solo la sintaxis literal `{env:OPENCODE_API_KEY}`. `fusionar` y
`estado` son puras; el disco solo aparece en `detectar_clave`, `leer_config` y `main`.
"""

import argparse
import json
import os
import sys

PROVEEDOR = "opencode"
VARIABLE = "OPENCODE_API_KEY"
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"
RUTA_AUTH = "~/.local/share/opencode/auth.json"
ARCHIVOS_ENTORNO = ("~/.starseed/env", "~/.hermes/.env")

#: Mismo contrato que `MODELOS_ZEN_GRATIS` del orquestador (opencode/…): si allí cambia, aquí.
MODELOS_ZEN_GRATIS = (
    "opencode/glm-5.3-flash-free",
    "opencode/deepseek-v4.1-flash-free",
    "opencode/minimax-m3.1-flash-free",
    "opencode/big-pickle",
)
NOMBRES = {
    "glm-5.3-flash-free": "GLM 5.3 Flash (gratis)",
    "deepseek-v4.1-flash-free": "DeepSeek V4.1 Flash (gratis)",
    "minimax-m3.1-flash-free": "MiniMax M3.1 Flash (gratis)",
    "big-pickle": "Big Pickle (gratis)",
}


def _corto(modelo):
    """Id sin el prefijo `opencode/`: es la clave dentro de `provider.opencode.models`."""
    return str(modelo).split("/", 1)[-1]


def _modelos():
    return {_corto(m): {"name": NOMBRES.get(_corto(m), _corto(m))}
            for m in MODELOS_ZEN_GRATIS}


def bloque_zen(con_clave=True):
    """Bloque `provider.opencode` con los gratuitos. Nativo: sin baseURL, sin npm."""
    bloque = {"name": "OpenCode Zen", "models": _modelos()}
    if con_clave:
        bloque["options"] = {"apiKey": "{env:%s}" % VARIABLE}
    return bloque
