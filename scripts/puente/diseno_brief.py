"""
Módulo diseno_brief.py
Brief de diseño puro por tarea de interfaz (contrato architecture/director-diseno.md §3).

Sin E/S salvo `cargar_memoria`, que lee memory/diseno/ y tolera que falten archivos.
"""

import os
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

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

# §10 movimiento: palabras que delatan una tarea con pieza en movimiento
# (por texto de la tarea y por nombres de archivo, que entran en _texto_tarea).
PALABRAS_MOVIMIENTO = (
    "canvas", "animaci", "animado", "keyframes", "framer-motion", "audiomorphic",
    "vídeo", "video", "carrusel", "logo animado", "movimiento",
)

# Línea E literal de architecture/diseno-referencias/movimiento-rise.md: va en
# todos los prompts de movimiento, sin tocarla.
LINEA_E_RISE = (
    "Dibuja cada cuadro en código desde una sola función render(t). Añade textura "
    "real para que se sienta hecho a mano. Antes de parar, revisa los cuadros al "
    "0 %, 25 %, 50 %, 75 % y 100 % y arregla lo que se vea mal."
)

RISE_TEXTO = (
    "- R · Referencias: el ADN de la identidad con su imagen; los logos salen del "
    "archivo real del repo, nunca dibujados de memoria.\n"
    "- I · Idea: principio, medio y final con un solo cambio; duración explícita "
    "(5–10 s); en bucle, el último cuadro es idéntico al primero.\n"
    "- S · Estilo: cómo se ve y cómo se mueve (qué se mueve primero) con los tokens "
    "de la identidad; formatos 16:9, 9:16 y 1:1 recomponiendo la escena, nunca "
    "recortándola.\n"
    "- E · Examinar: «" + LINEA_E_RISE + "»\n"
    "Contrato técnico: render(t) pura en un solo canvas (el mismo t da siempre el "
    "mismo cuadro; aleatoriedad solo con hash con semilla, nunca Math.random dentro "
    "de render), expone window.__render(t) (o ?t= en la URL) para el verificador y "
    "respeta prefers-reduced-motion con un cuadro fijo representativo."
)

