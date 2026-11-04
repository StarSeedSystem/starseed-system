"""subtitulos.py — genera .vtt y .srt a partir de los beats del guion.

Puro y probado: funciones deterministas, sin efectos laterales, sin claves.
Basado en la estructura de beats del contrato §12 EST-SUBTITULOS.

Cada beat es un dict con:
  - t: tiempo de inicio (segundos)
  - d: duración (segundos)
  - kicker: texto inicial opcional
  - titular: texto principal
  - sub: subtítulo opcional
  - lista: lista de items {texto, t?: relativo}
  - cta: llamada a la acción
  - aviso: aviso opcional
  - fin: marca el beat final
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _seg_a_vtt(seg: float) -> str:
    """Convierte segundos a cadena VTT HH:MM:SS.mmm."""
    h = int(seg // 3600)
    m = int((seg % 3600) // 60)
    s = seg - h * 3600 - m * 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


def _seg_a_srt(seg: float) -> str:
    """Convierte segundos a cadena SRT HH:MM:SS,mmm."""
    h = int(seg // 3600)
    m = int((seg % 3600) // 60)
    s = int(seg - h * 3600 - m * 60)
    ms = int(round((seg - h * 3600 - m * 60 - s) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


@dataclass
class SubtitleEntry:
    inicio: float
    fin: float
    texto: str


def _extraer_texto(beat: dict) -> str:
    """Extrae el texto principal de un beat para el subtítulo."""
    partes: list[str] = []

    if beat.get("titular"):
        partes.append(beat["titular"])
    if beat.get("kicker"):
        partes.append(beat["kicker"])
    if beat.get("sub"):
        partes.append(beat["sub"])
    if beat.get("cta"):
        partes.append(beat["cta"])
    if beat.get("aviso"):
        partes.append(beat["aviso"])

    if not partes:
        return ""

    return " ".join(p for p in partes if p)


def _beats_a_entradas(beats: list[dict]) -> list[SubtitleEntry]:
    """Convierte una lista de beats en entradas de subtítulo.

    Cada beat produce una entrada con su rango de tiempo y texto.
    Los beats con `lista` generan entradas separadas por item.
    La entrada principal siempre se incluye (aunque el texto esté vacío).
    """
    entradas: list[SubtitleEntry] = []

    for beat in beats:
        t_inicio = beat["t"]
        t_fin = t_inicio + beat.get("d", 0)

        # Entrada principal del beat (siempre incluida)
        texto_principal = _extraer_texto(beat)
        entradas.append(SubtitleEntry(t_inicio, t_fin, texto_principal if texto_principal else " "))

        # Sub-entradas para items de lista
        for item in beat.get("lista") or []:
            item_texto = item.get("texto", "")
            item_t = item.get("t", 0)
            item_inicio = t_inicio + item_t if item_t else t_inicio
            item_fin = item_inicio + beat.get("d", 0)
            if item_texto:
                entradas.append(SubtitleEntry(item_inicio, item_fin, item_texto))

    return entradas


def generar_vtt(beats: list[dict], encabezado: str = "WEBVTT") -> str:
    """Genera contenido VTT a partir de una lista de beats."""
    entradas = _beats_a_entradas(beats)
    lineas: list[str] = [encabezado]

    for i, e in enumerate(entradas, start=1):
        inicio = _seg_a_vtt(e.inicio)
        fin = _seg_a_vtt(e.fin)
        texto = e.texto.replace("\n", " ")
        lineas.append(f"{inicio} --> {fin}")
        lineas.append(texto)
        lineas.append("")

    return "\n".join(lineas)


def generar_srt(beats: list[dict]) -> str:
    """Genera contenido SRT a partir de una lista de beats."""
    entradas = _beats_a_entradas(beats)
    lineas: list[str] = []

    for i, e in enumerate(entradas, start=1):
        num = str(i)
        inicio = _seg_a_srt(e.inicio)
        fin = _seg_a_srt(e.fin)
        texto = e.texto.replace("\n", " ")
        lineas.append(num)
        lineas.append(f"{inicio} --> {fin}")
        lineas.append(texto)
        lineas.append("")

    return "\n".join(lineas)


def a_archivo(beats: list[dict], ruta_salida: Path, formato: str = "vtt") -> None:
    """Escribe el contenido de subtítulos a un archivo .vtt o .srt."""
    if formato == "vtt":
        contenido = generar_vtt(beats)
        sufijo = ".vtt"
    else:
        contenido = generar_srt(beats)
        sufijo = ".srt"

    ruta = Path(ruta_salida)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    archivo_salida = ruta / f"subtitulos{sufijo}"
    archivo_salida.write_text(contenido, encoding="utf8")