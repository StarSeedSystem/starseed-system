#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""contexto_sintesis · núcleo puro con E/S inyectable para la síntesis diaria.
Construye paquetes por agente (contactos, noticias, referencias, actividad, ideas, guiones, youtube)
y el contexto vivo completo para el redactor. Sin red, sin estado; todo inyectable.
"""
from __future__ import annotations
import json
import os
import re
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

# ────────────────────────────── constantes ──────────────────────────────
AGENTES_SINTESIS = ("contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube")
RUTAS_BASE = {
    "sintesis": "starseed_memory_root/produccion-audiovisual/sintesis",
    "agentes": "starseed_memory_root/imaginacion/agentes",
    "informes": "starseed_memory_root/informes",
    "dream": "starseed_memory_root/dream",
    "alcance_github": "starseed_memory_root/alcance/github",
    "alcance_borradores": "starseed_memory_root/alcance/borradores",
    "alcance_propuestas": "starseed_memory_root/alcance/propuestas",
    "produccion_higgsfield": "starseed_memory_root/produccion/higgsfield",
    "produccion_encargos": "starseed_memory_root/produccion-audiovisual/encargos",
}
FECHA_MD = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")
FECHA_JSON = re.compile(r"^(\d{4}-\d{2}-\d{2})\.json$")

# Topes para _encoger_contexto (coherentes con agente_sintesis)
TOPE_PREVIA = 4000
TOPE_INFORME = 1500
TOPE_RESUMEN = 4000
TOPE_SALIDA = 2500
TOPE_PROMPT = 14000

# ────────────────────────────── utilidades puras ──────────────────────────────

def _leer_archivo(ruta: str, tope: Optional[int] = None) -> Optional[str]:
    """Lee un archivo de texto, opcionalmente con tope de caracteres."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read(tope) if tope else f.read()
    except OSError:
        return None


