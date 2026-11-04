"""subtitulos.py — generación de archivos de subtítulos VTT y SRT a partir de los beats del estudio.

  Sigue el contrato architecture/metageminis-estudio.md §12.
  Funciones puras, probadas en test_subtitulos.py.
"""
from __future__ import annotations

import re


def limpiar_texto(texto: str) -> str:
    """Elimina los asteriscos de acentuación visual (*palabra*) para texto plano en subtítulos."""
    if not texto:
        return ""
    # Reemplaza *palabra* por palabra
    return re.sub(r"\*([^*]+)\*", r"\1", texto)


def extraer_beats_texto(beats: list[dict]) -> list[tuple[float, float, str]]:
    """Extrae las tuplas (inicio, duracion, texto) de una lista de beats del guion.

    Una beat puede producir varias subs (uno por campo de texto: kicker, titular, sub,
    cuerpo, cta, y cada item de lista). Cada sub conserva la duracion original del beat.
    """
    subs: list[tuple[float, float, str]] = []
    for b in beats:
        t0 = float(b.get("t", 0.0))
        d = float(b.get("d", 2.0))
        # Procesar cada campo de texto individualmente para producir subs separadas
        campos_texto: list[str] = []

        kicker = b.get("kicker")
        if kicker and str(kicker).strip():
            campos_texto.append(limpiar_texto(str(kicker)))

        titular = b.get("titular") or b.get("titulo")
        if titular and str(titular).strip():
            campos_texto.append(limpiar_texto(str(titular)))

        sub = b.get("sub")
        if sub and str(sub).strip():
            campos_texto.append(limpiar_texto(str(sub)))

        cuerpo = b.get("cuerpo")
        if cuerpo and str(cuerpo).strip():
            campos_texto.append(limpiar_texto(str(cuerpo)))

        cta = b.get("cta")
        if cta and str(cta).strip():
            campos_texto.append(limpiar_texto(str(cta)))

        # Añadir cada item de lista como subtítulo independiente, combinados con " • "
        lista = b.get("lista")
        if lista:
            textos_lista = []
            for item in lista:
                texto_item = item if isinstance(item, str) else item.get("texto", "")
                if isinstance(texto_item, str) and texto_item.strip():
                    textos_lista.append(limpiar_texto(texto_item))
            if textos_lista:
                # Unir todos los items de lista con " • " en un solo subtítulo
                texto_lista_unido = " • ".join(textos_lista)
                campos_texto.append(texto_lista_unido)

        for texto in campos_texto:
            if texto.strip():
                subs.append((t0, d, texto.strip()))

    return subs


def segundos_a_vtt(segundos: float) -> str:
    """Convierte segundos a formato de tiempo VTT: HH:MM:SS.mmm"""
    if segundos < 0:
        segundos = 0.0
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    secs = int(segundos % 60)
    milisegs = int(round((segundos - int(segundos)) * 1000))
    if milisegs >= 1000:
        milisegs = 999
    return f"{horas:02d}:{minutos:02d}:{secs:02d}.{milisegs:03d}"


def segundos_a_srt(segundos: float) -> str:
    """Convierte segundos a formato de tiempo SRT: HH:MM:SS,mmm"""
    vtt = segundos_a_vtt(segundos)
    return vtt.replace(".", ",")


def generar_vtt(beats: list[dict], duracion_total: float = 0.0, idioma: str = "es") -> str:
    """Genera el contenido de un archivo de subtítulos WebVTT."""
    lineas = ["WEBVTT", f"Language: {idioma}", ""]
    subs = extraer_beats_texto(beats)
    for idx, (t0, d, texto) in enumerate(subs, 1):
        t_fin = t0 + d
        lineas.append(str(idx))
        lineas.append(f"{segundos_a_vtt(t0)} --> {segundos_a_vtt(t_fin)}")
        lineas.append(texto)
        lineas.append("")
    return "\n".join(lineas)


def generar_srt(beats: list[dict], idioma: str = "es") -> str:
    """Genera el contenido de un archivo de subtítulos SubRip (SRT)."""
    lineas = []
    subs = extraer_beats_texto(beats)
    for idx, (t0, d, texto) in enumerate(subs, 1):
        t_fin = t0 + d
        lineas.append(str(idx))
        lineas.append(f"{segundos_a_srt(t0)} --> {segundos_a_srt(t_fin)}")
        lineas.append(texto)
        lineas.append("")
    return "\n".join(lineas)