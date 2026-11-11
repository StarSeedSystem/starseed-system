#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fuentes y rotación de la síntesis diaria de producción audiovisual (SDP1111A · §3.2). PURO: sin red ni reloj propio; raíz, instante y directorios se inyectan."""
from __future__ import annotations
import json, os, re
from datetime import date, datetime, timedelta
REL_SINTESIS = os.path.join("starseed_memory_root", "produccion-audiovisual", "sintesis")
REL_IMAGINACION = os.path.join("starseed_memory_root", "imaginacion", "agentes")
REL_INFORMES = os.path.join("starseed_memory_root", "informes")
REL_SUENOS = os.path.join("starseed_memory_root", "dream")
REL_ACTIVIDAD = os.path.join(".starseed", "actividad")
#: Índice de vídeos (1–15) y red de resonancia del protocolo. La rotación empieza por el 4.
VIDEOS = tuple(range(1, 16))
CATEGORIAS = ("mesh", "IA abierta", "democracia directa", "economía ecológica", "comunidades", "solarpunk", "diseño", "programación")
CONTACTOS = ("Cole Hastings", "Sunseed", "Damanhur")
MAÑANA = "Mañana"
def _ahora(ahora=None):
    if isinstance(ahora, datetime): return ahora
    if isinstance(ahora, date): return datetime.combine(ahora, datetime.min.time())
    if isinstance(ahora, str) and ahora: return datetime.fromisoformat(ahora)
    return datetime.now()
