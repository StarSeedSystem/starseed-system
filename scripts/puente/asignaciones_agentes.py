#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Funciones puras para la asignación de modelos por papel y director en Genesis.

Proporciona la cadena de modelos por papel (escritor, revisor, chat, visión, imagen, código)
por papel y por director (chat, optimizador, diseño, producción, nube, medidores, aprendizaje),
leer `starseed_memory_root/mando/asignaciones-agentes.json` si existe, de lo contrario
cae en `MODELOS` de `starseed-enjambre.py` y `STARSEED_OPUS_DIRECTOR` de motores_director.py.
Sin guardar ni devolver claves; solo devuelve listas de cadenas (modelos) y bool por director.

Funciones principales:
- `leer_asignaciones_agentes()`: Devuelve un dict con papel->modelos y director->{habilitar: bool, modelos: list}
- `modelo_por_papel(papel, asignaciones)`: Devuelve la cadena de modelos para un papel dado
- `habilitar_director(director, asignaciones)`: Devuelve si el director está habilitado
- `modelos_director(director, asignaciones)`: Devuelve la cadena de modelos para un director dado

Cómo llamarlo desde los consumidores:

En `starseed-enjambre.py`:
    from asignaciones_agentes import leer_asignaciones_agentes
    # dentro de una función o método:
    asignaciones = leer_asignaciones_agentes()
    escritor_models = modelo_por_papel('escritor', asignaciones)
    # o para un director específico:
    director_models = modelos_director('chat', asignaciones)

En `motores_director.py`:
    from asignaciones_agentes import leer_asignaciones_agentes
    # dentro de una función o método:
    asignaciones = leer_asignaciones_agentes()
    # verificar si el director está habilitado:
    if habilitar_director('chat', asignaciones):
        modelos = modelos_director('chat', asignaciones)

Tamaño: ≤ 120 líneas por archivo.
"""

import json
import os
from typing import Dict, List, Any, Optional

# Rutas
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_ASIGNACIONES = os.path.join(
    RAIZ,
    "starseed_memory_root",
    "mando",
    "asignaciones-agentes.json",
)
# Importar modelos globales como valores de respaldo (evitar importar starseed-enjambre para mantener pureza)
# Los consumidores deben proporcionar MODELOS_GLOBALES y STARSEED_OPUS_DIRECTOR por entorno.

def _leer_json(ruta: str) -> Dict[str, Any]:
    """Lee un archivo JSON si existe y es válido, de lo contrario devuelve un dict vacío."""
    try:
        if os.path.exists(ruta):
            with open(ruta, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, OSError):
        pass
    return {}

def _obtener_valor(diccionario: Dict[str, Any], clave: str, predeterminado: Any) -> Any:
    """Obtiene un valor del diccionario, de lo contrario devuelve el valor predeterminado."""
    return diccionario.get(clave, predeterminado)

def leer_asignaciones_agentes(
    modelos_globales: Optional[List[str]] = None,
    starseed_opus_director: Optional[str] = None,
) -> Dict[str, Any]:
    """Devuelve la asignación completa de modelos por papel y director.

    Args:
        modelos_globales: MODELOS de starseed-enjambre.py como respaldo si asignaciones-agentes.json está ausente.
        starseed_opus_director: STARSEED_OPUS_DIRECTOR de motores_director.py como respaldo si está ausente.

    Returns:
        Dict con estructura:
        {
            "por_papel": {"escritor": [modelos], "revisor": [modelos], ...},
            "por_director": {
                "chat": {"habilitado": bool, "modelos": [modelos]},
                "optimizador": {"habilitado": bool, "modelos": [modelos]},
                ...
            }
        }
    """
    # Intentar leer asignaciones-agentes.json
    asignaciones = _leer_json(RUTA_ASIGNACIONES)

    # Valores de respaldo si el archivo está ausente
    if not asignaciones:
        asignaciones = {
            "por_papel": {
                "escritor": modelos_globales or [],
                "revisor": modelos_globales or [],
                "chat": modelos_globales or [],
                "visión": modelos_globales or [],
                "imagen": modelos_globales or [],
                "código": modelos_globales or [],
            },
            "por_director": {
                "chat": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
                "optimizador": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
                "diseño": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
                "producción": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
                "nube": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
                "medidores": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
                "aprendizaje": {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []},
            },
        }

    return asignaciones

def modelo_por_papel(papel: str, asignaciones: Dict[str, Any]) -> List[str]:
    """Devuelve la cadena de modelos para un papel dado."""
    return _obtener_valor(_obtener_valor(asignaciones, "por_papel", {}), papel, [])

def habilitar_director(director: str, asignaciones: Dict[str, Any]) -> bool:
    """Devuelve si el director está habilitado."""
    return _obtener_valor(
        _obtener_valor(asignaciones, "por_director", {}),
        director,
        {"habilitado": False, "modelos": []},
    ).get("habilitado", False)

def modelos_director(director: str, asignaciones: Dict[str, Any]) -> List[str]:
    """Devuelve la cadena de modelos para un director dado."""
    return _obtener_valor(
        _obtener_valor(asignaciones, "por_director", {}),
        director,
        {"habilitado": False, "modelos": []},
    ).get("modelos", [])
