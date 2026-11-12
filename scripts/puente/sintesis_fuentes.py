#!/usr/bin/env python3
"""sintesis_fuentes · contexto común de la síntesis diaria de producción (puro).
SDP1111A (§3.2 de architecture/sintesis-diaria-autonoma.md). Dada la raíz, devuelve sin red ni estado
las piezas del contexto: las 3 últimas síntesis y su sección «Mañana» (de donde sale la rotación: 2
vídeos de los 15, 2-3 contactos, 1 categoría nueva, sin repetir lo de las 3 últimas), las salidas de
Imaginación de 24 h, los informes nuevos de directores y sueños y el resumen de actividad del día.
Solo biblioteca estándar; todo inyectable, con pruebas sobre directorios temporales.
"""
import json, os, re
from datetime import datetime, timedelta
CINTA = os.path.join("starseed_memory_root", "produccion-audiovisual", "sintesis")
AGENTES = os.path.join("starseed_memory_root", "imaginacion", "agentes")
INFORMES = os.path.join("starseed_memory_root", "informes")
DREAM = os.path.join("starseed_memory_root", "dream")
VIDEOS_DEFECTO = tuple("Vídeo %d" % i for i in range(1, 16))
CONTACTOS_DEFECTO = ("Cole Hastings", "Sunseed", "Damanhur")
INICIO_VIDEOS, TAM_TEXTO = 4, 8000  # sin síntesis previas la rotación empieza por los vídeos 4 y 5
FECHA_MD = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")
RE_MANANA = re.compile(r"^[-*]\s*\*{0,2}(v[ií]deos?|contactos?|categor[ií]as?)\*{0,2}:?\*{0,2}\s*(.*)$", re.I)
def _leer(ruta, datos=False, tope=False):
    """(mtime, texto o datos) de un archivo, o None si no se puede leer."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return os.path.getmtime(ruta), json.load(f) if datos else (f.read(TAM_TEXTO) if tope else f.read())
    except (ValueError, OSError):
        return None
def sintesis_previas(raiz, hoy=None, limite=3):
    """Las `limite` síntesis más recientes con fecha <= hoy, de la más nueva a la más vieja."""
    carpeta = os.path.join(raiz, CINTA)
    fechas = sorted((m.group(1) for n in (os.listdir(carpeta) if os.path.isdir(carpeta) else [])
                     if (m := FECHA_MD.match(n)) and (hoy is None or m.group(1) <= hoy)),
                    reverse=True)[:limite]
    salidas = []
    for fecha in fechas:
        ruta = os.path.join(carpeta, fecha + ".md")
        leido = _leer(ruta)
        if leido:
            salidas.append({"fecha": fecha, "ruta": ruta, "texto": leido[1]})
    return salidas
def seccion_manana(texto):
    """El texto de la sección «Mañana» de una síntesis (vacío si no la lleva)."""
    partes = re.split(r"^#{1,3}\s*Ma[nñ]ana\s*$", texto or "", flags=re.M | re.I)
    if len(partes) < 2: return ""
    siguiente = re.search(r"^#{1,3}\s", partes[1], flags=re.M)
    return partes[1][: siguiente.start()] if siguiente else partes[1]
def de_manana(texto):
    """Lo que una «Mañana» nombra: {videos, contactos, categorías} como listas."""
    fuera = {"videos": [], "contactos": [], "categorias": []}
    for linea in (texto or "").splitlines():
        m = RE_MANANA.match(linea.strip())
        if not m:
            continue
        nombre = m.group(1).lower()
        clave = "videos" if nombre[0] == "v" else "contactos" if nombre[:2] == "co" else "categorias"
        fuera[clave] += [p.strip() for p in m.group(2).split(",") if p.strip()]
    return fuera
def rotacion(mananas, videos=None, contactos=None, categorias=None):
    """2 vídeos de los 15, 2-3 contactos y 1 categoría nueva, sin repetir lo de las «Mañana»
    recibidas, siguiendo el índice; sin síntesis previas empieza por los vídeos 4 y 5."""
    propios = videos is None
    videos = VIDEOS_DEFECTO if propios else tuple(videos)
    contactos = tuple(contactos) if contactos is not None else CONTACTOS_DEFECTO
    categorias = tuple(categorias or ())
    usados = {"videos": [], "contactos": [], "categorias": []}
    for una in mananas or []:
        usado = una if isinstance(una, dict) else de_manana(una)
        for clave in usados:
            usados[clave] += [x for x in (usado.get(clave) or []) if x not in usados[clave]]
    indice = {v: i for i, v in enumerate(videos)}
    usados_idx = [indice[v] for v in usados["videos"] if v in indice]
    arranque = (max(usados_idx) + 1) % len(videos) if usados_idx else INICIO_VIDEOS - 1
    en_orden = videos[arranque:] + videos[:arranque]
    return {"videos": [v for v in en_orden if v not in set(usados["videos"])][:2],
            "contactos": [c for c in contactos if c not in set(usados["contactos"])][:3],
            "categorias": [c for c in categorias if c not in set(usados["categorias"])][:1]}
def salidas_imagenacion(raiz, ahora=None, horas=24):
    """Las salidas de Imaginación de las últimas `horas` (todas si no se da `ahora`)."""
    carpeta = os.path.join(raiz, AGENTES)
    corte = (datetime.fromtimestamp(ahora) - timedelta(hours=horas)).timestamp() if ahora else None
    halladas = []
    for nombre in os.listdir(carpeta) if os.path.isdir(carpeta) else []:
        if not nombre.endswith(".json"):
            continue
        leido = _leer(os.path.join(carpeta, nombre), datos=True)
        if leido and (not corte or leido[0] >= corte):
            halladas.append((leido[0], {"agente": nombre[: -5], "ruta": os.path.join(carpeta, nombre), "datos": leido[1]}))
    return [x for _mt, x in sorted(halladas, key=lambda t: t[0], reverse=True)]
def informes_nuevos(raiz, ahora=None, dias=2):
    """Informes nuevos de directores (`informes/`) y sueños (`dream/`) de los últimos `dias`."""
    corte = (datetime.fromtimestamp(ahora) - timedelta(days=dias)).timestamp() if ahora else None
    halladas = []
    for base in (INFORMES, DREAM):
        for dirpath, dirs, nombres in os.walk(os.path.join(raiz, base)):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for nombre in sorted(nombres):
                if nombre.startswith(".") or not nombre.endswith((".md", ".json")):
                    continue
                ruta = os.path.join(dirpath, nombre)
                leido = _leer(ruta, tope=True)
                if leido and (not corte or leido[0] >= corte):
                    halladas.append((leido[0], {"ruta": os.path.relpath(ruta, raiz),
                                                "fecha": datetime.fromtimestamp(leido[0]).strftime("%Y-%m-%d"),
                                                "texto": leido[1]}))
    return [x for _mt, x in sorted(halladas, key=lambda t: t[0], reverse=True)]
def resumen_actividad(casa, fecha=None):
    """El resumen de actividad del día en `~/.starseed/actividad/`, si existe (inyectable)."""
    try:
        with open(os.path.join(casa, "resumen-%s.json" % fecha) if fecha else casa, encoding="utf-8") as f:
            return json.load(f)
    except (ValueError, OSError):
        return None
def contexto(raiz, hoy=None, ahora=None, casa=None, videos=None, contactos=None, categorias=None):
    """El contexto común de la síntesis diaria: todo lo que el §3.2 reúne, sin red."""
    previas = sintesis_previas(raiz, hoy)
    mananas = [de_manana(seccion_manana(s["texto"])) for s in previas]
    return {"fecha": hoy, "sintesis_previas": previas, "mananas": mananas,
            "rotacion": rotacion(mananas, videos, contactos, categorias),
            "imaginacion": salidas_imagenacion(raiz, ahora),
            "informes": informes_nuevos(raiz, ahora),
            "resumen_actividad": resumen_actividad(casa, hoy) if casa else None}