# Tope duro del PROMPT.md de un ADN (adn-diseno.md): 2 KB.
TOPE_PROMPT_ADN = 2048


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

    Cada ficha empieza por un encabezado de nivel 1 o 2; los subencabezados
    (### …) son contenido de la ficha que los contiene (p. ej. los presets)."""
    fichas: Dict[str, str] = {}
    if not texto:
        return fichas
    actual: Optional[str] = None
    lineas: List[str] = []
    for linea in texto.splitlines():
        desnuda = linea.lstrip()
        if desnuda.startswith("#") and not desnuda.startswith("###"):
            if actual is not None:
                fichas[actual] = "\n".join(lineas).strip()
            actual = desnuda.lstrip("# ").strip()
            lineas = []
        elif actual is not None:
            lineas.append(linea)
    if actual is not None:
        fichas[actual] = "\n".join(lineas).strip()
    return fichas


def es_de_movimiento(tarea: Dict) -> bool:
    """True si la tarea toca una pieza con movimiento (§10): canvas, animación,
    keyframes, framer-motion, Audiomorphic, vídeo, carrusel o logo animado."""
    texto = _texto_tarea(tarea).lower()
    return any(p in texto for p in PALABRAS_MOVIMIENTO)


def slug_de(nombre: str) -> str:
    """Slug de carpeta ADN para un nombre de identidad («StarSeed Café» → cafe)."""
    plano = unicodedata.normalize("NFKD", nombre.lower())
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", plano).strip("-")


def identidades_de(tarea: Dict, identidades: Dict[str, str]) -> List[Tuple[str, str]]:
    """Todas las identidades que toca la tarea, sin repetir y en orden de
    aparición de la palabra clave. Si ninguna casa, la de `identidad_de`."""
    texto = _texto_tarea(tarea).lower()
    buscados: List[str] = []
    for clave, nombre in IDENTIDADES_CLAVES:
        if clave in texto and nombre not in buscados:
            buscados.append(nombre)
    resultado: List[Tuple[str, str]] = []
    for buscado in buscados:
        for nombre, ficha in identidades.items():
            if buscado in nombre.lower() and nombre not in [n for n, _ in resultado]:
                resultado.append((nombre, ficha))
                break
    if not resultado:
        nombre, ficha = identidad_de(tarea, identidades)
        resultado = [(nombre, ficha)]
    return resultado


def _imagen_adn(carpeta: str, slug: str) -> str:
    """Primera imagen de referencia/ de un ADN, como ruta relativa al repo.
    Vacía si no hay (sin imagen no hay ADN usable; no se inventa nada)."""
    ref = os.path.join(carpeta, "referencia")
    try:
        for nombre in sorted(os.listdir(ref)):
            if not nombre.startswith("."):
                return os.path.join(
                    "memory", "diseno", "adn", slug, "referencia", nombre)
    except OSError:
        pass
    return ""


def cargar_memoria(raiz: str) -> Dict[str, Any]:
    """Lee memory/diseno/ bajo `raiz`; tolera que falten archivos (texto vacío).

    Única función con E/S del módulo. Devuelve {identidades, armonia, referencias,
    adn}; `adn` es un dict slug -> {prompt, imagen} y NUNCA lee dna.json."""
    memoria: Dict[str, Any] = {"identidades": "", "armonia": "", "referencias": "", "adn": {}}
    base = os.path.join(os.path.expanduser(raiz), "memory", "diseno")
    for clave in ("identidades", "armonia", "referencias"):
        ruta = os.path.join(base, clave + ".md")
        try:
            with open(ruta, "r", encoding="utf-8", errors="ignore") as fp:
                memoria[clave] = fp.read()
        except Exception:
            pass
    base_adn = os.path.join(base, "adn")
    try:
        for slug in sorted(os.listdir(base_adn)):
            carpeta = os.path.join(base_adn, slug)
            ruta_prompt = os.path.join(carpeta, "PROMPT.md")
            if not os.path.isfile(ruta_prompt):
                continue
            with open(ruta_prompt, "r", encoding="utf-8", errors="ignore") as fp:
                memoria["adn"][slug] = {
                    "prompt": fp.read(),
                    "imagen": _imagen_adn(carpeta, slug),
                }
    except OSError:
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


def _bloque_adn(nombre: str, memoria_adn: Dict[str, Dict[str, str]]) -> Optional[str]:
    """Bloque ADN de una identidad (§9): la imagen de referencia PRIMERO y con
    nombre, después el PROMPT.md tal cual. Nunca se lee dna.json. Si el ADN no
    existe aún, devuelve None y el brief sigue con la ficha de identidades.md."""
    slug = slug_de(nombre)
    entrada = (memoria_adn or {}).get(slug)
    if entrada is None:
        for clave, valor in (memoria_adn or {}).items():
            if slug in clave or clave in slug:
                slug = clave
                entrada = valor
                break
    if entrada is None:
        return None
    imagen = entrada.get("imagen", "")
    prompt = (entrada.get("prompt") or "").strip()
    if not imagen:
        return "ADN de «" + slug + "» sin imagen de referencia: no se usa hasta que la tenga."
    if len(prompt.encode("utf-8")) > TOPE_PROMPT_ADN:
        return ("ADN de «" + slug + "» con PROMPT.md por encima del tope de 2 KB: "
                "recompílalo con diseno_adn.py; mientras tanto vale la ficha de identidades.md.")
    lineas = [
        "Imagen de referencia (mírala primero): " + imagen,
        "",
        "PROMPT.md de «" + slug + "», tal cual:",
        prompt,
    ]
    return "\n".join(lineas)


def _secciones_brief(tarea: Dict, memoria: Dict[str, Any]) -> List[Tuple[str, str]]:
    """Construye los apartados del brief en el orden del contrato §3, con los
    bloques ADN de §9 tras la identidad y la sección RISE de §10 al final."""
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

    secciones = [
        ("1. Propósito y objetivo", proposito),
        ("2. Identidad", identidad_txt),
    ]
    # §9: un bloque ADN por identidad de la tarea, separados, nunca mezclados
    # (sin ADN en memoria la ficha de identidades.md sigue valiendo y no hay bloque).
    memoria_adn = memoria.get("adn") or {}
    vistos: List[str] = []
    for nombre, _ficha in identidades_de(tarea, identidades):
        if nombre in vistos:
            continue
        vistos.append(nombre)
        bloque = _bloque_adn(nombre, memoria_adn)
        if bloque:
            secciones.append(("ADN — " + nombre, bloque))
    secciones.extend([
        ("3. Matriz de pantallas", MATRIZ_PANTALLAS),
        ("4. Armonía", armonia_txt),
        ("5. Referencias", referencias_txt),
        ("6. Herramientas y skills", herramientas_txt),
        ("7. Verificación", VERIFICACION_RESUMEN),
    ])
    # §10: sección RISE solo si la tarea toca movimiento.
    if es_de_movimiento(tarea):
        secciones.append(("8. Movimiento — método RISE", RISE_TEXTO))
    return secciones


def brief(tarea: Dict, memoria: Dict[str, Any], max_chars: int = 2500) -> str:
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
