"""
Módulo para transcodificar videos a HLS con múltiples calidades.
"""

import shutil
import subprocess
from typing import List, Tuple, Optional, Callable


def ordenes_escalera(
    entrada: str,
    salida_dir: str,
    alturas: Tuple[int, ...] = (1080, 720, 480, 240)
) -> List[str]:
    """
    Devuelve la orden de ffmpeg (lista de argumentos) para generar HLS con varias calidades
    y un master.m3u8, sin superar la altura original del video de entrada.
    Asume que las alturas proporcionadas son válidas (no superiores a la original).
    """
    if not alturas:
        raise ValueError("Se debe proporcionar al menos una altura")

    args = ["ffmpeg", "-i", entrada]

    # Construir el filtro complejo para dividir y escalar
    filter_parts = []
    label_parts = []
    for i, h in enumerate(alturas):
        label = f"v{i}"
        filter_parts.append(f"[0:v]scale=-2:{h}[{label}]")
        label_parts.append(f"[{label}]")

    split_label = ";".join(filter_parts)
    map_label = " ".join(label_parts)

    # Añadir el filter_complex
    args.extend(["-filter_complex", f"{split_label};{map_label}copy[out]"])

    # Mapear cada flujo de video escalado y el audio
    for i in range(len(alturas)):
        args.extend(["-map", f"[v{i}]", "-c:v:{i}", "libx264"])

    # Mapeamos el audio (asumimos que hay un flujo de audio)
    args.extend(["-map", "a:0?", "-c:a", "aac", "-b:a", "128k"])

    # Establecer bitrates de video (valores aproximados, pueden ajustarse)
    for i, h in enumerate(alturas):
        # Bitrate en kbps: altura * 12 (ejemplo muy aproximado)
        bitrate = h * 12
        args.extend([f"-b:v:{i}", f"{bitrate}k"])

    # Generar el maestro y los segmentos
    args.extend([
        "-var_stream_map", " ".join([f"v:{i},a:{i}" for i in range(len(alturas))]),
        "-master_pl_name", "master.m3u8",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_playlist_type", "event",
        "-hls_segment_file", f"{salida_dir}/v%v/%03d.ts",
        f"{salida_dir}/%v.m3u8"
    ])

    return args


def transcodificar(
    entrada: str,
    salida_dir: str,
    ejecutar: Optional[Callable[[List[str]], subprocess.CompletedProcess]] = None
) -> bool:
    """
    Ejecuta la transcodificación usando el ejecutor proporcionado (por defecto, subprocess.run).
    Devuelve True si tuvo éxito, False si ffmpeg no se encuentra o falla.
    """
    if ejecutar is None:
        ejecutar = subprocess.run

    # Comprobar si ffmpeg está disponible
    if not shutil.which("ffmpeg"):
        return False

    try:
        # Obtener la orden de ffmpeg
        cmd = ordenes_escalera(entrada, salida_dir)
        # Ejecutar el comando
        result = ejecutar(cmd, check=True, capture_output=True, text=True)
        return result.returncode == 0
    except subprocess.CalledProcessError:
        return False
    except Exception:
        return False