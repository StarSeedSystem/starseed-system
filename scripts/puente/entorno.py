#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lee claves de entorno de forma segura (sin imprimir valores).

Lee ~/.starseed/env y ~/.hermes/.env aceptando formatos:
- export NOMBRE=valor
- NOMBRE=valor  
- NOMBRE="valor con comillas"
- NOMBRE='valor con comillas simples'

Nunca imprime el valor: solo devuelve el str o None.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Optional

RUTAS_CLAVES = (
    os.path.expanduser("~/.starseed/env"),
    os.path.expanduser("~/.hermes/.env"),
)


def _leer_clave_desde_archivo(nombre: str, ruta: str) -> Optional[str]:
    """Lee una clave de un archivo específico.

    Args:
        nombre: Nombre de la variable (sin =valor)
        ruta: Ruta al archivo .env

    Returns:
        Valor de la variable o None si no se encuentra
    """
    p = Path(ruta)
    if not p.exists():
        return None
    try:
        contenido = p.read_text(encoding="utf-8")
        for linea in contenido.splitlines():
            linea = linea.strip()
            if not linea or linea.startswith("#"):
                continue
            if linea.startswith("export "):
                linea = linea[7:].strip()
            if not linea.startswith(nombre + "="):
                continue
            _, valor = linea.split("=", 1)
            valor = valor.strip()
            if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
                valor = valor[1:-1]
            return valor if valor else None
    except OSError:
        pass
    return None


def _leer_clave_multifuente(nombre: str, rutas: List[str]) -> Optional[str]:
    """Lee una clave de múltiples archivos, en orden.

    Args:
        nombre: Nombre de la variable
        rutas: Lista de rutas de archivos .env

    Returns:
        Valor de la variable o None
    """
    for ruta in rutas:
        valor = _leer_clave_desde_archivo(nombre, ruta)
        if valor is not None:
            return valor
    return None


def leer_clave(nombre: str) -> Optional[str]:
    """Lee una clave de ~/.starseed/env o ~/.hermes/.env.

    Acepta líneas con 'export ' o sin ella, comillas simples/dobles,
    y valores sin comillas. Devuelve None si no se encuentra o está vacía.

    Args:
        nombre: Nombre de la variable (sin =valor)

    Returns:
        Valor de la variable o None si no se encuentra
    """
    valor = _leer_clave_multifuente(nombre, list(RUTAS_CLAVES))
    if valor is not None:
        return valor
    for ruta in os.environ:
        if ruta == nombre:
            return os.environ.get(ruta)
    return None