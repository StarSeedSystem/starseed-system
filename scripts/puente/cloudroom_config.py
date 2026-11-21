# -*- coding: utf-8 -*-
"""Configuración y activación de Cloudroom (Ola CAP1119).
Provee funciones puras y auxiliares para gestionar la activación, parámetros
y estado de Cloudroom en MetaGenesis.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict

DEFAULT_PATH = os.path.expanduser("~/.starseed/cloudroom-config.json")

CONFIG_DEFECTO: Dict[str, Any] = {
    "activo": False,
    "tope_dia": 5,
    "max_vivos": 3,
    "modelo_preferido": "auto"
}


def cargar_configuracion(path: str = DEFAULT_PATH) -> Dict[str, Any]:
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    merged = dict(CONFIG_DEFECTO)
                    merged.update(data)
                    return merged
    except Exception:
        pass
    return dict(CONFIG_DEFECTO)


def guardar_configuracion(config: Dict[str, Any], path: str = DEFAULT_PATH) -> Dict[str, Any]:
    merged = dict(CONFIG_DEFECTO)
    if isinstance(config, dict):
        merged.update(config)
    dir_name = os.path.dirname(path)
    if dir_name and not os.path.exists(dir_name):
        os.makedirs(dir_name, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    return merged


def activar_cloudroom(activar: bool = True, path: str = DEFAULT_PATH) -> Dict[str, Any]:
    cfg = cargar_configuracion(path=path)
    cfg["activo"] = bool(activar)
    return guardar_configuracion(cfg, path=path)
