#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo puro para detectar proveedores que requieren check-in diario.

Funciones:
    necesita_checkin(salud: dict, registros: list[str]) -> list[tuple[str, str]]
    mensaje(proveedor: str, enlace: str) -> str
"""

from typing import Dict, List, Tuple
import re

# Importamos el módulo pasarelas para acceder al catálogo de enlaces
try:
    from . import pasarelas
except ImportError:
    # Fallback para cuando se ejecuta como script o en pruebas
    import pasarelas


def necesita_checkin(salud: Dict[str, dict], registros: List[str]) -> List[Tuple[str, str]]:
    """Detecta proveedores que requieren check-in diario.

    Args:
        salud: Diccionario con el estado de los proveedores (como el leído de
            ~/.starseed/salud-proveedores.json).
        registros: Lista de cadenas que representan registros recientes (por
            ejemplo, líneas de log o eventos) donde buscar indicios de
            check-in requerido.

    Returns:
        Lista de tuplas (proveedor, enlace) para los proveedores que necesitan
        check-in. El enlace es conocido para apinex y para otros es el dominio
        de su URL.
    """
    necesita = []
    # Patrones para detectar la necesidad de check-in (case-insensitive)
    patron = re.compile(r'check-in\s+required|daily\s+check-in', re.IGNORECASE)

    # 1. Revisar el motivo en el estado de salud de cada proveedor
    for proveedor, info in salud.items():
        motivo = info.get('motivo', '')
        if patron.search(motivo):
            enlace = _enlace_para_proveedor(proveedor)
            if enlace:
                necesita.append((proveedor, enlace))

    # 2. Revisar los registros recientes
    # Asumimos que cada registro puede contener información de un proveedor.
    # Sin embargo, no sabemos el formato exacto. Para simplificar, buscamos
    # cualquier registro que contenga el patrón y luego intentamos asociarlo
    # a un proveedor conocido en el salud.
    # Esta aproximación puede producir falsos positivos si el patrón aparece
    # sin estar asociado a un proveedor, pero es lo mejor que podemos hacer
    # sin más contexto.
    for registro in registros:
        if patron.search(registro):
            # Intentamos extraer el nombre del proveedor del registro.
            # Buscamos nombres de proveedores conocidos en el salud.
            for proveedor in salud.keys():
                if proveedor in registro:
                    enlace = _enlace_para_proveedor(proveedor)
                    if enlace:
                        necesita.append((proveedor, enlace))
                    break  # Asumimos un proveedor por registro

    # Eliminar duplicados manteniendo el orden
    visto = set()
    resultado = []
    for item in necesita:
        if item not in visto:
            visto.add(item)
            resultado.append(item)
    return resultado


def mensaje(proveedor: str, enlace: str) -> str:
    """Genera el mensaje de aviso para Alex.

    Args:
        proveedor: Nombre del proveedor que requiere check-in.
        enlace: URL de check-in para el proveedor.

    Returns:
        Cadena con el formato de aviso especificado.
    """
    return f"AVISO A ALEX · {proveedor} pide check-in diario: {enlace} · queda apartado hasta que vuelva a responder; cuando lo hagas, escribe /checkin {proveedor} al bot o starseed-puente decir «checkin {proveedor}»"


def _enlace_para_proveedor(proveedor: str) -> str:
    """Obtiene el enlace de check-in para un proveedor.

    Para apinex, devuelve el enlace conocido.
    Para otros proveedores, devuelve el dominio de su URL del catálogo de
    pasarelas (si está disponible) o una cadena vacía si no se encuentra.

    Args:
        proveedor: Nombre del proveedor.

    Returns:
        Enlace de check-in o cadena vacía si no se puede determinar.
    """
    if proveedor == "apinex":
        return "https://apinex.bond/airdrop?tab=quests"

    # Intentamos obtener el enlace del catálogo de pasarelas
    try:
        info = pasarelas.CATALOGO.get(proveedor, {})
        enlace = info.get("enlace", "")
        if enlace:
            # Extraemos el dominio (por ejemplo, de "https://api.xkiro.com/" obtenemos "api.xkiro.com")
            # Pero el enlace puede ser solo el dominio o tener path. Nos quedamos con el netloc.
            from urllib.parse import urlparse
            parsed = urlparse(enlace)
            if parsed.netloc:
                return parsed.netloc
            # Si no tiene netloc, asumimos que es el dominio sin esquema
            if enlace.startswith('http'):
                # Intentamos de nuevo sin esquema
                parsed = urlparse('//' + enlace)
                if parsed.netloc:
                    return parsed.netloc
            return enlace  # Devolvemos tal cual si no podemos parsear
    except Exception:
        pass
    return ""