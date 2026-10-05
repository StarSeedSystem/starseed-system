"""
Módulo diseno_brief.py
Brief de diseño puro por tarea de interfaz (contrato architecture/director-diseno.md §3).

Sin E/S salvo `cargar_memoria`, que lee memory/diseno/ y tolera que falten archivos.
"""

import os
import re
from typing import Dict, List, Optional, Tuple

from scripts.puente.roles_agente import division_de

EXTENSIONES_INTERFAZ = (".tsx", ".css", ".module.css", ".mdx")

PALABRAS_INTERFAZ = ("tailwind.config", "tema", "widget", "fondo", "icono")

# Palabras clave de contexto -> nombre de identidad en memory/diseno/identidades.md
IDENTIDADES_CLAVES = [
    ("mando", "mando"),
    ("cafe", "café"),
    ("café", "café"),
    ("audiomorphic", "audiomorphic"),
    ("astraura", "astraura"),
    ("materia", "materia viva"),
    ("preset", "materia viva"),
    ("nexus", "starseed os/nexus"),
]

MATRIZ_PANTALLAS = """- Tamaños: móvil 360×780 y 430×932; tablet 768×1024 y 1024×1366; escritorio 1280×800 y 1920×1080; TV 3840×2160; plegable 280 px.
- Entradas: táctil y puntero.
- Sistemas: iOS, Android, macOS, Windows y Linux (safe areas, scroll elástico, fuentes del sistema, teclado virtual).
- Accesibilidad: prefers-reduced-motion, prefers-color-scheme, contraste ≥ 4.5:1 y dianas de 44 px."""

VERIFICACION_RESUMEN = """La verificación (§4) capturará las rutas en toda la matriz y medirá:
- Desbordes y texto cortado.
- Contraste WCAG ≥ 4.5:1.
- Dianas táctiles ≥ 44 px en móvil.
- Errores de consola y elementos fuera del viewport."""

HERRAMIENTAS = [
    ("chat", "assistant-ui — https://github.com/assistant-ui/assistant-ui (chats e hilos)"),
    ("mensaj", "assistant-ui — https://github.com/assistant-ui/assistant-ui (chats e hilos)"),
    ("copilot", "CopilotKit — https://github.com/copilotkit/copilotkit (copilotos en la app)"),
    ("agente", "Mastra — https://github.com/mastra-ai/mastra (agentes TS en el front)"),
    ("grafo", "LangGraph.js — https://github.com/langchain-ai/langgraphjs (grafos con estado)"),
    ("cartel", "OpenDesign — https://github.com/nexu-io/open-design (piezas gráficas)"),
    ("generativ", "Tambo — https://github.com/tambo-ai/tambo (interfaz generativa)"),
]

HERRAMIENTAS_BASE = [
    "taste-skill — https://github.com/Leonxlnx/taste-skill (criterio estético, en la Biblioteca)",
    "UI-TARS — https://github.com/bytedance/UI-TARS (verificación visual de §4)",
]


def _texto_tarea(tarea: Dict) -> str:
    """Junta título, descripción/prompt y archivos de la tarea en un solo texto."""
    partes = [
        str(tarea.get("titulo", "") or ""),
        str(tarea.get("prompt", "") or tarea.get("descripcion", "") or ""),
    ]
    archivos = tarea.get("archivos") or []
    partes.extend(str(a) for a in archivos)
    return " ".join(partes)


def es_de_interfaz(tarea: Dict) -> bool:
    """True si la tarea toca interfaz: misma regla que el rol `design` de roles_agente,
    ampliada a .css/.mdx bajo src/, tailwind.config, temas, widgets, fondos e iconos."""
    archivos = [str(a).replace("\\", "/") for a in (tarea.get("archivos") or [])]
    if archivos and division_de(archivos) == "design":
        return True
    for ruta in archivos:
        baja = ruta.lower()
        nombre = os.path.basename(baja)
        if baja.startswith("src/") and (
            baja.endswith(EXTENSIONES_INTERFAZ)
            or "tailwind.config" in nombre
            or ".theme." in nombre
        ):
            return True
    texto = _texto_tarea(tarea).lower()
    return any(p in texto for p in ("widget", " icono", "icono de", "fondo de pantalla"))


def identidad_de(tarea: Dict, identidades: Dict[str, str]) -> Tuple[str, str]:
    """Devuelve (nombre, ficha) de la identidad que aplica a la tarea.

    `identidades` es un dict nombre -> texto de ficha. Si no hay coincidencia
    por palabras clave, se usa la ficha por defecto (StarSeed OS/Nexus)."""
    texto = _texto_tarea(tarea).lower()
    nombre_buscado = "starseed os/nexus"
    for clave, nombre in IDENTIDADES_CLAVES:
        if clave in texto:
            nombre_buscado = nombre
            break
    for nombre, ficha in identidades.items():
        if nombre_buscado in nombre.lower():
            return nombre, ficha
    if identidades:
        nombre = next(iter(identidades))
        return nombre, identidades[nombre]
    return nombre_buscado, ""


