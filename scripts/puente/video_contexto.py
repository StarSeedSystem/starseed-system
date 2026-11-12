#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""video_contexto.py · Ver y transcribir vídeos candidatos de YouTube (SDP1111T).

Para cada candidato de youtube_candidatos (hasta 8 a fondo, el resto ligero):
producción de una ficha con: resumen, ideas para guiones, notas de estilo,
storyboard, diseño, noticias, personas públicas citadas. Privado según origen.
Salida: ~/.starseed/actividad/youtube/fichas/

Herramientas (ver ~/.starseed/herramientas-video.json):
1. Subtítulos: yt-dlp --skip-download --write-auto-subs --sub-langs es,en
2. Si no hay subtítulos: audio + whisper.cpp/VibeASR, borrado tras transcribir
3. Ver vídeo: Gemini gratuito (GEMINI_API_KEY) o ffmpeg + modelo visión
"""
from __future__ import annotations
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DIR_SALIDA_DEFECTO = os.path.expanduser("~/.starseed/actividad/youtube/fichas")

def _ficha_base(video_id: str, titulo: str, canal: str, enlace: str, fecha: str,
                origen_cuenta: str = "", privado: bool = False) -> Dict[str, Any]:
    """Crea la estructura base de una ficha de vídeo."""
    return {
        "id": video_id, "titulo": titulo, "canal": canal, "enlace": enlace,
        "fecha": fecha, "origen": {"cuenta": origen_cuenta},
        "privado": privado, "resumen": "", "ideas_guion": [], "notas_estilo": {},
        "storyboard": [], "diseño": "", "noticias": [], "personas": []
    }

def _sector_transcripcion(texto: str) -> List[Dict[str, str]]:
    """Divide la transcripción en sectores con timestamps."""
    if not texto:
        return []
    patron = r"t\[(\d{2}:\d{2})\]|\[(\d{2}:\d{2})\]|(\d{2}:\d{2})"
    sectores = []
    for m in re.finditer(patron, texto):
        tiempo = m.group(1) or m.group(2) or m.group(3) or ""
        if tiempo:
            sectores.append({"tiempo": tiempo, "texto": texto[m.end():m.end()+100] or ""})
    return sectores

def _extraer_storyboard(texto: str) -> List[Dict[str, str]]:
    """Extrae escenas con marcas de tiempo para el storyboard."""
    patron = r"(\d{2}:\d{2}).*?[\n\r]([^\n\r]{10,150})"
    return [{"tiempo": m.group(1), "descripcion": m.group(2).strip()[:120]}
            for m in re.finditer(patron, texto, re.DOTALL)][:15]

def _extraer_ideas_guion(texto: str) -> List[str]:
    """Extrae ideas útiles para guiones de la transcripción."""
    ideas = []
    palabras_clave = ["podría", "podrías", "podría crear", "considera", "sería útil", "podrías estructurar"]
    for linea in texto.splitlines():
        for pk in palabras_clave:
            if pk in linea.lower():
                limpia = linea.strip()[:200]
                if limpia and limpia not in ideas:
                    ideas.append(limpia + "…" if len(limpia) > 200 else limpia)
    return ideas[:5]

def _extraer_notas_estilo(texto: str) -> Dict[str, str]:
    """Extrae notas de estilo (ritmo, montaje, color, tipografía, música, transiciones)."""
    notas = {}
    patrones = {
        "ritmo": ["ritmo", "rápido", "dinámico", "lento", "cortes"],
        "montaje": ["montaje", "split-screen", "corte", "superposición"],
        "color": ["paleta", "colores?", "tonos?", "azul", "naranja", "verde", "rosa"],
        "tipografia": ["tipografía", "fuente", "letra", "tipo"],
        "música": ["música", "sonido", "banda sonora", "audio"],
        "transiciones": ["transición", "fade", "slide", "zoom", "animación"]
    }
    texto_l = texto.lower()
    for k, pats in patrones.items():
        for p in pats:
            if any(x in texto_l for x in [p]):
                for linea in texto.splitlines():
                    if p in linea.lower():
                        notas[k] = linea.strip()[:120]
                        break
    return notas

def _extraer_personas(texto: str) -> List[str]:
    """Identifica personas públicas o activistas citadas."""
    patron = r"\b[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}\b"
    hits = re.findall(patron, texto)
    stop_words = {"Video", "Diseño", "Interfaz", "Estilo", "Canal", "StarSeed"}
    return [h for h in set(hits) if h not in stop_words][:5]

def _generar_ficha(candidato: Dict, transcripcion: str = "", privado: bool = False) -> Dict[str, Any]:
    """Genera una ficha completa desde un candidato y su transcripción."""
    ficha = _ficha_base(
        candidato.get("id", ""), candidato.get("titulo", ""), candidato.get("canal", ""),
        candidato.get("enlace", ""), candidato.get("fecha", ""),
        candidato.get("origen", {}).get("cuenta", "") if candidato.get("origen") else "",
        candidato.get("privado", privado)
    )
    if transcripcion:
        ficha["resumen"] = transcripcion[:800]
        ficha["ideas_guion"] = _extraer_ideas_guion(transcripcion)
        ficha["notas_estilo"] = _extraer_notas_estilo(transcripcion)
        ficha["storyboard"] = _extraer_storyboard(transcripcion)
        ficha["personas"] = _extraer_personas(transcripcion)
    return ficha

def process_candidatos(ctx: Dict, obtener_transcripcion=None, extraer_ficha=None,
                       dir_salida: str = None) -> List[Dict[str, Any]]:
    """Procesa los candidatos y genera fichas estructuradas. Todo inyectable para pruebas."""
    dir_salida = dir_salida or DIR_SALIDA_DEFECTO
    candidatos = ctx.get("candidatos", [])[:8]
    fichas = []
    for c in candidatos:
        trans = obtener_transcripcion(c.get("enlace", "")) if obtener_transcripcion else ""
        if extraer_ficha:
            ficha = extraer_ficha(c, trans)
        else:
            ficha = _generar_ficha(c, trans, c.get("privado", False))
        fichas.append(ficha)
    return fichas