def _sin_tildes(texto):
    return str(texto or "").translate(str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")).lower().strip()
def _corta(texto, tope=6000):
    texto = str(texto or "")
    return texto if len(texto) <= tope else texto[:tope].rstrip() + "…"
def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f: return f.read()
    except OSError: return None
def seccion(texto, titulo=MAÑANA):
    """El cuerpo de la sección «Mañana» de una síntesis, sin su cabecera. PURA."""
    nivel, fuera = None, []
    for linea in str(texto or "").splitlines():
        m = re.match(r"^(#{1,6})\s*(.+?)\s*#*\s*$", linea)
        if m and _sin_tildes(m.group(2)) == _sin_tildes(titulo): nivel, fuera = len(m.group(1)), []
        elif m and nivel is not None and len(m.group(1)) <= nivel: break
        elif nivel is not None: fuera.append(linea)
    return "\n".join(fuera).strip()
def _lista(linea):
    resto = linea.split(":", 1)[1] if ":" in linea else re.sub(r"^.*?\b(?:contactos?|categorias?)\b(?:\s+nueva)?\s*", "", linea, flags=re.I)
    return [t.strip(" .-–—*") for t in re.split(r"[,;]|\by\b|\be\b", resto) if t.strip(" .-–—*")]
def _numeros(linea):
    resto = re.sub(r"\b\d+\s+v[ií]deos?\b", "", linea.split(":")[-1] if ":" in linea else linea, flags=re.I)
    fuera = [int(n) for n in re.findall(r"\d+", resto) if 1 <= int(n) <= len(VIDEOS)]
    return list(dict.fromkeys(fuera))
def leer_rotacion(texto):
    """Vídeos, contactos y categorías que la sección «Mañana» deja para el día siguiente. PURA."""
    r = {"videos": [], "contactos": [], "categorias": []}
    for linea in seccion(texto).splitlines():
        plano = _sin_tildes(linea)
        if re.search(r"\bvideos?\b", plano) and (vals := _numeros(linea)): r["videos"] = vals
        elif re.search(r"\bcontactos?\b", plano) and (vals := _lista(linea)): r["contactos"] = vals
        elif re.search(r"\bcategorias?\b", plano) and (vals := _lista(linea)): r["categorias"] = vals
    return r
def _elegir(catalogo, usados, n, inicio=0):
    if not catalogo: return []
    usados = {_sin_tildes(x) for x in usados}
    orden = [catalogo[(inicio + i) % len(catalogo)] for i in range(len(catalogo))]
    fuera = [x for x in orden if _sin_tildes(x) not in usados][:n]
    for x in orden:
        if len(fuera) >= n: break
        if x not in fuera: fuera.append(x)
    return fuera
def rotacion(anteriores, videos=None, contactos=None, categorias=None):
    """2 vídeos, 2–3 contactos y 1 categoría sin repetir los de las 3 últimas síntesis. PURA."""
    leidas = [leer_rotacion(x if isinstance(x, str) else x.get("manana", "")) for x in list(anteriores or [])[:3]]
    return {"videos": _elegir(tuple(videos or VIDEOS), [v for r in leidas for v in r["videos"]], 2, 3), "contactos": _elegir(tuple(contactos or CONTACTOS), [c for r in leidas for c in r["contactos"]], 3), "categorias": _elegir(tuple(categorias or CATEGORIAS), [k for r in leidas for k in r["categorias"]], 1)}
def sintesis_recientes(raiz, n=3):
    """Las `n` síntesis más nuevas de `produccion-audiovisual/sintesis/`, con su «Mañana»."""
    carpeta, halladas = os.path.join(raiz, REL_SINTESIS), []
    for nombre in (os.listdir(carpeta) if os.path.isdir(carpeta) else []):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\.md$", nombre)
        if m:
            texto = _leer(os.path.join(carpeta, nombre))
            if texto is not None: halladas.append({"fecha": m.group(1), "texto": texto, "manana": seccion(texto)})
    return sorted(halladas, key=lambda x: x["fecha"], reverse=True)[:max(0, int(n))]
def imaginacion_24h(raiz, ahora=None, horas=24):
    """Las salidas de `imaginacion/agentes/*.json` modificadas en la ventana pedida."""
    base = os.path.join(raiz, REL_IMAGINACION)
    corte = (_ahora(ahora) - timedelta(hours=horas)).timestamp()
    fuera = []
    for nombre in (sorted(os.listdir(base)) if os.path.isdir(base) else []):
        ruta = os.path.join(base, nombre)
        try:
            if not nombre.endswith(".json") or os.path.getmtime(ruta) < corte: continue
            fecha = datetime.fromtimestamp(os.path.getmtime(ruta)).isoformat(timespec="seconds")
            with open(ruta, encoding="utf-8") as f: datos = json.load(f)
        except (OSError, ValueError): continue
        fuera.append({"archivo": nombre, "fecha": fecha, "datos": datos})
    return sorted(fuera, key=lambda x: x["fecha"], reverse=True)
def informes_nuevos(raiz, ahora=None, horas=24):
    """Los informes de directores (`informes/`) y de sueños (`dream/`) de la ventana pedida."""
    corte = (_ahora(ahora) - timedelta(hours=horas)).timestamp()
    fuera = []
    for base in (os.path.join(raiz, REL_INFORMES), os.path.join(raiz, REL_SUENOS)):
        for carpeta, _, nombres in os.walk(base):
            for nombre in nombres:
                ruta = os.path.join(carpeta, nombre)
                if not nombre.lower().endswith(".md") or os.path.getmtime(ruta) < corte: continue
                texto = _leer(ruta)
                if texto is None: continue
                titulo = next((l.lstrip("# ").strip() for l in texto.splitlines() if l.strip().startswith("#")), nombre[:-3])
                fuera.append({"ruta": os.path.relpath(ruta, raiz), "fecha": datetime.fromtimestamp(os.path.getmtime(ruta)).strftime("%Y-%m-%d"), "titulo": titulo, "texto": _corta(texto)})
    return sorted(fuera, key=lambda x: x["ruta"])
def resumen_actividad(fecha=None, casa=None, dir_actividad=None):
    """El resumen de actividad de `~/.starseed/actividad/` más reciente hasta `fecha`, o None."""
    base = dir_actividad or os.path.join(casa or os.path.expanduser("~"), REL_ACTIVIDAD)
    if not os.path.isdir(base): return None
    tope = str(fecha) if fecha else _ahora().strftime("%Y-%m-%d")
    candidatos = [(m.group(1), n) for n in os.listdir(base) if (m := re.match(r"^resumen-(\d{4}-\d{2}-\d{2})\.json$", n)) and m.group(1) <= tope]
    if not candidatos: return None
    try:
        with open(os.path.join(base, max(candidatos)[1]), encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return None
def contexto(raiz, ahora=None, casa=None, fecha=None, dir_actividad=None, previas=None, videos=None, contactos=None, categorias=None):
    """El contexto común completo que recibe la síntesis diaria. PURA."""
    previas = sintesis_recientes(raiz) if previas is None else list(previas)
    return {"sintesis": previas, "rotacion": rotacion(previas, videos, contactos, categorias), "imaginacion": imaginacion_24h(raiz, ahora), "informes": informes_nuevos(raiz, ahora), "actividad": resumen_actividad(fecha, casa, dir_actividad)}
