#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fuentes y rotación de la síntesis diaria de producción audiovisual (SDP1111A · §3.2).

Módulo PURO: sin red ni reloj propio. Dada la raíz del repo arma el contexto común de la
síntesis: las 3 últimas síntesis y su sección «Mañana», la rotación de hoy (2 vídeos de los 15,
2–3 contactos y 1 categoría nueva, sin repetir las 3 últimas), las salidas de Imaginación de
24 h, los informes nuevos de directores y sueños y el resumen de actividad si existe. Cada
fuente se puede inyectar. Sin síntesis previas la rotación empieza en los vídeos 4 y 5 y en
Cole Hastings, Sunseed y Damanhur.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta

REL_SINTESIS = os.path.join("starseed_memory_root", "produccion-audiovisual", "sintesis")
REL_IMAGINACION = os.path.join("starseed_memory_root", "imaginacion", "agentes")
REL_DIRECTORES = os.path.join("starseed_memory_root", "directores")
REL_SUENOS = os.path.join("starseed_memory_root", "dream", "profundo")
REL_ACTIVIDAD = os.path.join(".starseed", "actividad")
VIDEOS = tuple(range(1, 16))
CONTACTOS_INICIALES = ("Cole Hastings", "Sunseed", "Damanhur")
CATEGORIAS_INICIALES = ("mesh", "IA abierta", "democracia directa", "economía ecológica",
                        "comunidades", "solarpunk", "diseño", "programación")
INICIALES = (4, 5)
HORAS = 24
_SIN_DATO = object()
_RE_FECHA = re.compile(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b")
_RE_NUM = re.compile(r"\b(\d{1,2})\b")
_RE_CABECERA = re.compile(r"^(#{1,6})\s*(.+?)\s*#*\s*$")
_PARTIR = re.compile(r"\s*[,;·]\s*|\s+y\s+|\s+e\s+", re.I)


def _sin_tildes(texto):
    return str(texto or "").translate(str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")).lower().strip()


def _ahora(valor=None):
    if isinstance(valor, datetime):
        return valor.replace(tzinfo=None) if valor.tzinfo else valor
    if isinstance(valor, date):
        return datetime.combine(valor, datetime.min.time())
    if isinstance(valor, (int, float)):
        return datetime.fromtimestamp(valor)
    if isinstance(valor, str) and valor.strip():
        try:
            return datetime.fromisoformat(valor.strip().replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    return datetime.now()


def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def _json(ruta, defecto=None):
    texto = _leer(ruta)
    if texto is None:
        return defecto
    try:
        return json.loads(texto)
    except ValueError:
        return defecto


def _limpio(valor, tope=240):
    return re.sub(r"\s+", " ", str(valor or "")).strip()[:tope]


def _mtime(ruta):
    try:
        return datetime.fromtimestamp(os.path.getmtime(ruta))
    except OSError:
        return None


def seccion_manana(texto):
    """Cuerpo de la sección «Mañana» de una síntesis, sin su cabecera. PURA."""
    nivel, fuera = None, []
    for linea in str(texto or "").splitlines():
        m = _RE_CABECERA.match(linea)
        if m and _sin_tildes(m.group(2)) == "manana":
            nivel, fuera = len(m.group(1)), []
        elif m and nivel is not None and len(m.group(1)) <= nivel:
            break
        elif nivel is not None:
            fuera.append(linea)
    return "\n".join(fuera).strip()


seccion = seccion_manana


def _valores(linea):
    valor = re.sub(r"^\s*[-*]\s*", "", linea)
    valor = valor.split(":", 1)[1] if ":" in valor else valor
    valor = re.sub(r"\*\*|__|`", "", valor)
    return [t.strip(" .-–—*_") for t in _PARTIR.split(valor) if t.strip(" .-–—*_")]


def _numeros_video(linea, tope):
    limpio = re.sub(r"\b\d+\s+v[ií]deos?\b", "", _RE_FECHA.sub(" ", linea), flags=re.I)
    return list(dict.fromkeys(int(n) for n in _RE_NUM.findall(limpio) if 1 <= int(n) <= tope))


def manana(texto, video_max=15):
    """{videos, contactos, categorias, texto} de la sección «Mañana». PURA."""
    cuerpo = seccion_manana(texto)
    fuera = {"videos": [], "contactos": [], "categorias": [], "texto": cuerpo}
    for linea in cuerpo.splitlines():
        plano = _sin_tildes(linea)
        if "video" in plano:
            fuera["videos"] += [n for n in _numeros_video(linea, video_max) if n not in fuera["videos"]]
        elif "contact" in plano:
            fuera["contactos"] += [v for v in _valores(linea) if v and v not in fuera["contactos"]]
        elif "categor" in plano:
            fuera["categorias"] += [v for v in _valores(linea) if v and v not in fuera["categorias"]]
    return fuera


leer_rotacion = manana


def _manana_de(previa):
    if isinstance(previa, str):
        return manana(previa)
    if isinstance(previa, dict):
        m = previa.get("manana")
        if isinstance(m, dict):
            return m
        if isinstance(m, str):
            return manana(m)
        return manana(previa.get("texto") or "")
    return {"videos": [], "contactos": [], "categorias": []}


def _tres_ultimas(previas):
    previas = list(previas or [])
    con_fecha = [p for p in previas if isinstance(p, dict) and str(p.get("fecha") or "")]
    if con_fecha and len(con_fecha) == len(previas):
        return sorted(previas, key=lambda p: str(p["fecha"]))[-3:]
    return previas[-3:]


def _elegir_videos(usados, pool, n):
    usados = {int(v) for v in usados}
    if len(usados) >= len(pool):
        usados, inicio = set(), len(pool)
    else:
        inicio = max(usados) if usados else len(INICIALES)
    fuera = []
    while len(fuera) < n:
        inicio = inicio % len(pool) + 1
        if inicio not in usados:
            fuera.append(inicio)
    return fuera


def _elegir_lista(pool, usados, n):
    usados = {_sin_tildes(x) for x in usados}
    fuera = [x for x in pool if _sin_tildes(x) not in usados][:n]
    return fuera or list(pool)[:n]


def rotacion(previas=(), contactos_pool=CONTACTOS_INICIALES, categorias_pool=CATEGORIAS_INICIALES,
             n_videos=2, n_contactos=3):
    """2 vídeos, 2–3 contactos y 1 categoría nueva sin repetir las 3 últimas síntesis. PURA."""
    previas = list(previas or [])
    if not previas:
        return {"videos": list(INICIALES), "contactos": list(CONTACTOS_INICIALES)[:n_contactos],
                "categoria": None, "categorias": []}
    tres = [_manana_de(p) for p in _tres_ultimas(previas)]
    usados_v = [v for m in tres for v in m.get("videos") or []]
    usados_c = [c for m in tres for c in m.get("contactos") or []]
    usados_k = [k for m in tres for k in m.get("categorias") or []]
    categorias = _elegir_lista(categorias_pool, usados_k, 1)
    return {"videos": _elegir_videos(usados_v, VIDEOS, n_videos),
            "contactos": _elegir_lista(contactos_pool, usados_c, n_contactos),
            "categoria": categorias[0] if categorias else None, "categorias": categorias}
