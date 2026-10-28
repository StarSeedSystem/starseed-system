#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Funciones puras para la asignación de modelos por papel y director en Genesis.

Lee `starseed_memory_root/mando/asignaciones-agentes.json` si existe, de lo contrario
cai en `MODELOS` y `STARSEED_OPUS_DIRECTOR`.

Funciones principales:
- leer_asignaciones_agentes(): Devuelve dict con papel->modelos y director->{habilitar: bool, modelos: list}
- modelo_por_papel(papel, asignaciones): Devuelve cadena de modelos para un papel
- habilitar_director(director, asignaciones): Devuelve bool si el director está habilitado
- modelos_director(director, asignaciones): Devuelve cadena de modelos para un director

Cómo llamarlo desde los consumidores:

En starseed-enjambre.py:
    from asignaciones_agentes import leer_asignaciones_agentes
    asignaciones = leer_asignaciones_agentes()
    escritor_models = modelo_por_papel('escritor', asignaciones)

En motores_director.py:
    from asignaciones_agentes import leer_asignaciones_agentes
    asignaciones = leer_asignaciones_agentes()
    if habilitar_director('chat', asignaciones):
        modelos = modelos_director('chat', asignaciones)

Tamaño: ≤ 120 líneas por archivo.
"""

import json
import os
from typing import Dict, List, Any, Optional

# Rutas: raíz del repositorio — este archivo vive en scripts/puente/, así que son dos
# niveles por encima de su carpeta (la misma forma que vigia_referencias.py y vecinos).
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
RUTA_ASIGNACIONES = os.path.join(RAIZ, "starseed_memory_root", "mando", "asignaciones-agentes.json")
# Importar modelos globales como valores de respaldo (evitar importar starseed-enjambre para mantener pureza); los consumidores deben proporcionar MODELOS_GLOBALES y STARSEED_OPUS_DIRECTOR por entorno.

def _leer_json(ruta: str) -> Dict[str, Any]:
    """Lee un archivo JSON si existe y es válido, de lo contrario devuelve un dict vacío."""
    try:
        if os.path.exists(ruta):
            with open(ruta, "r", encoding="utf-8") as f:
                datos = json.load(f)
                if not datos:
                    return {}
                if isinstance(datos, dict):
                    # Convertir None a dict vacío para claves que deben ser dict
                    if datos.get("por_papel") is None:
                        datos["por_papel"] = {}
                    if datos.get("por_director") is None:
                        datos["por_director"] = {}
                    return datos
    except (json.JSONDecodeError, OSError):
        pass
    return {}

def _obtener_valor(diccionario: Dict[str, Any], clave: str, predeterminado: Any) -> Any:
    """Obtiene un valor del diccionario, de lo contrario devuelve el valor predeterminado."""
    if not diccionario or clave not in diccionario:
        return predeterminado
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
         Dict con las claves "por_papel" y "por_director". "por_papel" mapea roles a listas de modelos. "por_director" mapea directores a objetos con "habilitado" (bool) y "modelos" (lista).
    """
    # Intentar leer asignaciones-agentes.json
    asignaciones = _leer_json(RUTA_ASIGNACIONES)

    # Valores de respaldo si el archivo está ausente
    if not asignaciones:
        asignaciones = {
             "por_papel": {
                 rol: modelos_globales or [] for rol in [
                     "escritor", "revisor", "chat", "visión", "imagen", "código"
                 ]
             },
             "por_director": {
                 director: {"habilitado": starseed_opus_director != "0", "modelos": modelos_globales or []}
                 for director in [
                     "chat", "optimizador", "diseño", "producción", "nube", "medidores", "aprendizaje"
                 ]
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
