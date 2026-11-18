#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reglas puras para peticiones por Telegram: tipos, por_reglas, validación, textos."""
import re
from typing import Any


# tipo: (nombre, extensión, opciones fijas, tope en s, acepta --language, acepta --wait)
TIPOS: dict[str, tuple[str, str, list[str], int, bool, bool]] = {
    "infographic": ("infografía", ".png", ["--orientation", "portrait", "--detail", "detailed"], 900, True, True),
    "audio": ("resumen en audio (podcast)", ".m4a", ["--format", "deep-dive"], 2700, True, True),
    "video": ("vídeo resumen", ".mp4", [], 2700, True, True),
    "slide-deck": ("presentación", ".pdf", [], 1500, True, True),
    "report": ("informe", ".md", [], 900, True, True),
    "mind-map": ("mapa mental", ".json", [], 600, True, False),
    "quiz": ("cuestionario", ".json", [], 900, False, True),
    "flashcards": ("tarjetas de estudio", ".json", [], 900, False, True),
    "data-table": ("tabla de datos", ".csv", [], 900, True, True),
}

INDICACIONES: dict[str, str] = {
    "infographic": "Infografía en español, clara y legible, con lo esencial: las recomendaciones principales, "
                   "las ideas de vídeo y de redes, las referencias de diseño y los próximos pasos.",
    "audio": "Conversación en español, cálida y clara, que explique lo esencial y las recomendaciones "
             "accionables para la producción audiovisual de StarSeed.",
}

# Tipos de petición de alto nivel (no son artefactos de NotebookLM)
TIPOS_PETICION: tuple[str, ...] = ("encargo", "alcance", "descartar", "notebooklm", "respuesta")

CLAVES_TIPO: list[tuple[str, str]] = [
    ("infographic", r"infogr[aá]f"),
    ("audio", r"\baudio|podcast"),
    ("video", r"\bv[ií]deo\b"),
    ("slide-deck", r"presentaci[oó]n|diapositiva|slides"),
    ("mind-map", r"mapa mental"),
    ("report", r"\binforme\b|\breporte\b"),
    ("quiz", r"cuestionario|\bquiz"),
    ("flashcards", r"tarjetas|flashcards"),
    ("data-table", r"tabla de datos"),
]

# Palabras clave para detectar tipos de petición
CLAVES_PETICION: list[tuple[str, str]] = [
    ("encargo", r"encargo|se aprueba|apruebo|desarroll|pr[oó]ximos pasos|plan de trabajo|varios pasos|frentes"),
    ("alcance", r"alcance|analiza.*canal|investiga.*canal|contactar.*creador|contactar.*canal|oferta.*starseed"),
    ("descartar", r"descartar|descarta|elimina.*fuente|quita.*tema|borra.*fuente|limpia.*cuaderno"),
    ("notebooklm", r"infogr[aá]f|audio|podcast|\bv[ií]deo\b|presentaci[oó]n|diapositiva|slides|mapa mental|\binforme\b|\breporte\b|cuestionario|\bquiz|tarjetas|flashcards|tabla de datos"),
]

AYUDA = (
    "Soy MetaGenesis desde el A1 (funciono sin la Mac y sin Claude).\n"
    "Pídeme en lenguaje normal, por ejemplo:\n"
    "• «Infografía y audio tipo podcast de la última síntesis»\n"
    "• «Mapa mental del cuaderno de producción»\n"
    "• «Presentación de este Doc: <enlace de Drive>»\n"
    "• «Encargo: desarrolla el sistema de diseño con 3 frentes»\n"
    "• «Alcance: analiza el canal @NickSaraev y redacta mensaje de contacto»\n"
    "• «Descarta: el tema del rallador de la síntesis del 16»\n"
    "• Cualquier pregunta: te respondo con modelos gratuitos.\n"
    "/estado: sesión de NotebookLM y cola de peticiones."
)

RENOVAR = (
    "La sesión se renueva automáticamente: MetaGenesis intenta refrescar (auth refresh --verify), "
    "restaurar storage_state.buena-*, y si falla 3 veces llama al sanador (recetas: token maestro, "
    "navegador propio, Mac si está viva). Si todo falla: /renovar notebooklm desde el móvil "
    "(MetaGenesis › Apps Linux) o la Mac detecta actividad y abre la ventana de login."
)


# URLs como fuentes: YouTube, Drive, web
URL_YOUTUBE = re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})")
URL_DRIVE = re.compile(r"/d/([A-Za-z0-9_-]{20,})")
URL_WEB = re.compile(r"https?://[^\s]+")


