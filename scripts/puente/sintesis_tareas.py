#!/usr/bin/env python3
"""sintesis_tareas · tareas de análisis por rama para la síntesis diaria (puro).
SDP1111C (§3.2 architecture/sintesis-diaria-autonoma.md y agente_referencias_diseno.tarea_de l.954).
SDP1111T (§3.4 youtube: video_contexto.py). Devuelve tareas de análisis libre (tipo 'analisis', modo 'libre', capacidad 'alta',
privado según rama, salida en starseed_memory_root/imaginacion/agentes/sintesis-<fecha>-<rama>.json)
para: contactos, noticias, referencias, actividad, ideas, guiones, youtube.
Cada prompt: contexto de su rama, secciones del protocolo, regla «todo dato con fuente y fecha; nada inventado; no se investiga a particulares».
Ids: SIN + MMDD + n. Rama actividad: privado=true. Redacción/revisión → SDP1111D.
"""
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

RAMAS = ("contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube")
REGLA = "todo dato con fuente y fecha; nada inventado; no se investiga a particulares"
COMUNES = ["3.2 (ciclo en tres pasadas)", "3.4 (herramientas: Jev, Laya, LEANN, fuentes públicas)"]
ESPECIFICAS = {
    "contactos": ["3.2.1 (contactos y creadores: 2–3 de la rotación)"],
    "noticias": ["3.2.1 (noticias con fuente y fecha)"],
    "referencias": ["3.2.1 (referencias de diseño: reutiliza lo del agente de referencias)"],
    "actividad": ["3.2.1 (actividad de Alex: qué temas tocó ayer y qué sugieren)", "4 (actividad personal: qué se puede leer)"],
    "ideas": ["3.2.1 (ideas de vídeo y redes)"],
    "guiones": ["3.2.1 (guion y storyboard de los 2 vídeos de la rotación)"],
    "youtube": ["3.4 (fichas de video_contexto: transcripción, ideas, notas estilo, storyboard, diseño, noticias, personas)"],
}
CTX_KEYS = {
    "contactos": ("rotacion_contactos", "sintesis_previas"),
    "noticias": ("rotacion_videos", "rotacion_categorias", "informes"),
    "referencias": ("imaginacion", "informes"),
    "actividad": ("resumen_actividad", "informes"),
    "ideas": ("imaginacion", "informes", "rotacion_categorias"),
    "guiones": ("rotacion_videos", "rotacion_contactos", "imaginacion"),
    "youtube": ("rotacion_videos", "rotacion_categorias", "imaginacion", "fichas_youtube"),
}


def _mmdd(fecha: str) -> str:
    return fecha[5:7] + fecha[8:10]


def _next_n(usados: set, ini: int = 1) -> int:
    n = ini
    while n in usados:
        n += 1
    return n


def _ctx_rama(ctx: Dict[str, Any], rama: str) -> Dict[str, Any]:
    base = {"fecha": ctx.get("fecha"), "regla": REGLA}
    rot = ctx.get("rotacion", {})
    mapping = {
        "rotacion_contactos": rot.get("contactos", []),
        "rotacion_videos": rot.get("videos", []),
        "rotacion_categorias": rot.get("categorias", []),
        "sintesis_previas": ctx.get("sintesis_previas", []),
        "imaginacion": ctx.get("imaginacion", []),
        "informes": ctx.get("informes", []),
        "resumen_actividad": ctx.get("resumen_actividad"),
        "fichas_youtube": ctx.get("fichas_youtube", []),
    }
    return {**base, **{k: mapping[k] for k in CTX_KEYS[rama] if k in mapping}}


def _secciones(rama: str) -> List[str]:
    return COMUNES + ESPECIFICAS.get(rama, [])


def _prompt(ctx_r: Dict[str, Any], rama: str, secs: List[str]) -> str:
    lines = [f"Rama: {rama}", f"Fecha: {ctx_r['fecha']}", f"Regla: {ctx_r['regla']}", "", "Secciones:"]
    lines += [f"- {s}" for s in secs]
    lines += ["", "Contexto:", json.dumps(ctx_r, ensure_ascii=False, indent=2), "",
              "Entrega análisis en JSON. Cada hallazgo: fuente, fecha, por qué importa."]
    return "\n".join(lines)


def _salida(fecha: str, rama: str) -> str:
    return f"starseed_memory_root/imaginacion/agentes/sintesis-{fecha}-{rama}.json"


def generar_tareas_analisis(
    ctx: Dict[str, Any], raiz: str, ahora: Optional[str] = None
) -> List[Dict[str, Any]]:
    fecha = ctx.get("fecha") or (datetime.fromisoformat(ahora).date().isoformat() if ahora else datetime.now().date().isoformat())
    mmdd = _mmdd(fecha)
    usados, tareas = set(), []
    for i, rama in enumerate(RAMAS):
        n = _next_n(usados, i + 1)
        usados.add(n)
        cid = f"SIN{mmdd}{n}"
        ctx_r = _ctx_rama(ctx, rama)
        secs = _secciones(rama)
        tareas.append({
            "id": cid, "ola": f"Síntesis · análisis {rama} {fecha}", "titulo": f"Análisis {rama} · síntesis {fecha}",
            "tipo": "analisis", "modo": "libre", "rol": "analista", "capacidad": "alta",
            "agente": "sintesis-produccion", "fuente": "sintesis_fuentes", "contexto": rama,
            "contexto_estado": "activo", "ambito": "metagenesis", "sesion": fecha,
            "privado": (rama == "actividad"), "archivos": [], "referencias": [],
            "salida": _salida(fecha, rama), "formato_salida": "json/1", "depende": [],
            "prompt": _prompt(ctx_r, rama, secs), "estimado": {"llamadas": 2},
            "creada": ahora or datetime.now().isoformat(), "rama": rama,
        })
    return tareas