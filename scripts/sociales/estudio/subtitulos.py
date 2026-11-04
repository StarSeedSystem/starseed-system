"""subtitulos.py — generación de subtítulos (.vtt y .srt) a partir de beats del guion.

  §12 de metageminis-estudio.md: genera .vtt y .srt a partir de los beats (inicio, fin, texto)
  que ya usa el estudio (mira manifiesto.py / nucleo.py). Puro y probado; quemarlos con ffmpeg
  solo si ffmpeg está y como función aparte.

  Uso:
    python3 subtitulos.py generar beats.json salida.vtt salida.srt
    python3 subtitulos.py leer salida.vtt  # devuelve beats como JSON

  Los beats son una lista de dicts con: t (tiempo en segundos), d (duración), texto.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import TypedDict


class Beat(TypedDict):
    t: float
    d: float
    texto: str


MS_PER_SEG = 1000.0


def format_timestamp(seconds: float) -> str:
    """Convierte segundos a timestamp WebVTT (HH:MM:SS.mmm)."""
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def format_timestamp_srt(seconds: float) -> str:
    """Convierte segundos a timestamp SRT (HH:MM:SS,mmm)."""
    ts = format_timestamp(seconds).replace(":", ":")
    parts = ts.split(":")
    return f"{parts[0]}:{parts[1]}:{parts[2].replace('.', ',')}"


def redondear_tiempo(t: float, precision: int = 3) -> float:
    """Redondea un tiempo a la precisión dada."""
    factor = 10**precision
    return round(t * factor) / factor


def format_vtt(beats: list[Beat], language: str | None = None) -> str:
    """Genera contenido WebVTT a partir de una lista de beats."""
    lines: list[str] = []
    if language:
        lines.append(f"WEBVTT\nLanguage: {language}\n")
    else:
        lines.append("WEBVTT\n")

    for i, b in enumerate(beats):
        start = format_timestamp(redondear_tiempo(b["t"]))
        end = format_timestamp(redondear_tiempo(b["t"] + b["d"]))
        texto = b["texto"].replace("\n", "\n")
        lines.append(f"{start} --> {end}")
        lines.append(texto)
        lines.append("")

    return "\n".join(lines)


def format_srt(beats: list[Beat]) -> str:
    """Genera contenido SRT a partir de una lista de beats."""
    lines: list[str] = []

    for i, b in enumerate(beats, 1):
        start = format_timestamp_srt(redondear_tiempo(b["t"]))
        end = format_timestamp_srt(redondear_tiempo(b["t"] + b["d"]))
        texto = b["texto"].replace("\n", "\n")
        lines.append(str(i))
        lines.append(f"{start} --> {end}")
        lines.append(texto)
        lines.append("")

    return "\n".join(lines)


def leer_vtt(contenido: str) -> list[Beat]:
    """Parsea contenido WebVTT y devuelve una lista de beats."""
    lines = contenido.strip().split("\n")
    beats: list[Beat] = []

    timestamp_re = re.compile(r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})")

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or line.upper().startswith("WEBVTT"):
            i += 1
            continue

        match = timestamp_re.match(line)
        if match:
            h1, m1, s1, ms1, h2, m2, s2, ms2 = [int(x) for x in match.groups()]
            start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000
            end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000
            dur = end - start

            texto_lines: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip():
                texto_lines.append(lines[i].strip())
                i += 1

            texto = " ".join(texto_lines)
            beats.append({"t": start, "d": dur, "texto": texto})
        i += 1

    return beats


def leer_srt(contenido: str) -> list[Beat]:
    """Parsea contenido SRT y devuelve una lista de beats."""
    lines = contenido.strip().split("\n")
    beats: list[Beat] = []

    timestamp_re = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})")

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        match = timestamp_re.match(line)
        if match:
            h1, m1, s1, ms1, h2, m2, s2, ms2 = [int(x) for x in match.groups()]
            start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000
            end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000
            dur = end - start

            texto_lines: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip():
                texto_lines.append(lines[i].strip())
                i += 1

            texto = " ".join(texto_lines)
            beats.append({"t": start, "d": dur, "texto": texto})
        else:
            i += 1

    return beats


def generar_subtitulos(beats: list[Beat], vtt_path: Path, srt_path: Path, language: str | None = None) -> None:
    """Genera archivos .vtt y .srt a partir de beats."""
    vtt = format_vtt(beats, language)
    srt = format_srt(beats)

    vtt_path.write_text(vtt, encoding="utf-8")
    srt_path.write_text(srt, encoding="utf-8")


def fusear_beats(beats: list[Beat], extra: list[Beat]) -> list[Beat]:
    """Combina beats existentes con extra, manteniendo orden por tiempo."""
    all_beats = beats + extra
    return sorted(all_beats, key=lambda b: b["t"])


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]

    if len(args) < 3:
        print("Uso: subtitulos.py <generar|leer> <archivos...>", file=sys.stderr)
        print("  generar <beats.json> <salida.vtt> <salida.srt>", file=sys.stderr)
        print("  leer <archivo.vtt>", file=sys.stderr)
        return 1

    cmd = args[0]

    if cmd == "generar":
        if len(args) < 4:
            print("Uso: subtitulos.py generar <beats.json> <salida.vtt> <salida.srt>", file=sys.stderr)
            return 1

        json_path = Path(args[1])
        vtt_path = Path(args[2])
        srt_path = Path(args[3])

        beats_data = json.loads(json_path.read_text(encoding="utf-8"))
        beats: list[Beat] = [
            {"t": float(b["t"]), "d": float(b["d"]), "texto": str(b["texto"])}
            for b in beats_data
            if "t" in b and "d" in b and "texto" in b
        ]

        language = beats_data[0].get("idioma") if beats_data else None

        generar_subtitulos(beats, vtt_path, srt_path, language)
        print(f"Generados: {vtt_path}, {srt_path}")
        return 0

    if cmd == "leer":
        if len(args) < 2:
            print("Uso: subtitulos.py leer <archivo>", file=sys.stderr)
            return 1

        file_path = Path(args[1])

        if file_path.suffix.lower() == ".vtt":
            contenido = file_path.read_text(encoding="utf-8")
            beats = leer_vtt(contenido)
        else:
            contenido = file_path.read_text(encoding="utf-8")
            beats = leer_srt(contenido)

        print(json.dumps(beats, indent=2, ensure_ascii=False))
        return 0

    print(f"Comando desconocido: {cmd}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())