def parsear_identidades(texto: str) -> Dict[str, str]:
    """Divide identidades.md en un dict nombre de contexto -> ficha.

    Cada ficha empieza por un encabezado (línea que empieza por #)."""
    fichas: Dict[str, str] = {}
    if not texto:
        return fichas
    actual: Optional[str] = None
    lineas: List[str] = []
    for linea in texto.splitlines():
        if linea.lstrip().startswith("#"):
            if actual is not None:
                fichas[actual] = "\n".join(lineas).strip()
            actual = linea.lstrip("# ").strip()
            lineas = []
        elif actual is not None:
            lineas.append(linea)
    if actual is not None:
        fichas[actual] = "\n".join(lineas).strip()
    return fichas


def cargar_memoria(raiz: str) -> Dict[str, str]:
    """Lee memory/diseno/ bajo `raiz`; tolera que falten archivos (texto vacío).

    Única función con E/S del módulo. Devuelve {identidades, armonia, referencias}."""
    memoria: Dict[str, str] = {"identidades": "", "armonia": "", "referencias": ""}
    base = os.path.join(os.path.expanduser(raiz), "memory", "diseno")
    for clave in memoria:
        ruta = os.path.join(base, clave + ".md")
        try:
            with open(ruta, "r", encoding="utf-8", errors="ignore") as fp:
                memoria[clave] = fp.read()
        except Exception:
            pass
    return memoria


def _elegir_lineas(texto_fuente: str, texto_tarea: str, maximo: int) -> List[str]:
    """Elige hasta `maximo` líneas con contenido de la fuente, priorizando las
    que comparten palabras con la tarea (sin mezclar líneas a medias)."""
    lineas = [
        l.strip()
        for l in texto_fuente.splitlines()
        if l.strip() and not l.strip().startswith("#")
    ]
    if not lineas:
        return []
    palabras = set(re.findall(r"[a-záéíóúüñ]{4,}", texto_tarea.lower()))
    puntuadas = sorted(
        lineas,
        key=lambda l: -len(palabras & set(re.findall(r"[a-záéíóúüñ]{4,}", l.lower()))),
    )
    return puntuadas[:maximo]


def _herramientas_para(tarea: Dict) -> List[str]:
    """Herramientas y skills de §7 que casan con la tarea, más las de base."""
    texto = _texto_tarea(tarea).lower()
    elegidas: List[str] = []
    for clave, linea in HERRAMIENTAS:
        if clave in texto and linea not in elegidas:
            elegidas.append(linea)
    return elegidas + HERRAMIENTAS_BASE


def _secciones_brief(tarea: Dict, memoria: Dict[str, str]) -> List[Tuple[str, str]]:
    """Construye los 7 apartados del brief en el orden del contrato §3."""
    texto = _texto_tarea(tarea)
    titulo = str(tarea.get("titulo", "") or "").strip()
    identidades = parsear_identidades(memoria.get("identidades", ""))
    nombre_identidad, ficha = identidad_de(tarea, identidades)

    proposito = (
        "Pantalla: " + titulo
        if titulo
        else "No se deduce de la tarea: escribe el propósito y el objetivo en una línea del commit."
    )

    identidad_txt = "Contexto: " + nombre_identidad + "."
    if ficha:
        identidad_txt += "\n" + ficha
    else:
        identidad_txt += "\nFicha no disponible en memoria; usa tokens, nunca hex sueltos."

    armonia = _elegir_lineas(memoria.get("armonia", ""), texto, 6)
    armonia_txt = (
        "\n".join("- " + l.lstrip("-* ") for l in armonia)
        if armonia
        else "Sin memoria de armonía: aplica escala φ (1.618; 1.25 en pantallas chicas), "
        "espaciado Fibonacci y rejilla áurea."
    )

    referencias = _elegir_lineas(memoria.get("referencias", ""), texto, 4)
    referencias_txt = (
        "\n".join("- " + l.lstrip("-* ") for l in referencias[:4])
        if referencias
        else "Sin memoria de referencias: consulta 21st.dev y DESIGN.md del repo."
    )

    herramientas_txt = "\n".join("- " + h for h in _herramientas_para(tarea))

    return [
        ("1. Propósito y objetivo", proposito),
        ("2. Identidad", identidad_txt),
        ("3. Matriz de pantallas", MATRIZ_PANTALLAS),
        ("4. Armonía", armonia_txt),
        ("5. Referencias", referencias_txt),
        ("6. Herramientas y skills", herramientas_txt),
        ("7. Verificación", VERIFICACION_RESUMEN),
    ]


def brief(tarea: Dict, memoria: Dict[str, str], max_chars: int = 2500) -> str:
    """Devuelve el Brief de diseño de la tarea (los 7 apartados, recortado a
    `max_chars` sin cortar ninguna línea por la mitad)."""
    lineas: List[str] = ["# Brief de diseño — director-diseno"]
    if not any((memoria or {}).values()):
        lineas.append("Aviso: sin memoria de diseño (memory/diseno/ vacía o ausente).")
    for titulo_sec, cuerpo in _secciones_brief(tarea, memoria or {}):
        lineas.append("\n## " + titulo_sec)
        lineas.extend(cuerpo.splitlines())

    total = 0
    recortadas: List[str] = []
    for linea in lineas:
        suma = len(linea) + 1
        if total + suma > max_chars:
            break
        recortadas.append(linea)
        total += suma
    return "\n".join(recortadas).strip()
