#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reglas puras para encargos de varias horas: validación, panel, fusión, clasificación."""
import re
from typing import Any


# Tipos de entregable válidos para encargos (incluye informe y documento además de TIPOS de notebooklm)
ENTREGABLES_VALIDOS: tuple[str, ...] = (
    "informe", "documento",
    "infographic", "audio", "video", "slide-deck", "mind-map", "quiz", "flashcards", "data-table", "report",
)

# Carpetas de destino en Drive (clave -> id de carpeta)
DESTINOS: dict[str, str] = {
    "fuentes": "1wyQaChAJwQwt9VG3Bi_zEJj9TWA7Qcf9",
    "fundamentos": "1n_xD7ltHIV2daLBUsuG01TuT25C_hE9E",
    "videos": "1t-OuVdOyj2GW0XomHmgUveWrixM0_M7v",
    "eventos": "1s1suEbl9nALm62I3ekWmPksKYuTle4hb",
    "herramientas": "1X1g9rHKoyBszsBjdvGjuvC8-yiqEZ7ci",
    "produccion": "1gYbjOTbE5GhpmTdvnmqklvLMdM2GjN9P",
}


def validar_plan(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """Normaliza un plan de encargo: ≤ 10 frentes, ≤ 3 investigaciones y ≤ 8 entregables por frente.
    Devuelve lista de frentes normalizados. Lanza ValueError si no hay frentes válidos.
    Por defecto, todos los entregables tienen enviar=True (el modelo no puede desactivarlo;
    solo Maggasukha puede pedir explícitamente no enviar).
    """
    frentes: list[dict[str, Any]] = []
    for i, f in enumerate((plan.get("frentes") or [])[:10], 1):
        entregables: list[dict[str, Any]] = []
        for e in (f.get("entregables") or [])[:8]:
            if isinstance(e, dict) and e.get("tipo") in ENTREGABLES_VALIDOS and e.get("titulo"):
                entregables.append({
                    "tipo": e["tipo"],
                    "titulo": str(e["titulo"])[:150],
                    "prompt": str(e.get("prompt") or e["titulo"])[:6000],
                    "enviar": True,  # Por defecto siempre enviar; el modelo no puede poner False
                })
        if not entregables:
            continue
        frentes.append({
            "id": f"F{i}",
            "nombre": str(f.get("nombre") or f"Frente {i}")[:120],
            "destino": f.get("destino") if f.get("destino") in DESTINOS else "produccion",
            "investigacion": [str(q)[:1500] for q in (f.get("investigacion") or [])[:3]],
            "fuentes_drive": [x for x in (f.get("fuentes_drive") or []) if isinstance(x, list)][:8],
            "entregables": entregables,
            "estado": "pendiente",
        })
    if not frentes:
        raise ValueError("el plan no tiene frentes con entregables válidos")
    return frentes


# 9 formatos de NotebookLM según §3.1 de architecture/sintesis-multiformato-1113.md
FORMATOS_NOTEBOOKLM: tuple[str, ...] = (
    "informe", "audio", "video", "infographic", "slide-deck", "mind-map", "quiz", "flashcards", "data-table",
)


def validar_todos_los_formatos(plan: dict[str, Any], texto_original: str) -> tuple[bool, str]:
    """Valida que el plan incluya los 9 formatos de NotebookLM si el texto pide 'todos los formatos'.
    
    Devuelve (ok, mensaje_error). Si el texto no pide todos los formatos, devuelve (True, "").
    """
    t = texto_original.lower()
    if not re.search(r"todos los formatos", t):
        return True, ""
    
    tipos_presentes = set()
    for f in plan.get("frentes", []):
        for e in f.get("entregables", []):
            if e.get("tipo") in FORMATOS_NOTEBOOKLM:
                tipos_presentes.add(e["tipo"])
    
    faltantes = [f for f in FORMATOS_NOTEBOOKLM if f not in tipos_presentes]
    if faltantes:
        return False, f"Faltan formatos obligatorios: {', '.join(faltantes)}"
    return True, ""


def por_reglas_permanente(texto: str) -> str:
    """Clasifica si el texto establece una regla permanente.
    
    Palabras clave: 'recuerda', 'cada día', 'siempre', 'para cada', 'a partir de ahora'.
    Devuelve 'regla_permanente' o 'otro'.
    """
    t = texto.lower()
    if re.search(r"recu[eé]rd[a-z]*|cada d[ií]a|siempre|para cada|a partir de ahora", t):
        return "regla_permanente"
    return "otro"


def texto_panel(enc: dict[str, Any]) -> str:
    """Genera el texto en markdown del panel de un encargo."""
    lineas = [
        f"# Panel · {enc['titulo']}",
        "",
        f"Encargo {enc['id']} · estado: **{enc['estado']}** · actualizado ...",
        "",
        "> " + enc["texto"][:1500].replace("\n", "\n> "),
        "",
    ]
    if enc.get("notas"):
        lineas += ["## Ajustes de Maggasukha", ""] + [f"- {n}" for n in enc["notas"]] + [""]
    for f in enc["frentes"]:
        marca = {"hecho": "✅", "en_curso": "⏳"}.get(f.get("estado"), "⬜")
        lineas.append(f"## {marca} {f['id']} · {f['nombre']}")
        if f.get("carpeta_enlace"):
            lineas.append(f"Carpeta: {f['carpeta_enlace']}")
        if f.get("cuaderno"):
            lineas.append(f"Cuaderno de NotebookLM: https://notebooklm.google.com/notebook/{f['cuaderno']}")
        for q in f.get("investigacion", []):
            hecha = "✅" if q in f.get("investigado", []) else "⬜"
            lineas.append(f"- {hecha} Investigación: {q[:160]}")
        for e in f["entregables"]:
            marca_e = "✅" if e.get("enlace") else ("⚠️" if e.get("fallo") else "⬜")
            extra = e.get("enlace") or e.get("fallo") or ""
            tipo_nombre = e["tipo"]
            lineas.append(f"- {marca_e} {tipo_nombre} · {e['titulo']} {extra}")
        lineas.append("")
    return "\n".join(lineas)


def fusionar_encargo_guardado(nuevo: dict[str, Any], viejo: dict[str, Any]) -> dict[str, Any]:
    """Combina el encargo nuevo con el guardado: conserva notas no duplicadas y respeta estado pausado/cancelado."""
    # Fusionar notas: nuevas primero, luego viejas no duplicadas
    notas_nuevas = list(nuevo.get("notas", []))
    notas_viejas = [n for n in viejo.get("notas", []) if n not in notas_nuevas]
    nuevo["notas"] = notas_nuevas + notas_viejas
    # Estado: si viejo estaba pausado/cancelado y nuevo quiere activo, mantener viejo
    if viejo.get("estado") in ("pausado", "cancelado") and nuevo.get("estado") == "activo":
        nuevo["estado"] = viejo["estado"]
    return nuevo


def por_reglas_encargo(texto: str, hay_encargo: bool) -> str:
    """Clasifica si el texto es un encargo (True) o no.
    Un mensaje largo con palabras de aprobación/desarrollo SIEMPRE es encargo, nunca audio.
    """
    t = texto.lower()
    # Palabras clave de encargo largo
    if len(texto) > 400 or re.search(r"se aprueba|apruebo|desarroll|encarg|pr[oó]ximos pasos", t):
        return "encargo"
    return "otro"


def por_reglas_ajuste(texto: str, hay_encargo: bool) -> str:
    """Clasifica si el texto es un ajuste al encargo en curso."""
    if not hay_encargo:
        return "respuesta"
    t = texto.lower()
    if re.search(r"priori|añad|agreg|cambi|ajust|tambi[eé]n|en vez|quita|incluye|enf[oó]ca|guion|storyboard|frente|personaje", t):
        if not re.search(r"env[ií]a|hazme|genera|m[aá]ndame", t):
            return "ajuste"
    return "otro"


def por_reglas_preferencia(texto: str) -> str:
    """Clasifica si el texto es una preferencia permanente."""
    t = texto.lower()
    if re.search(r"recu[eé]rd(alo|a que|ame)|mi nombre es|ll[aá]mame", t):
        return "preferencia"
    return "otro"


REGLAS_MARCA = (
    "Escribe en español, a nivel profesional. Reglas de StarSeed: revolución de diseño, no de conflicto; "
    "Periodismo de Soluciones (todo diagnóstico desemboca en una propuesta); cada dato con fuente y fecha; "
    "lo que aún no existe se rotula «en desarrollo»; colores solo de los tokens de marca; "
    "el símbolo de StarSeed nunca se genera con IA: se usa el original; "
    "de las referencias se dice qué se toma, nunca se copia; nada se publica ni se contacta a nadie; "
    "no uses el nombre de la persona que encarga en el material oficial. "
    "Matriz audiovisual: Semilla (cálido, artesanal, Arts & Crafts), "
    "Fruto/Cosecha (solarpunk, luz dorada, esmeralda, Art Nouveau), "
    "Mente Digital (bioluminiscente, glassmorphism, data art)."
)


def planificar_base(texto: str) -> list[dict[str, Any]]:
    """Plan base de respaldo cuando el modelo no devuelve JSON válido."""
    return [
        {
            "id": "F1",
            "nombre": "Investigación",
            "destino": "fuentes",
            "investigacion": [texto[:1200]],
            "fuentes_drive": [],
            "entregables": [
                {"tipo": "informe", "titulo": "Informe de investigación", "prompt": texto, "enviar": True},
                {"tipo": "mind-map", "titulo": "Mapa de la investigación", "prompt": texto, "enviar": True},
            ],
            "estado": "pendiente",
        },
        {
            "id": "F2",
            "nombre": "Desarrollo",
            "destino": "produccion",
            "investigacion": [],
            "fuentes_drive": [],
            "entregables": [
                {"tipo": "informe", "titulo": "Desarrollo del encargo", "prompt": texto, "enviar": True},
            ],
            "estado": "pendiente",
        },
        {
            "id": "F3",
            "nombre": "Plan y listas de tareas",
            "destino": "produccion",
            "investigacion": [],
            "fuentes_drive": [],
            "entregables": [
                {"tipo": "informe", "titulo": "Próximos pasos y listas de tareas", "prompt": "Próximos pasos y listas de tareas por tipo de contenido para: " + texto, "enviar": True},
            ],
            "estado": "pendiente",
        },
    ]


__all__ = [
    "ENTREGABLES_VALIDOS",
    "DESTINOS",
    "FORMATOS_NOTEBOOKLM",
    "validar_plan",
    "validar_todos_los_formatos",
    "texto_panel",
    "fusionar_encargo_guardado",
    "por_reglas_encargo",
    "por_reglas_ajuste",
    "por_reglas_preferencia",
    "por_reglas_permanente",
    "planificar_base",
    "REGLA_MARCA",
]