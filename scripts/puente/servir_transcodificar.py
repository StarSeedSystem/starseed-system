#!/usr/bin/env python3
"""
Módulo para transcodificar videos a HLS con varias calidades.
"""

import shutil
import subprocess
from typing import List, Callable, Any


def ordenes_escalera(
    entrada: str, 
    salida_dir: str, 
    alturas: tuple[int, ...] = (1080, 720, 480, 240)
) -> List[str]:
    """Devuelve la orden de ffmpeg (lista de argumentos) para HLS con varias calidades.
    
    Args:
        entrada: Ruta al archivo de video de entrada.
        salida_dir: Directorio donde se escribirán los archivos de salida.
        alturas: Tupla de alturas de salida en píxeles (descendente).
    
    Returns:
        Lista de argumentos para ffmpeg (sin shell) que incluye la generación
        de múltiples flujos y el master.m3u8.
    """
    # TODO: Implementar
    raise NotImplementedError


def transcodificar(
    entrada: str, 
    salida_dir: str, 
    ejecutar: Callable[[List[str]], Any]
) -> None:
    """Ejecuta la transcodificación usando el ejecutor inyectable.
    
    Args:
        entrada: Ruta al archivo de video de entrada.
        salida_dir: Directorio donde se escribirán los archivos de salida.
        ejecutar: Función que toma una lista de argumentos y ejecuta el comando.
                  Debe levantar una excepción si el comando falla.
    
    Raises:
        FileNotFoundError: Si ffmpeg no está disponible en el sistema.
        RuntimeError: Si la transcodificación falla o supera el tiempo límite.
    """
    # TODO: Implementar
    raise NotImplementedError