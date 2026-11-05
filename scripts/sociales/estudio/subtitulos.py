"""subtitulos.py — generación de .vtt y .srt a partir de los beats del guion.

  python3 -m unittest scripts/sociales/estudio/test_subtitulos.py -v
"""
from __future__ import annotations
import shutil
import subprocess
from pathlib import Path


def formatear_tiempo_vtt(t: float) -> str:
    """Convierte segundos a formato VTT: HH:MM:SS.mmm"""
    h, m = int(t // 3600), int((t % 3600) // 60)
    s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def formatear_tiempo_srt(t: float) -> str:
    """Convierte segundos a formato SRT: HH:MM:SS,mmm"""
    h, m = int(t // 3600), int((t % 3600) // 60)
    s, ms = int(t), round((t - int(t)) * 1000)
    if ms >= 1000:
        ms -= 1000
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def texto_para_subtitulo(beat: dict) -> str:
    """Extrae y combina el texto visible de un beat para el subtítulo."""
    partes = [beat[k] for k in ("titular", "sub", "cta") if isinstance(beat.get(k), str)]
    if beat.get("lista"):
        for item in beat["lista"]:
            if isinstance(item, dict) and isinstance(item.get("texto"), str):
                partes.append(item["texto"])
    return " • ".join(partes)


def _beats_con_texto(beats: list[dict]) -> list[dict]:
    """Filtra beats que tienen texto para subtítulos."""
    return [{"t": b["t"], "d": b["d"], "texto": texto_para_subtitulo(b)}
            for b in beats if texto_para_subtitulo(b) and not b.get("fin")]


def generar_vtt(beats: list[dict], idioma: str = "es") -> str:
    """Genera un archivo WebVTT a partir de los beats."""
    lineas = ["WEBVTT"]
    for i, b in enumerate(_beats_con_texto(beats), 1):
        lineas.append(f"\n{i}\n{formatear_tiempo_vtt(b['t'])} --> {formatear_tiempo_vtt(b['t'] + b['d'])}\n{b['texto']}")
    return "\n".join(lineas) + "\n"


def generar_srt(beats: list[dict], idioma: str = "es") -> str:
    """Genera un archivo SRT a partir de los beats."""
    lineas = []
    for i, b in enumerate(_beats_con_texto(beats), 1):
        lineas.append(f"{i}\n{formatear_tiempo_srt(b['t'])} --> {formatear_tiempo_srt(b['t'] + b['d'])}\n{b['texto']}\n")
    return "".join(lineas)


def quemar_subtitulos(video_path: Path, subtitulos_path: Path, salida_path: Path | None = None) -> Path:
    """Quema subtítulos en un video usando ffmpeg.

    Lanza: FileNotFoundError si ffmpeg no está disponible.
    """
    if shutil.which("ffmpeg") is None:
        raise FileNotFoundError("ffmpeg no está disponible en el sistema")
    video_path, subtitulos_path = Path(video_path), Path(subtitulos_path)
    if salida_path is None:
        salida_path = video_path.parent / f"{video_path.stem}_sub{video_path.suffix}"
    else:
        salida_path = Path(salida_path)
    subprocess.run(["ffmpeg", "-y", "-i", str(video_path), "-vf", f"subtitles={subtitulos_path}",
                    "-c:a", "copy", str(salida_path)], check=True, capture_output=True)
    return salida_path


def generar_y_quemar(video_path: Path, beats: list[dict], idioma: str = "es", quemar: bool = True) -> dict:
    """Genera .vtt, .srt y opcionalmente video con subtítulos quemados."""
    video_path = Path(video_path)
    salida_dir = video_path.parent
    vtt_str, srt_str = generar_vtt(beats, idioma), generar_srt(beats, idioma)
    vtt_path = salida_dir / f"{video_path.stem}-{idioma}.vtt"
    srt_path = salida_dir / f"{video_path.stem}-{idioma}.srt"
    vtt_path.write_text(vtt_str, encoding="utf-8")
    srt_path.write_text(srt_str, encoding="utf-8")
    result = {"vtt_path": vtt_path, "srt_path": srt_path}
    if quemar:
        try:
            result["video_path"] = quemar_subtitulos(video_path, srt_path)
        except FileNotFoundError:
            pass
    return result


__all__ = ["generar_vtt", "generar_srt", "quemar_subtitulos", "generar_y_quemar",
           "formatear_tiempo_vtt", "formatear_tiempo_srt", "texto_para_subtitulo"]