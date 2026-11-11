#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fuentes del contexto común de la síntesis diaria de producción audiovisual (§3.2).
PURO: sin red ni reloj propio; raíz, índice de vídeos, contactos, categorías, fecha (ahora) y ruta del
resumen de actividad los inyecta quien llama. La sección «Mañana» (`## Mañana` hasta el siguiente
encabezado) lleva la rotación en líneas `- vídeo: A y B`, `- contactos: X, Y`, `- categoría: Z`;
la rotación nueva no repite lo de las 3 últimas."""
import itertools, json, os, re
from datetime import date, datetime
from glob import glob

CONTACTOS_BASE = ["Cole Hastings", "Sunseed", "Damanhur"]
_RE_M = re.compile(r"^#{1,6}\s*ma[ñn]ana\b.*$", re.I)
_RE_LINEA = re.compile(r"^[-*•]?\s*(v[íi]deos?|contactos?|categor[íi]as?)\s*[:\-–]\s*(.+)$", re.I)
_RE_SEP = re.compile(r"\s*(?:,|;|\by\b)\s*", re.I)
_CLAVES = {"vídeo": "videos", "video": "videos", "contacto": "contactos", "categoría": "categorias", "categoria": "categorias"}

def _norm(v): return re.sub(r"\s+", " ", str(v or "").strip().lower())
def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError, TypeError): return defecto
def _mt(ruta):
    try: return os.path.getmtime(ruta)
    except OSError: return 0.0

def _desde(ahora, ventana_horas):
    if ahora is None: return 0.0
    return (ahora.timestamp() if isinstance(ahora, datetime) else float(ahora)) - float(ventana_horas) * 3600.0

def ultimas_sintesis(raiz, n=3, subruta="produccion-audiovisual/sintesis"):
    """[(fecha, texto)] de los últimos n `AAAA-MM-DD.md`, la más nueva primero."""
    carpeta = os.path.join(raiz, subruta)
    if not os.path.isdir(carpeta): return []
    fuera = []
    for nombre in sorted((x for x in os.listdir(carpeta) if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.md", x)),
                         reverse=True)[: max(0, int(n))]:
        try:
            with open(os.path.join(carpeta, nombre), encoding="utf-8") as f: fuera.append((nombre[:-3], f.read()))
        except OSError: continue
    return fuera

def seccion_mañana(texto):
    """El cuerpo de la sección «Mañana» (hasta el siguiente encabezado), o "". PURA."""
    lineas = str(texto or "").splitlines()
    ini = next((i + 1 for i, l in enumerate(lineas) if _RE_M.match(l.strip())), None)
    if ini is None: return ""
    return "\n".join(itertools.takewhile(lambda l: not l.strip().startswith("#"), lineas[ini:])).strip()

def usados(textos):
    """{videos, contactos, categorias} nombrados en uno o varios textos «Mañana». PURA."""
    fuera = {"videos": [], "contactos": [], "categorias": []}
    for texto in textos or []:
        for linea in seccion_mañana(texto).splitlines():
            m = _RE_LINEA.match(linea.strip())
            if m is None: continue
            clave = _CLAVES.get(m.group(1).lower().rstrip("s"))
            if not clave: continue
            for v in _RE_SEP.split(m.group(2)):
                if (v := v.strip(" ·-–")) and v not in fuera[clave]: fuera[clave].append(v)
    return fuera

def _siguientes(lista, ya_vistos, n, inicio=0):
    ciclica = list(lista or [])
    if not ciclica: return []
    return [x for x in (ciclica[(inicio + i) % len(ciclica)] for i in range(len(ciclica)))
            if _norm(x) not in ya_vistos][:n]

def rotacion(sintesis_previas, indice_videos=None, contactos=CONTACTOS_BASE, categorias=None):
    """2 vídeos del índice, 2–3 contactos y 1 categoría nueva sin repetir lo de las 3 últimas; sin síntesis previas empieza por los vídeos 4 y 5 y CONTACTOS_BASE. PURA."""
    previos = usados([t for _, t in (sintesis_previas or [])])
    ya = {k: {_norm(x) for x in v} for k, v in previos.items()}
    videos = _siguientes(indice_videos, ya["videos"], 2, 3) if indice_videos else []
    if len(videos) < 2: videos = _siguientes(indice_videos, set(), 2)
    contactos_nuevos = _siguientes(contactos, ya["contactos"], 3)
    if not contactos_nuevos: contactos_nuevos = _siguientes(CONTACTOS_BASE, set(), 3)
    return {"videos": videos,
            "contactos": contactos_nuevos,
            "categoria": (_siguientes(categorias, ya["categorias"], 1) or [""])[0],
            "usados": previos}

def imaginacion_24h(raiz, ahora=None, ventana_horas=24):
    """[{archivo, datos}] de starseed_memory_root/imaginacion/agentes/*.json en la ventana."""
    carpeta = os.path.join(raiz, "starseed_memory_root", "imaginacion", "agentes")
    if not os.path.isdir(carpeta): return []
    desde, fuera = _desde(ahora, ventana_horas), []
    for nombre in sorted(os.listdir(carpeta)):
        if not nombre.endswith(".json") or _mt(os.path.join(carpeta, nombre)) < desde: continue
        datos = _leer_json(os.path.join(carpeta, nombre), {})
        if datos: fuera.append({"archivo": nombre, "datos": datos})
    return fuera

def informes_nuevos(raiz, ahora=None, ventana_horas=24):
    """[{fuente, titulo, resumen}] de directores (directores/*.json) y sueños (dream/profundo/<fecha>/INFORME.md)."""
    desde, memoria, fuera = _desde(ahora, ventana_horas), os.path.join(raiz, "starseed_memory_root"), []
    for ruta in sorted(glob(os.path.join(memoria, "directores", "*.json"))):
        d = _leer_json(ruta, {})
        if _mt(ruta) < desde or not isinstance(d, dict): continue
        fuera.append({"fuente": "directores", "titulo": str(d.get("titulo") or os.path.basename(ruta)[:-5])[:120], "resumen": str(d.get("resumen") or "")[:200]})
    for ruta in sorted(glob(os.path.join(memoria, "dream", "profundo", "*", "INFORME.md"))):
        if _mt(ruta) < desde: continue
        try:
            with open(ruta, encoding="utf-8") as f: cuerpo = f.read(2000)
        except OSError: cuerpo = ""
        fuera.append({"fuente": "sueños", "titulo": os.path.basename(os.path.dirname(ruta)),
                      "resumen": ((cuerpo.splitlines() or [""])[0])[:200]})
    return fuera

def resumen_actividad(dia, ruta_actividad=None):
    s = dia.strftime("%Y-%m-%d") if isinstance(dia, (date, datetime)) else str(dia or "")
    ruta = ruta_actividad or os.path.join(os.path.expanduser("~"), ".starseed", "actividad", "resumen-%s.json" % s)
    return d if isinstance(d := _leer_json(ruta, {}), dict) else {}

def contexto(raiz, ahora=None, indice_videos=None, contactos=CONTACTOS_BASE, categorias=None, ruta_actividad=None):
    """El contexto común entero (§3.2, paso 1); protocolo, índice de vídeos y red de resonancia los pone quien llama."""
    sintesis = ultimas_sintesis(raiz)
    return {"sintesis": [{"fecha": f, "texto": t, "mañana": seccion_mañana(t)} for f, t in sintesis],
            "rotacion": rotacion(sintesis, indice_videos, contactos, categorias),
            "imaginacion": imaginacion_24h(raiz, ahora), "informes": informes_nuevos(raiz, ahora),
            "actividad": resumen_actividad(ahora, ruta_actividad) if isinstance(ahora, datetime) else {}}
