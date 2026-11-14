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

AYUDA = (
    "Soy MetaGenesis desde el A1 (funciono sin la Mac y sin Claude).\n"
    "Pídeme en lenguaje normal, por ejemplo:\n"
    "• «Infografía y audio tipo podcast de la última síntesis»\n"
    "• «Mapa mental del cuaderno de producción»\n"
    "• «Presentación de este Doc: <enlace de Drive>»\n"
    "• Cualquier pregunta: te respondo con modelos gratuitos.\n"
    "/estado: sesión de NotebookLM y cola de peticiones."
)

RENOVAR = (
    "La sesión se renueva automáticamente: MetaGenesis intenta refrescar (auth refresh --verify), "
    "restaurar storage_state.buena-*, y si falla 3 veces llama al sanador (recetas: token maestro, "
    "navegador propio, Mac si está viva). Si todo falla: /renovar notebooklm desde el móvil "
    "(MetaGenesis › Apps Linux) o la Mac detecta actividad y abre la ventana de login."
)


def por_reglas(texto: str) -> dict[str, Any]:
    """Interpretación por palabras clave (sin modelo). Devuelve plan dict."""
    t = texto.lower()
    artefactos = [{"tipo": k, "indicaciones": ""} for k, patron in CLAVES_TIPO if re.search(patron, t)]
    m = re.search(r"/d/([A-Za-z0-9_-]{20,})", texto)
    if m:
        fuente = "drive"
    elif re.search(r"s[ií]ntesis", t):
        fuente = "ultima_sintesis"
    else:
        fuente = "cuaderno"
    return {
        "tipo": "notebooklm" if artefactos else "respuesta",
        "fuente": fuente,
        "drive_id": m.group(1) if m else "",
        "artefactos": artefactos,
        "resumen": "",
    }


def validar_plan(plan: dict[str, Any]) -> tuple[bool, str]:
    """Valida un plan del modelo. Devuelve (ok, error_msg)."""
    if not isinstance(plan, dict):
        return False, "plan no es un dict"
    if plan.get("tipo") not in ("notebooklm", "respuesta"):
        return False, f"tipo de plan inválido: {plan.get('tipo')}"
    if plan.get("fuente") not in ("ultima_sintesis", "drive", "cuaderno"):
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
    """Genera el texto del comando /estado."""
    activas = [p for p in cola if p.get("estado") in ("nueva", "en_curso", "reintentar", "esperando_sesion")]
    hechas = len([p for p in cola if p.get("estado") == "hecha"])
    viva = "viva" if nb_estado.get("viva") else "caducada o sin comprobar"
    comprobada = nb_estado.get("comprobada", "—")
    lineas = [
        "Estado de MetaGenesis (A1):",
        f"• NotebookLM: {viva} (comprobada {comprobada})",
        f"• Peticiones en curso: {len(activas)} · hechas: {hechas}",
    ]
    for p in activas[:5]:
        lineas.append(f"   – {p['estado']} · {p['texto'][:70]}")
    return "\n".join(lineas)