#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Funciones puras para asignación de modelos por papel y director.

Lee asignaciones-agentes.json o usa MODELOS y STARSEED_OPUS_DIRECTOR como respaldo.
Devuelve listas de modelos y booleanos de habilitación. Sin claves.

Funciones:
- leer_asignaciones_agentes(modelos_globales, starseed_opus_director)
- modelo_por_papel(papel, asignaciones)
- habilitar_director(director, asignaciones)
- modelos_director(director, asignaciones)

Uso en starseed-enjambre.py y motores_director.py (ver docstring detallado).
"""

import json
import os
from typing import Dict, List, Any, Optional

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_ASIGNACIONES = os.path.join(RAIZ, "starseed_memory_root", "mando", "asignaciones-agentes.json")

def _leer_json(ruta: str) -> Dict[str, Any]:
    """Lee un archivo JSON si existe y es válido, de lo contrario devuelve un dict vacío."""
    try:
        if os.path.exists(ruta):
            with open(ruta, "r", encoding="utf-8") as f:
                datos = json.load(f)
                if isinstance(datos, dict):
                    # Convertir None a dict vacío para claves que deben ser dict
                    if "por_papel" not in datos or datos["por_papel"] is None:
                        datos["por_papel"] = {}
                    if "por_director" not in datos or datos["por_director"] is None:
                        datos["por_director"] = {}
                    return datos
    except (json.JSONDecodeError, OSError):
        pass
    return {}

def _obtener_valor(dic: Dict[str, Any], key: str, default: Any) -> Any:
    return dic.get(key, default) if dic else default

def leer_asignaciones_agentes(
    modelos_globales: Optional[List[str]] = None,
    starseed_opus_director: Optional[str] = None,
) -> Dict[str, Any]:
    asignaciones = _leer_json(RUTA_ASIGNACIONES)
    if not asignaciones:
        roles = ["escritor", "revisor", "chat", "visión", "imagen", "código"]
        directores = ["chat", "optimizador", "diseño", "producción", "nube", "medidores", "aprendizaje"]
        asignaciones = {
            "por_papel": {role: modelos_globales or [] for role in roles},
            "por_director": {
                director: {
                    "habilitado": starseed_opus_director != "0",
                    "modelos": modelos_globales or []
                }
                for director in directores
            },
        }
    return asignaciones

def modelo_por_papel(papel: str, asignaciones: Dict[str, Any]) -> List[str]:
    return _obtener_valor(asignaciones.get("por_papel", {}), papel, [])

def habilitar_director(director: str, asignaciones: Dict[str, Any]) -> bool:
    return _obtener_valor(
        asignaciones.get("por_director", {}),
        director,
        {"habilitado": False}
    ).get("habilitado", False)

def modelos_director(director: str, asignaciones: Dict[str, Any]) -> List[str]:
    return _obtener_valor(
        asignaciones.get("por_director", {}),
        director,
        {"modelos": []}
    ).get("modelos", [])