"""Generación pura de subtítulos VTT y SRT a partir de beats del guion.

Los beats usan `t` (inicio en s) y `d` (duración en s). El texto se extrae
de los campos habituales de un beat (kicker, titular, sub, cuerpo, cta,
aviso, pie, lista y tarjetas). Es puro, sin dependencias de Node ni ffmpeg.
"""
from __future__ import annotations

import shutil
from typing import List, Dict

def _segundos_a_hms(seg: float) -> tuple[int, int, int, int]:
    seg = max(0.0, float(seg))
    h = int(seg // 3600)
    m = int((seg % 3600) // 60)
    s = int(seg % 60)
    ms = int(round((seg - int(seg)) * 1000))
    if ms >= 1000:
        s += 1
        ms -= 1000
    return h, m, s, ms

def tiempo_vtt(seg: float) -> str:
    h, m, s, ms = _segundos_a_hms(seg)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

def tiempo_srt(seg: float) -> str:
    h, m, s, ms = _segundos_a_hms(seg)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _textos_del_beat(beat: Dict) -> List[str]:
    partes: List[str] = []
    for k in ("kicker", "titular", "sub", "cuerpo", "cta", "aviso", "pie", "pie_derecha", "qr_texto", "desliza", "numero"):
        v = beat.get(k)
        if isinstance(v, str) and v.strip():
            partes.append(v.strip())
    for it in beat.get("lista") or []:
        if isinstance(it, dict):
            txt = it.get("texto")
        else:
            txt = it
        if isinstance(txt, str) and txt.strip():
            partes.append(txt.strip())
    for t in beat.get("tarjetas") or []:
        if isinstance(t.get("titulo"), str):
            partes.append(t["titulo"].strip())
        if isinstance(t.get("texto"), str):
            partes.append(t["texto"].strip())
    return partes


def _texto_beat(beat: Dict) -> str:
    txts = _textos_del_beat(beat)
    return "\n".join(txts).strip()


def beats_a_entradas(beats: List[Dict]) -> List[Dict]:
    entradas: List[Dict] = []
    for b in beats or []:
        if not isinstance(b, dict):
            continue
        t0 = float(b.get("t", 0.0))
        d = float(b.get("d", 0.0))
        if d <= 0:
            continue
        texto = _texto_beat(b)
        if not texto:
            continue
        entradas.append({"inicio": t0, "fin": t0 + d, "texto": texto})
    return entradas


def generar_vtt(beats: List[Dict]) -> str:
    entradas = beats_a_entradas(beats)
    lineas = ["WEBVTT", ""]
    for e in entradas:
        lineas.append(f"{tiempo_vtt(e['inicio'])} --> {tiempo_vtt(e['fin'])}")
        lineas.append(e["texto"])
        lineas.append("")
    return "\n".join(lineas)


def generar_srt(beats: List[Dict]) -> str:
    entradas = beats_a_entradas(beats)
    lineas: List[str] = []
    for i, e in enumerate(entradas, 1):
        lineas.append(str(i))
        lineas.append(f"{tiempo_srt(e['inicio'])} --> {tiempo_srt(e['fin'])}")
        lineas.append(e["texto"])
        lineas.append("")
    return "\n".join(lineas)


def quemar_subtitulos(video: str, subtitulos: str, salida: str, formato: str = "srt") -> bool:
    if shutil.which("ffmpeg") is None:
        return False
    import subprocess
    cmd = ["ffmpeg", "-y", "-i", video, "-vf", f"subtitles={subtitulos}", "-c:a", "copy", salida]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except subprocess.CalledProcessError:
        return False




