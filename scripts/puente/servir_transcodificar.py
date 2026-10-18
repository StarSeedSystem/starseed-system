"""Módulo para transcodificar videos a HLS con múltiples calidades.

Este módulo proporciona funciones para generar órdenes de ffmpeg para crear
una escalera de calidades HLS y para ejecutar la transcodificación de forma
segura con control de tiempo y comprobación de la disponibilidad de ffmpeg.
"""

import shutil
import subprocess
import os
from typing import List, Tuple, Callable, Optional


def ordenes_escalera(
    entrada: str,
    salida_dir: str,
    alturas: Tuple[int, ...] = (1080, 720, 480, 240)
) -> List[List[str]]:
    """Genera las órdenes de ffmpeg para crear una escalera de calidades HLS.

    Args:
        entrada: Ruta al archivo de video de entrada.
        salida_dir: Directorio donde se guardarán los archivos de salida.
        alturas: Tupla de alturas deseadas para la escalera (en píxeles).
                 Se procesan en orden descendente y se omite cualquier altura
                 que supere la altura original del video (responsabilidad del llamador).

    Returns:
        Lista que contiene una sola orden de ffmpeg (lista de argumentos, sin shell)
        para generar la escalera HLS y el master playlist.
    """
    bitrates = {1080: 5000, 720: 3000, 480: 1500, 240: 800}
    filter_parts, map_parts, variant_playlists = [], [], []
    for i, altura in enumerate(alturas):
        bitrate = bitrates.get(altura, 800)
        label = f"v{i}"
        filter_parts.extend([f"[0:v]split[{label}][{label}out]", f"[{label}out]scale=-2:{altura}[vout{i}]"])
        map_parts.append(f"-map '[vout{i}]' -map 0:a?")
        variant_playlists.append(f"video_{altura}.m3u8")
    filter_complex = ";".join(filter_parts)
    cmd = ["ffmpeg", "-i", entrada, "-filter_complex", filter_complex]
    cmd.extend(" ".join(map_parts).split())
    for i, altura in enumerate(alturas):
        bitrate = bitrates.get(altura, 800)
        cmd.extend([f"-c:v:{i}", "libx264", f"-b:v:{i}", f"{bitrate}k", f"-s:v:{i}", f"-2:{altura}"])
    cmd.extend(["-c:a", "aac", "-b:a", "128k"])
    cmd.extend([
        "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
        "-hls_segment_filename", os.path.join(salida_dir, "video_%v_%03d.ts"),
        "-master_pl_name", "master.m3u8",
    ])
    for playlist in variant_playlists:
        cmd.append(os.path.join(salida_dir, playlist))
    return [cmd]


def transcodificar(
    entrada: str,
    salida_dir: str,
    ejecutar: Callable[[List[str], float], Tuple[int, str, str]],
    timeout: float = 30.0
) -> Tuple[bool, str]:
    """Ejecuta la transcodificación usando un ejecutor inyectable.

    Args:
        entrada: Ruta al archivo de video de entrada.
        salida_dir: Directorio donde se guardarán los archivos de salida.
        ejecutar: Función que toma una lista de argumentos y un timeout,
                  y devuelve (código de retorno, stdout, stderr).
        timeout: Tiempo máximo en segundos para la transcodificación.

    Returns:
        Tupla (éxito, mensaje). Éxito es True si la transcodificación
        terminó correctamente, False en caso de error. El mensaje contiene
        detalles del resultado o del error.
    """
    if shutil.which("ffmpeg") is None:
        return False, "ffmpeg no encontrado en el PATH"
    try:
        comandos = ordenes_escalera(entrada, salida_dir)
    except Exception as e:
        return False, f"Error al generar la orden de ffmpeg: {str(e)}"
    if not comandos:
        return False, "No se generó ninguna orden de transcodificación"
    comando = comandos[0]
    try:
        returncode, stdout, stderr = ejecutar(comando, timeout)
    except Exception as e:
        return False, f"Error al ejecutar la transcodificación: {str(e)}"
    if returncode == 0:
        return True, "Transcodificación completada exitosamente"
    error_msg = f"ffmpeg devolvió código de error {returncode}. stderr: {stderr}"
    return False, error_msg