def _leer_json(ruta: str) -> Optional[Any]:
    """Lee y parsea un archivo JSON."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _listar_archivos(carpeta: str, patron: Optional[re.Pattern] = None) -> list[str]:
    """Lista archivos en una carpeta, opcionalmente filtrados por patrón."""
    try:
        archivos = os.listdir(carpeta)
    except OSError:
        return []
    if patron:
        return [a for a in archivos if patron.search(a)]
    return archivos


# ────────────────────────────── fuentes de contexto ──────────────────────────────

def _sintesis_previas(raiz: str, hoy: str, limite: int = 3, leer: Optional[Callable] = None) -> list[dict]:
    """Las `limite` síntesis más recientes con fecha <= hoy."""
    leer = leer or _leer_archivo
    carpeta = os.path.join(raiz, RUTAS_BASE["sintesis"])
    fechas = sorted(
        (m.group(1) for n in _listar_archivos(carpeta, FECHA_MD) if (m := FECHA_MD.match(n)) and m.group(1) <= hoy),
        reverse=True
    )[:limite]
    salidas = []
    for fecha in fechas:
        ruta = os.path.join(carpeta, f"{fecha}.md")
        texto = leer(ruta)
        if texto is not None:
            salidas.append({"fecha": fecha, "ruta": ruta, "texto": texto})
    return salidas


def _seccion_manana(texto: str) -> str:
    """Extrae la sección «Mañana» de una síntesis."""
    partes = re.split(r"^#{1,3}\s*Ma[nñ]ana\s*$", texto or "", flags=re.M | re.I)
    if len(partes) < 2:
        return ""
    siguiente = re.search(r"^#{1,3}\s", partes[1], flags=re.M)
    return partes[1][:siguiente.start()] if siguiente else partes[1]


def _de_manana(texto: str) -> dict[str, list[str]]:
    """Parsea una sección «Mañana» en {videos, contactos, categorias}."""
    fuera = {"videos": [], "contactos": [], "categorias": []}
    for linea in (texto or "").splitlines():
        m = re.match(r"^[-*]\s*\*{0,2}(v[ií]deos?|contactos?|categor[ií]as?)\*{0,2}:?\*{0,2}\s*(.*)$", linea.strip(), re.I)
        if not m:
            continue
        nombre = m.group(1).lower()
        clave = "videos" if nombre[0] == "v" else "contactos" if nombre[:2] == "co" else "categorias"
        fuera[clave] += [p.strip() for p in m.group(2).split(",") if p.strip()]
    return fuera


def _rotacion(mananas: list[dict], videos: Optional[list[str]] = None, contactos: Optional[list[str]] = None, categorias: Optional[list[str]] = None) -> dict:
    """Calcula la rotación del día: 2 vídeos, 2-3 contactos, 1 categoría nueva."""
    VIDEOS_DEFECTO = tuple(f"Vídeo {i}" for i in range(1, 16))
    CONTACTOS_DEFECTO = ("Cole Hastings", "Sunseed", "Damanhur")
    INICIO_VIDEOS = 4

    propios = videos is None
    videos = list(VIDEOS_DEFECTO) if propios else list(videos or [])
    contactos = list(contactos or CONTACTOS_DEFECTO)
    categorias = list(categorias or [])

    usados = {"videos": [], "contactos": [], "categorias": []}
    for una in mananas or []:
        for clave in usados:
            usados[clave] += [x for x in (una.get(clave) or []) if x not in usados[clave]]

    indice = {v: i for i, v in enumerate(videos)}
    usados_idx = [indice[v] for v in usados["videos"] if v in indice]
    arranque = (max(usados_idx) + 1) % len(videos) if usados_idx else INICIO_VIDEOS - 1
    en_orden = videos[arranque:] + videos[:arranque]

    return {
        "videos": [v for v in en_orden if v not in set(usados["videos"])][:2],
        "contactos": [c for c in contactos if c not in set(usados["contactos"])][:3],
        "categorias": [c for c in categorias if c not in set(usados["categorias"])][:1],
    }


def _salidas_imaginacion(raiz: str, ahora: Optional[float] = None, horas: int = 24, leer: Optional[Callable] = None) -> list[dict]:
    """Salidas de Imaginación de las últimas `horas`."""
    leer = leer or (lambda r, d=False: _leer_json(r) if d else _leer_archivo(r))
    carpeta = os.path.join(raiz, RUTAS_BASE["agentes"])
    corte = (datetime.fromtimestamp(ahora) - timedelta(hours=horas)).timestamp() if ahora else None
    halladas = []
    for nombre in _listar_archivos(carpeta, re.compile(r"\.json$")):
        ruta = os.path.join(carpeta, nombre)
        leido = _leer_json(ruta)
        if leido and (not corte or os.path.getmtime(ruta) >= corte):
            halladas.append((os.path.getmtime(ruta), {"agente": nombre[:-5], "ruta": ruta, "datos": leido}))
    return [x for _mt, x in sorted(halladas, key=lambda t: t[0], reverse=True)]


def _informes_nuevos(raiz: str, ahora: Optional[float] = None, dias: int = 2, leer: Optional[Callable] = None) -> list[dict]:
    """Informes nuevos de directores y sueños de los últimos `dias`."""
    leer = leer or _leer_archivo
    corte = (datetime.fromtimestamp(ahora) - timedelta(days=dias)).timestamp() if ahora else None
    halladas = []
    for base in (RUTAS_BASE["informes"], RUTAS_BASE["dream"]):
        carpeta = os.path.join(raiz, base)
        for dirpath, _, nombres in os.walk(carpeta):
            for nombre in sorted(nombres):
                if nombre.startswith(".") or not nombre.endswith((".md", ".json")):
                    continue
                ruta = os.path.join(dirpath, nombre)
                mtime = os.path.getmtime(ruta)
                if corte and mtime < corte:
                    continue
                texto = leer(ruta, tope=8000)
                if texto:
                    halladas.append((mtime, {
                        "ruta": os.path.relpath(ruta, raiz),
                        "fecha": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d"),
                        "texto": texto
                    }))
    return [x for _mt, x in sorted(halladas, key=lambda t: t[0], reverse=True)]


def _alcance_github_dia(raiz: str, fecha: str, leer_json: Optional[Callable] = None) -> list[dict]:
    """Fichas de GitHub del día."""
    leer_json = leer_json or _leer_json
    ruta = os.path.join(raiz, RUTAS_BASE["alcance_github"], f"{fecha}.json")
    data = leer_json(ruta)
    if not data:
        return []
    lista = data if isinstance(data, list) else (data.get("fichas") or [])
    return [f for f in lista if isinstance(f, dict)]


def _alcance_borradores_dia(raiz: str, fecha: str, leer_json: Optional[Callable] = None) -> list[dict]:
    """Borradores de alcance pendientes del día."""
    leer_json = leer_json or _leer_json
    ruta = os.path.join(raiz, RUTAS_BASE["alcance_borradores"], f"borradores-{fecha}.json")
    data = leer_json(ruta)
    if not data:
        return []
    lista = data if isinstance(data, list) else (data.get("borradores") or [])
    return [b for b in lista if isinstance(b, dict) and b.get("estado") == "esperando-aprobacion"]


def _alcance_propuestas_dia(raiz: str, fecha: str, leer_json: Optional[Callable] = None) -> list[dict]:
    """Propuestas de alcance del día (para la Librería)."""
    leer_json = leer_json or _leer_json
    ruta = os.path.join(raiz, RUTAS_BASE["alcance_propuestas"], f"propuesta-{fecha}.json")
    data = leer_json(ruta)
    if not data:
        return []
    return data.get("paquetes", []) if isinstance(data, dict) else []


def _produccion_higgsfield(raiz: str, leer_json: Optional[Callable] = None) -> list[dict]:
    """Proyectos de Higgsfield y sus propuestas."""
    leer_json = leer_json or _leer_json
    ruta = os.path.join(raiz, RUTAS_BASE["produccion_higgsfield"], "propuestas.json")
    data = leer_json(ruta)
    if not data:
        return []
    return data if isinstance(data, list) else data.get("propuestas", [])


def _produccion_encargos(raiz: str, leer_json: Optional[Callable] = None) -> dict:
    """Encargos de producción audiovisual y lo producido."""
    leer_json = leer_json or _leer_json
    ruta = os.path.join(raiz, RUTAS_BASE["produccion_encargos"], "encargos.json")
    return leer_json(ruta) or {}


def _sintesis_ultimos_7_dias(raiz: str, hoy: str, limite: int = 7, leer: Optional[Callable] = None) -> list[dict]:
    """Las síntesis de los últimos 7 días con su sección «Mañana»."""
    leer = leer or _leer_archivo
    carpeta = os.path.join(raiz, RUTAS_BASE["sintesis"])
    try:
        fecha_hoy = datetime.fromisoformat(hoy)
    except ValueError:
        return []
    hace_7 = (fecha_hoy - timedelta(days=7)).date().isoformat()
    fechas = sorted(
        (m.group(1) for n in _listar_archivos(carpeta, FECHA_MD)
         if (m := FECHA_MD.match(n)) and hace_7 <= m.group(1) <= hoy),
        reverse=True
    )[:limite]
    salidas = []
    for fecha in fechas:
        ruta = os.path.join(carpeta, f"{fecha}.md")
        texto = leer(ruta)
        if texto is not None:
            manana = _seccion_manana(texto)
            salidas.append({"fecha": fecha, "ruta": ruta, "manana": manana})
    return salidas


def _arquitectura_titulos(raiz: str, leer: Optional[Callable] = None) -> list[dict]:
    """Títulos y primer párrafo de architecture/*.md."""
    leer = leer or _leer_archivo
    carpeta = os.path.join(raiz, "architecture")
    salida = []
    for nombre in _listar_archivos(carpeta, re.compile(r"\.md$")):
        ruta = os.path.join(carpeta, nombre)
        texto = leer(ruta, tope=2000)
        if not texto:
            continue
        lineas = texto.splitlines()
        titulo = lineas[0].lstrip("# ").strip() if lineas else nombre
        primer_parrafo = ""
        for linea in lineas[1:]:
            linea = linea.strip()
            if linea and not linea.startswith("#"):
                primer_parrafo = linea
                break
        salida.append({"archivo": nombre, "titulo": titulo, "resumen": primer_parrafo[:500]})
    return sorted(salida, key=lambda x: x["archivo"])


def _memoria_archivos_clave(raiz: str, leer: Optional[Callable] = None) -> dict:
    """Contenido de memory/workflow-actual.md, CLAUDE.md, AGENTS.md."""
    leer = leer or _leer_archivo
    archivos = {
        "workflow_actual": "memory/workflow-actual.md",
        "claude": "CLAUDE.md",
        "agents": "AGENTS.md",
    }
    fuera = {}
    for clave, ruta_rel in archivos.items():
        ruta = os.path.join(raiz, ruta_rel)
        texto = leer(ruta, tope=5000)
        if texto:
            fuera[clave] = texto
    return fuera


def _libreria_instalada(raiz: str, leer_json: Optional[Callable] = None) -> list[dict]:
    """La Librería instalada (config/repos-libreria-*.json)."""
    leer_json = leer_json or _leer_json
    carpeta = os.path.join(raiz, "config")
    salida = []
    for nombre in _listar_archivos(carpeta, re.compile(r"repos-libreria-.*\.json$")):
        data = leer_json(os.path.join(carpeta, nombre))
        if data and isinstance(data, dict) and "repos" in data:
            for repo in data["repos"]:
                if isinstance(repo, dict):
                    salida.append({
                        "nombre": repo.get("nombre", ""),
                        "url": repo.get("url", ""),
                        "descripcion": repo.get("descripcion", "")[:300],
                        "tipo": repo.get("kind", ""),
                    })
    return salida


def _rutas_y_apps_os(raiz: str, leer: Optional[Callable] = None) -> list[dict]:
    """Rutas y apps del OS desde el catálogo y el dock."""
    leer = leer or _leer_archivo
    # App catalog
    ruta_catalogo = os.path.join(raiz, "src/components/dashboard/apps/app-catalog.ts")
    texto = leer(ruta_catalogo, tope=10000)
    apps = []
    if texto:
        for m in re.finditer(r"id:\s*\"([^\"]+)\"", texto):
            apps.append({"id": m.group(1), "fuente": "app-catalog"})
    # Dock presets
    ruta_dock = os.path.join(raiz, "src/components/layout/dock-config.ts")
    texto = leer(ruta_dock, tope=10000)
    if texto:
        for m in re.finditer(r"id:\s*\"([^\"]+)\"", texto):
            apps.append({"id": m.group(1), "fuente": "dock-presets"})
    return apps


# ────────────────────────────── encogimiento de contexto ──────────────────────────────

def _encoger_contexto(ctx: dict, previa: int = TOPE_PREVIA, informe: int = TOPE_INFORME,
                       resumen: int = TOPE_RESUMEN, imaginaciones: int = 8) -> dict:
    """Devuelve una copia del contexto con textos recortados a topes (no muta el original)."""
    fuera = dict(ctx or {})
    fuera["sintesis_previas"] = [
        dict(s, texto=str(s.get("texto") or "")[:previa]) for s in (fuera.get("sintesis_previas") or [])
    ]
    fuera["informes"] = [
        dict(i, texto=str(i.get("texto") or "")[:informe]) for i in (fuera.get("informes") or [])
    ][:12]
    fuera["imaginacion"] = [
        {"agente": x.get("agente"), "ruta": x.get("ruta")} for x in (fuera.get("imaginacion") or [])
    ][:imaginaciones]
    actividad = fuera.get("resumen_actividad")
    if isinstance(actividad, (dict, list)) and len(json.dumps(actividad, ensure_ascii=False)) > resumen:
        fuera["resumen_actividad"] = json.dumps(actividad, ensure_ascii=False)[:resumen]
    # Recortar también campos nuevos: limitar número de items y truncar campos de texto largo
    for clave, campos_texto in (
        ("alcance_github", ("que_hacen", "descripcion", "nombre_publico")),
        ("alcance_borradores", ("motivo", "destinatario")),
        ("alcance_propuestas", ("que_adoptar", "por_que", "area_sistema")),
        ("produccion_higgsfield", ("motivo", "pieza", "proyecto")),
        ("produccion_encargos", ("videos", "formatos_hechos", "shorts")),
        ("sintesis_7_dias", ("manana",)),
        ("arquitectura_titulos", ("titulo", "resumen")),
        ("memoria_archivos", ("workflow_actual", "claude", "agents")),
        ("libreria", ("nombre", "descripcion", "url")),
        ("rutas_apps", ("id", "fuente")),
    ):
        val = fuera.get(clave)
        if isinstance(val, list):
            fuera[clave] = [
                dict(v, **{c: str(v.get(c) or "")[:500] for c in campos_texto if c in v})
                for v in val[:20]
            ]
        elif isinstance(val, dict):
            v = val
            fuera[clave] = dict(v, **{c: str(v.get(c) or "")[:500] for c in campos_texto if c in v})
    return fuera


# ────────────────────────────── paquetes por agente ──────────────────────────────

def _paquete_contactos(ctx: dict) -> dict:
    """Paquete para el agente de contactos: investigadores, fuentes, rotación."""
    return {
        "tipo": "contactos",
        "rotacion": ctx.get("rotacion", {}).get("contactos", []),
        "sintesis_previas": [{"fecha": s["fecha"], "manana": _de_manana(_seccion_manana(s.get("texto", ""))).get("contactos", [])}
                             for s in ctx.get("sintesis_previas", [])],
        "investigadores_notables": [],  # se poblaría desde contactos investigados
        "fuentes_notebooklm": ctx.get("fuentes_notebooklm", []),
    }


def _paquete_noticias(ctx: dict) -> dict:
    """Paquete para el agente de noticias: novedades técnicas, releases, papers."""
    return {
        "tipo": "noticias",
        "arquitectura_titulos": ctx.get("arquitectura_titulos", [])[:20],
        "libreria": ctx.get("libreria", [])[:10],
        "rutas_apps": ctx.get("rutas_apps", [])[:10],
        "informes_recientes": ctx.get("informes", [])[:5],
    }


def _paquete_referencias(ctx: dict) -> dict:
    """Paquete para el agente de referencias: diseño, patrones, geometría sagrada."""
    return {
        "tipo": "referencias",
        "identidades": ctx.get("identidades", {}),
        "armonia": ctx.get("armonia", {}),
        "referencias_externas": ctx.get("referencias_externas", []),
        "proyectos_referencia": ctx.get("proyectos_referencia", []),
    }


def _paquete_actividad(ctx: dict) -> dict:
    """Paquete para el agente de actividad: resumen del día, commits, tareas."""
    return {
        "tipo": "actividad",
        "resumen_actividad": ctx.get("resumen_actividad"),
        "commits_recientes": ctx.get("commits_recientes", []),
        "tareas_completadas": ctx.get("tareas_completadas", []),
        "tareas_en_progreso": ctx.get("tareas_en_progreso", []),
    }


def _paquete_ideas(ctx: dict) -> dict:
    """Paquete para el agente de ideas: lo integrado, lo propuesto, prohibición de repetir."""
    return {
        "tipo": "ideas",
        "lo_integrado": {
            "sintesis_previas": [{"fecha": s["fecha"], "titulo": _seccion_manana(s.get("texto", "")).splitlines()[0] if _seccion_manana(s.get("texto", "")) else ""}
                                 for s in ctx.get("sintesis_previas", [])],
            "arquitectura": [a["titulo"] for a in ctx.get("arquitectura_titulos", [])],
            "libreria": [l["nombre"] for l in ctx.get("libreria", [])],
        },
        "propuestas_recientes": ctx.get("propuestas_recientes", []),
        "regla_no_repetir": "NO propongas ideas que ya figuren en 'lo_integrado'. Cada propuesta debe ser nueva o una ampliación explícita de algo existente (citando qué pieza y qué añade).",
    }


def _paquete_guiones(ctx: dict) -> dict:
    """Paquete para el agente de guiones: vídeos en planeación, estructura, diálogos."""
    return {
        "tipo": "guiones",
        "rotacion_videos": ctx.get("rotacion", {}).get("videos", []),
        "videos_en_planeacion": ctx.get("produccion_encargos", {}).get("videos", []),
        "formatos_hechos": ctx.get("produccion_encargos", {}).get("formatos_hechos", []),
        "higgsfield_propuestas": ctx.get("produccion_higgsfield", []),
        "estructura_base": "Gancho (3s) → Contexto (10s) → Núcleo (60-120s) → CTA (5s)",
    }


def _paquete_youtube(ctx: dict) -> dict:
    """Paquete para el agente de YouTube: shorts, analytics, SEO, calendario."""
    return {
        "tipo": "youtube",
        "rotacion_categoria": ctx.get("rotacion", {}).get("categorias", []),
        "canal_estado": ctx.get("youtube_canal", {}),
        "shorts_pendientes": ctx.get("produccion_encargos", {}).get("shorts", []),
        "analytics_resumen": ctx.get("youtube_analytics", {}),
        "calendario_publicacion": ctx.get("youtube_calendario", []),
    }


PAQUETES_FNS = {
    "contactos": _paquete_contactos,
    "noticias": _paquete_noticias,
    "referencias": _paquete_referencias,
    "actividad": _paquete_actividad,
    "ideas": _paquete_ideas,
    "guiones": _paquete_guiones,
    "youtube": _paquete_youtube,
}


def paquetes_por_agente(ctx: dict) -> dict[str, dict]:
    """Construye los 7 paquetes, cada uno dentro de su tope."""
    encogido = _encoger_contexto(ctx)
    return {nombre: fn(encogido) for nombre, fn in PAQUETES_FNS.items()}


# ────────────────────────────── contexto vivo completo ──────────────────────────────

def contexto_vivo(raiz: str, hoy: str, ahora: Optional[float] = None,
                  leer: Optional[Callable] = None, leer_json: Optional[Callable] = None,
                  existe: Optional[Callable] = None, casa: Optional[str] = None) -> dict:
    """Construye el contexto vivo completo para el redactor.
    
    Incluye las 6 fuentes:
    1. Lo ya integrado (índice)
    2. Producción audiovisual
    3. Alcance (sin datos personales)
    4. Investigaciones (últimos 7 días + Mañana, fuentes NotebookLM, Imaginación)
    5. Recuerdos relevantes (contexto_agente + LEANN + libreta JLA1116)
    6. Libro de recomendaciones
    """
    leer = leer or _leer_archivo
    leer_json = leer_json or _leer_json
    existe = existe or (lambda r: os.path.exists(r))
    
    # 1. Lo ya integrado
    previas = _sintesis_previas(raiz, hoy, leer=leer)
    mananas = [_de_manana(_seccion_manana(s.get("texto", ""))) for s in previas]
    rot = _rotacion(mananas)
    arquitectura = _arquitectura_titulos(raiz, leer=leer)
    memoria = _memoria_archivos_clave(raiz, leer=leer)
    libreria = _libreria_instalada(raiz, leer_json=leer_json)
    rutas_apps = _rutas_y_apps_os(raiz, leer=leer)
    
    # 2. Producción audiovisual
    higgsfield = _produccion_higgsfield(raiz, leer_json=leer_json)
    encargos = _produccion_encargos(raiz, leer_json=leer_json)
    
    # 3. Alcance
    alcance_github = _alcance_github_dia(raiz, hoy, leer_json=leer_json)
    alcance_borradores = _alcance_borradores_dia(raiz, hoy, leer_json=leer_json)
    alcance_propuestas = _alcance_propuestas_dia(raiz, hoy, leer_json=leer_json)
    
    # 4. Investigaciones
    sintesis_7_dias = _sintesis_ultimos_7_dias(raiz, hoy, leer=leer)
    imaginacion = _salidas_imaginacion(raiz, ahora=ahora, leer=lambda r, d=False: leer_json(r) if d else leer(r))
    informes = _informes_nuevos(raiz, ahora=ahora, leer=leer)
    
    # 5. Recuerdos relevantes (inyectables via contexto_agente + LEANN)
    # Se deja como estructura vacía para ser completada por el llamador
    recuerdos = {
        "investigador_diseno": [],
        "investigador_alcance": [],
        "analista": [],
        "libreta_jla1116": [],
    }
    
    # 6. Libro de recomendaciones
    recomendaciones = alcance_propuestas  # alias semántico
    
    # Resumen de actividad
    resumen_actividad = None
    if casa:
        try:
            with open(os.path.join(casa, f"resumen-{hoy}.json"), encoding="utf-8") as f:
                resumen_actividad = json.load(f)
        except (OSError, ValueError):
            pass
    
    return {
        "fecha": hoy,
        "sintesis_previas": previas,
        "mananas": mananas,
        "rotacion": rot,
        "imaginacion": imaginacion,
        "informes": informes,
        "resumen_actividad": resumen_actividad,
        # Fuentes nuevas
        "alcance_github": alcance_github,
        "alcance_borradores": alcance_borradores,
        "alcance_propuestas": alcance_propuestas,
        "produccion_higgsfield": higgsfield,
        "produccion_encargos": encargos,
        "sintesis_7_dias": sintesis_7_dias,
        "arquitectura_titulos": arquitectura,
        "memoria_archivos": memoria,
        "libreria": libreria,
        "rutas_apps": rutas_apps,
        "recuerdos": recuerdos,
        "recomendaciones": recomendaciones,
    }


# ────────────────────────────── conexión con agente_sintesis ──────────────────────────────

def prompt_respaldo_con_contexto(ctx: dict, fecha: str, salidas: Optional[list] = None) -> str:
    """Genera el prompt de respaldo usando el contexto vivo (para _prompt_respaldo de agente_sintesis)."""
    from agente_sintesis import _encoger_contexto as _encoger, _prompt_respaldo as _prompt_orig
    
    encogido = _encoger(ctx)
    return _prompt_orig(encogido, fecha, salidas=salidas)


def encargar_con_paquetes(raiz: str, ctx: dict, ahora: Optional[float] = None,
                          encargar_fn: Optional[Callable] = None) -> dict:
    """Encarga tareas de análisis usando los paquetes por agente (para encargar_por_flota de agente_sintesis).
    
    Cada paquete se pasa como contexto a su tarea correspondiente.
    """
    from agente_sintesis import _encoger_contexto as _encoger, _a_topes as _atopes
    import sintesis_tareas as ST
    from datetime import datetime, timezone
    
    encogido = _encoger(ctx)
    paquetes = paquetes_por_agente(encogido)
    
    # Generar tareas base - convertir float a ISO string si necesario
    ahora_iso = None
    if ahora is not None:
        if isinstance(ahora, (int, float)):
            ahora_iso = datetime.fromtimestamp(ahora, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        else:
            ahora_iso = str(ahora)
    tareas = ST.generar_tareas_analisis(encogido, raiz, ahora=ahora_iso)
    
    # Enriquecer cada tarea con su paquete correspondiente
    for tarea in tareas:
        rama = tarea.get("rama")
        if rama in paquetes:
            paquete = paquetes[rama]
            # Añadir el paquete al prompt como contexto específico
            tarea["prompt"] = tarea.get("prompt", "") + "\n\nCONTEXTO ESPECÍFICO (" + rama + "):\n" + json.dumps(paquete, ensure_ascii=False)[:2000]
    
    tareas = _atopes(tareas)
    
    if encargar_fn:
        return encargar_fn(raiz, tareas, ahora=ahora_iso)
    
    return {"ok": True, "tareas": [t["id"] for t in tareas], "paquetes": list(paquetes.keys())}


# ────────────────────────────── CLI / pruebas ──────────────────────────────

if __name__ == "__main__":
    import sys
    raiz = sys.argv[1] if len(sys.argv) > 1 else "."
    hoy = sys.argv[2] if len(sys.argv) > 2 else datetime.now().date().isoformat()
    ctx = contexto_vivo(raiz, hoy)
    print(json.dumps(ctx, ensure_ascii=False, indent=2)[:5000])
    print("...")
    print(f"Claves: {list(ctx.keys())}")
    paquetes = paquetes_por_agente(ctx)
    print(f"Paquetes: {list(paquetes.keys())}")
    for k, v in paquetes.items():
        print(f"  {k}: {len(json.dumps(v, ensure_ascii=False))} chars")