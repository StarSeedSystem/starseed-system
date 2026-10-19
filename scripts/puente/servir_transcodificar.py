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
    import os
    # Ensure salida_dir es un path absoluto? Lo usamos tal cual y unimos con nombres de archivo.
    # Crearemos las rutas de salida dentro de salida_dir.
    # Definimos bitrates para las alturas dadas.
    bitrate_map = {1080: 5000, 720: 3000, 480: 1000, 240: 500}
    # Bitrate por defecto si la altura no está en el mapa: 1000 kbps
    def get_bitrate(h):
        return bitrate_map.get(h, 1000)
    
    # Construir la orden de ffmpeg
    cmd = ['ffmpeg', '-i', entrada]
    
    # Maps: para cada altura, mapeamos video y audio
    maps = []
    for i in range(len(alturas)):
        maps.extend(['-map', '0:v'])
        maps.extend(['-map', '0:a?'])
    cmd.extend(maps)
    
    # Opciones por flujo: filtro de video, codec, bitrate
    for i, altura in enumerate(alturas):
        cmd.extend([f'-vf:v:{i}', f'scale=-2:{altura}'])
        cmd.extend([f'-c:v:{i}', 'libx264'])
        cmd.extend([f'-b:v:{i}', f'{get_bitrate(altura)}k'])
    
    # Codec de audio: copiar para todos los flujos de audio
    cmd.extend(['-c:a', 'copy'])
    
    # Opciones HLS
    cmd.extend([
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', os.path.join(salida_dir, 'stream_%v_%03d.ts'),
        '-master_pl_name', os.path.join(salida_dir, 'master.m3u8'),
        '-var_stream_map', ' '.join([f'v:{i},a:{i}' for i in range(len(alturas))])
    ])
    
    # Patrón de salida para las playlists de variante (uno por variante)
    cmd.append(os.path.join(salida_dir, 'stream_%v.m3u8'))
    
    return cmd


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
        RuntimeError: Si la transcodificación falla o supera el tiempo límite (dependiendo del ejecutor).
    """
    if shutil.which('ffmpeg') is None:
        raise FileNotFoundError('ffmpeg no está disponible en el sistema')
    
    cmd = ordenes_escalera(entrada, salida_dir)
    ejecutar(cmd)