def _extraer_urls(texto: str) -> dict[str, list[str]]:
    """Extrae URLs del texto y las clasifica por tipo."""
    urls = {"youtube": [], "drive": [], "web": []}
    for m in URL_YOUTUBE.finditer(texto):
        urls["youtube"].append(f"https://youtu.be/{m.group(1)}")
    for m in URL_DRIVE.finditer(texto):
        urls["drive"].append(m.group(1))
    # URLs web que no son YouTube ni Drive
    for m in URL_WEB.finditer(texto):
        url = m.group(0)
        if "youtube.com" not in url and "youtu.be" not in url and "/d/" not in url:
            urls["web"].append(url)
    return urls


def _detectar_tipo_peticion(texto: str) -> str:
    """Detecta el tipo de petición por palabras clave."""
    t = texto.lower()
    for tipo, patron in CLAVES_PETICION:
        if re.search(patron, t):
            return tipo
    return "respuesta"


def por_reglas(texto: str) -> dict[str, Any]:
    """Interpretación por palabras clave (sin modelo). Devuelve plan dict."""
    t = texto.lower()
    urls = _extraer_urls(texto)
    
    # Detectar tipo de petición
    tipo_peticion = _detectar_tipo_peticion(texto)
    
    # Artefactos NotebookLM (solo para tipo "notebooklm")
    # "video" solo es artefacto si se pide PRODUCIR uno, no si se analiza (alcance)
    artefactos = []
    for k, patron in CLAVES_TIPO:
        if re.search(patron, t):
            # Excluir "video" cuando el tipo es "alcance" (análisis, no producción)
            if not (tipo_peticion == "alcance" and k == "video"):
                artefactos.append({"tipo": k, "indicaciones": ""})
    
    # Determinar fuente principal
    if urls["drive"]:
        fuente = "drive"
        drive_id = urls["drive"][0]
    elif urls["youtube"]:
        fuente = "youtube"
        drive_id = ""
    elif re.search(r"s[ií]ntesis", t):
        fuente = "ultima_sintesis"
        drive_id = ""
    else:
        fuente = "cuaderno"
        drive_id = ""
    
    # Para "alcance", la URL de YouTube es la fuente principal
    if tipo_peticion == "alcance" and urls["youtube"]:
        fuente = "youtube"
    
    return {
        "tipo": tipo_peticion,
        "fuente": fuente,
        "drive_id": drive_id,
        "urls": urls,
        "artefactos": artefactos,
        "resumen": "",
    }


def validar_plan(plan: dict[str, Any]) -> tuple[bool, str]:
    """Valida un plan del modelo. Devuelve (ok, error_msg)."""
    if not isinstance(plan, dict):
        return False, "plan no es un dict"
    if plan.get("tipo") not in TIPOS_PETICION:
        return False, f"tipo de plan inválido: {plan.get('tipo')}"
    fuentes_validas = ("ultima_sintesis", "drive", "cuaderno", "youtube")
    if plan.get("fuente") not in fuentes_validas:
        return False, f"fuente inválida: {plan.get('fuente')}"
    if plan["fuente"] == "drive" and not plan.get("drive_id"):
        return False, "fuente drive requiere drive_id"
    artefactos = plan.get("artefactos") or []
    if not isinstance(artefactos, list):
        return False, "artefactos debe ser lista"
    if len(artefactos) > 4:
        return False, "máximo 4 artefactos por petición"
    vistos = set()
    for a in artefactos:
        if not isinstance(a, dict) or "tipo" not in a:
            return False, "cada artefacto debe ser dict con 'tipo'"
        tipo = a["tipo"]
        if tipo not in TIPOS:
            return False, f"tipo de artefacto desconocido: {tipo}"
        # No rechazar duplicados aquí; la deduplicación es en interpretar
        vistos.add(tipo)
    return True, ""


def texto_estado(cola: list[dict[str, Any]], nb_estado: dict[str, Any]) -> str:
    """Texto de /estado; explica en silencio las peticiones que esperan sesión."""
    activas = [p for p in cola if p.get("estado") in ("nueva", "en_curso", "reintentar", "esperando_sesion")]
    esperando = [p for p in cola if p.get("estado") == "esperando_sesion"]
    hechas = len([p for p in cola if p.get("estado") == "hecha"])
    viva = "viva" if nb_estado.get("viva") else "caducada o sin comprobar"
    lineas = [
        "Estado de MetaGenesis (A1):",
        f"• NotebookLM: {viva} (comprobada {nb_estado.get('comprobada', '—')})",
        f"• Peticiones en curso: {len(activas)} · hechas: {hechas}",
    ]
    if esperando:
        lineas.append(f"• {len(esperando)} esperan en silencio a que NotebookLM vuelva: se reanudan solas.")
    for p in activas[:5]:
        lineas.append(f"   – {p['estado']} · {p['texto'][:70]}")
    return "\n".join(lineas)