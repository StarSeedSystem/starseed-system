# -*- coding: utf-8 -*-
"""Cortes y continuidad de la película de scroll (architecture/contenido-vivo.md §5).

Dos preguntas: ¿el clip tiene cortes dentro de sí y ¿toda la película se lee como un
solo movimiento de cámara? El juez es la SSIM de pares vecinos con ffmpeg; cada par
se valora contra su mediana LOCAL (ventana ±3), y la parte pura va aparte del binario.
"""

from __future__ import annotations

import shutil
import statistics
import subprocess
from pathlib import Path
from typing import List, Sequence, Tuple

VENTANA = 3
PORCENTAJE_CORTE = 0.45
UMBRAL_CONGELADO = 0.995
MINIMO_PARES = 3
MAXIMO_CONGELADOS = 2

def mediana_local(pares: Sequence[float], i: int, ventana: int = VENTANA) -> float:
    """Mediana de los pares en la ventana ±VENTANA alrededor del par i."""
    inicio = max(0, i - ventana)
    fin = min(len(pares), i + ventana + 1)
    return statistics.median(pares[inicio:fin])


def etiquetas(
    pares: Sequence[float],
    umbral_corte: float = PORCENTAJE_CORTE,
    umbral_congelado: float = UMBRAL_CONGELADO,
) -> List[str]:
    """Un rótulo por par: «corte», «congelado» u «ok», contra su mediana local."""
    return [
        "corte" if s < umbral_corte * mediana_local(pares, i)
        else "congelado" if s > umbral_congelado
        else "ok"
        for i, s in enumerate(pares)
    ]


def veredicto(rótulos: Sequence[str], medidos: int) -> Tuple[bool, str]:
    """Fallar con UN corte, con más de dos congelados o con menos de tres pares."""
    if medidos < MINIMO_PARES:
        return (False, f"solo {medidos} pares medidos, hacen falta {MINIMO_PARES}")
    cortes_ = rótulos.count("corte")
    congelados = rótulos.count("congelado")
    if cortes_ > 0:
        return (False, f"{cortes_} corte(s) contra su mediana local")
    if congelados > MAXIMO_CONGELADOS:
        return (False, f"{congelados} pares congelados, como mucho {MAXIMO_CONGELADOS}")
    return (True, f"movimiento continuo: {medidos} pares medidos")


def posiciones_corte(pares: Sequence[float]) -> List[Tuple[int, float]]:
    """Posición y valor de cada par muy por debajo de la mediana del clip."""
    if not pares:
        return []
    techo = PORCENTAJE_CORTE * statistics.median(pares)
    return [(i, s) for i, s in enumerate(pares) if s < techo]

def _ffmpeg(args: List[str]) -> str:
    # Arranca ffmpeg y devuelve su salida de error.
    hecho = subprocess.run(
        ["ffmpeg", "-hide_banner", *args], capture_output=True, text=True, check=False
    )
    return hecho.stderr


def _todas(salida: str) -> List[float]:
    """Las cifras «All:» de una salida del filtro ssim, por orden."""
    cifras: List[float] = []
    for línea in salida.splitlines():
        try:
            cifras.append(float(línea.split("All:", 1)[1].lstrip().split(" ", 1)[0]))
        except (ValueError, IndexError):
            continue
    return cifras


def _ssim_de_par(actual: Path, referencia: Path) -> float:
    """SSIM de dos fotogramas con el filtro ssim de ffmpeg."""
    cifras = _todas(
        _ffmpeg(["-i", str(actual), "-i", str(referencia), "-lavfi", "ssim", "-f", "null", "-"])
    )
    if not cifras:
        raise RuntimeError(f"ffmpeg no dio SSIM para {actual.name} frente a {referencia.name}")
    return cifras[-1]

def ssim_vecinos(clip: str, paso: int = 1) -> List[float]:
    """SSIM del fotograma n frente al n+paso en todo el clip, con un solo ffmpeg."""
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg no está en el PATH; es imprescindible para medir")
    filtro = f"split[a][b];[a]lag=in={paso}[c];[c][b]ssim"
    return _todas(_ffmpeg(["-i", clip, "-lavfi", filtro, "-f", "null", "-"]))


def cortes(clip: str, paso: int = 1) -> List[Tuple[int, float]]:
    """Cortes dentro de un clip: cada par vecino contra la mediana del clip entero."""
    pares = ssim_vecinos(clip, paso)
    if len(pares) < MINIMO_PARES:
        raise RuntimeError(f"el clip apenas dio {len(pares)} pares medibles")
    return posiciones_corte(pares)


def continuidad(carpeta_fotogramas: str, paso: int = 4) -> Tuple[bool, str]:
    """Toda la película: par a par contra su mediana LOCAL, con ventana ±3.

    Corte si un par queda por debajo del 45 % de su mediana local, congelado si pasa
    de 0,995; falla con UN corte, con más de dos congelados o con menos de tres pares.
    """
    extensiones = (".png", ".jpg", ".jpeg", ".webp")
    imágenes = sorted(
        r for r in Path(carpeta_fotogramas).iterdir() if r.suffix.lower() in extensiones
    )
    pares = [_ssim_de_par(imágenes[i + paso], imágenes[i]) for i in range(len(imágenes) - paso)]
    return veredicto(etiquetas(pares), len(pares))
