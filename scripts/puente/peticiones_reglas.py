#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reglas puras para peticiones por Telegram: tipos, por_reglas, validación, textos.
Incluye comandos de síntesis (§3.6) y gestión de recomendaciones."""
import json
import os
import re
from datetime import datetime, timezone, timedelta
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


# ============================================================
# §3.6 Comandos de síntesis y gestión de recomendaciones
# ============================================================

RECOMENDACIONES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "starseed_memory_root", "sintesis", "recomendaciones.jsonl"
)

ESTADOS_RECOMENDACION = ("propuesta", "aprobada", "rechazada", "ya_existe", "encargada", "integrada")


def _leer_recomendaciones() -> list[dict[str, Any]]:
    """Lee el archivo de recomendaciones (JSONL)."""
    try:
        with open(RECOMENDACIONES_PATH, encoding="utf-8") as f:
            return [json.loads(linea) for linea in f if linea.strip()]
    except (OSError, ValueError):
        return []


def _guardar_recomendaciones(recomendaciones: list[dict[str, Any]]) -> None:
    """Guarda el archivo de recomendaciones (JSONL)."""
    os.makedirs(os.path.dirname(RECOMENDACIONES_PATH), exist_ok=True)
    tmp = RECOMENDACIONES_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for r in recomendaciones:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, RECOMENDACIONES_PATH)


def _obtener_recomendacion_por_numero(n: int) -> tuple[dict[str, Any] | None, int]:
    """Obtiene la n-ésima recomendación (1-indexado) y su índice en la lista."""
    recs = _leer_recomendaciones()
    if 1 <= n <= len(recs):
        return recs[n - 1], n - 1
    return None, -1


def comando_sintesis_lanzar() -> str:
    """/sintesis — La lanza ya."""
    from peticiones_telegram import _revisar_y_procesar_sintesis_diaria
    _revisar_y_procesar_sintesis_diaria()
    return "🚀 Síntesis diaria lanzada. Se procesará la síntesis de hoy/ayer en hora México y se generarán los 9 formatos."


def comando_sintesis_estado() -> str:
    """/sintesis estado — Hito actual y retrasos."""
    from sintesis_multiformato import ya_procesado
    from peticiones_notebooklm import ultima_sintesis
    
    try:
        fid, nombre = ultima_sintesis()
        import re
        m = re.match(r".*?(\d{4}-\d{2}-\d{2})", nombre)
        fecha = m.group(1) if m else "desconocida"
    except RuntimeError:
        return "⚠️ No hay síntesis disponible para hoy/ayer en hora México."
    
    mexico_tz = timezone(timedelta(hours=-6))
    hoy_mexico = datetime.now(mexico_tz).date().isoformat()
    ayer_mexico = (datetime.now(mexico_tz).date() - timedelta(days=1)).isoformat()
    
    procesada = ya_procesado(fecha)
    
    lineas = [
        f"📊 Estado de la síntesis {fecha}:",
        f"• Hito: {'Multiformato completado' if procesada else 'Pendiente de procesar'}",
        f"• Fecha de hoy (México): {hoy_mexico}",
        f"• Fecha de ayer (México): {ayer_mexico}",
    ]
    
    if not procesada:
        lineas.append("• Retraso: La síntesis no se ha procesado aún. MetaGenesis la procesará en el próximo ciclo (cada 15 min) o usa /sintesis para lanzarla ya.")
    else:
        lineas.append("• Sin retrasos.")
    
    return "\n".join(lineas)


def comando_sintesis_contexto() -> str:
    """/sintesis contexto — Resumen del paquete de hoy y enlace al contexto vivo."""
    from peticiones_notebooklm import ultima_sintesis
    from contexto_sintesis import contexto_vivo
    import os
    
    try:
        fid, nombre = ultima_sintesis()
    except RuntimeError:
        return "⚠️ No hay síntesis disponible para hoy/ayer en hora México."
    
    try:
        raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        hoy = datetime.now(timezone.utc).date().isoformat()
        contexto = contexto_vivo(raiz, hoy)
        resumen = f"Fecha: {contexto.get('fecha')}\nSíntesis previas: {len(contexto.get('sintesis_previas', []))}\nInformes: {len(contexto.get('informes', []))}\nImaginación: {len(contexto.get('imaginacion', []))}\nAlcance GitHub: {len(contexto.get('alcance_github', []))}\nProducción Higgsfield: {len(contexto.get('produccion_higgsfield', []))}\nEncargos: {bool(contexto.get('produccion_encargos'))}\nArquitectura: {len(contexto.get('arquitectura_titulos', []))} contratos\nLibrería: {len(contexto.get('libreria', []))} repos\nApps: {len(contexto.get('rutas_apps', []))}"
        enlace = "Contexto generado en memoria (se sube a Drive al procesar la síntesis)"
    except Exception as e:
        return f"⚠️ Error generando contexto vivo: {e}"
    
    return (
        f"📋 Contexto vivo de la síntesis ({nombre}):\n\n"
        f"{resumen}\n\n"
        f"🔗 {enlace}"
    )


def _es_comando_sintesis(texto: str) -> bool:
    """Detecta si el texto es un comando /sintesis."""
    return texto.strip().startswith("/sintesis")


def _parsear_comando_sintesis(texto: str) -> str | None:
    """Parsea subcomando de /sintesis. Devuelve 'lanzar', 'estado', 'contexto' o None."""
    t = texto.strip().lower()
    if t == "/sintesis":
        return "lanzar"
    if t == "/sintesis estado":
        return "estado"
    if t == "/sintesis contexto":
        return "contexto"
    return None


def ejecutar_comando_sintesis(texto: str) -> str | None:
    """Ejecuta comando /sintesis si aplica. Devuelve respuesta o None si no es comando síntesis."""
    sub = _parsear_comando_sintesis(texto)
    if not sub:
        return None
    if sub == "lanzar":
        return comando_sintesis_lanzar()
    if sub == "estado":
        return comando_sintesis_estado()
    if sub == "contexto":
        return comando_sintesis_contexto()
    return "❓ Subcomando desconocido. Usa: /sintesis, /sintesis estado, /sintesis contexto"


# --- Recomendaciones ---

def _es_comando_recomendacion(texto: str) -> bool:
    """Detecta comandos: aprobar <n>, rechazar <n>, ya existe <n>, encarga <n>."""
    t = texto.strip().lower()
    return t.startswith(("aprobar ", "rechazar ", "ya existe ", "encarga "))


def _parsear_comando_recomendacion(texto: str) -> tuple[str, int] | None:
    """Parsea comando de recomendación. Devuelve (accion, numero) o None."""
    t = texto.strip()
    m = re.match(r"^(aprobar|rechazar|ya existe|encarga)\s+(\d+)$", t, re.IGNORECASE)
    if m:
        return m.group(1).lower(), int(m.group(2))
    return None


def _actualizar_estado_recomendacion(n: int, nuevo_estado: str, accion_extra: str = "") -> str:
    """Actualiza el estado de la n-ésima recomendación."""
    recs = _leer_recomendaciones()
    if not (1 <= n <= len(recs)):
        return f"❌ No existe la recomendación #{n}. Hay {len(recs)} recomendaciones."
    
    idx = n - 1
    estado_anterior = recs[idx].get("estado", "propuesta")
    recs[idx]["estado"] = nuevo_estado
    recs[idx]["actualizada"] = datetime.now(timezone.utc).isoformat()
    recs[idx]["accion_extra"] = accion_extra
    _guardar_recomendaciones(recs)
    
    area = recs[idx].get("area", "?")
    texto_rec = recs[idx].get("texto", "")[:100]
    
    return f"✅ Recomendación #{n} ({area}): «{texto_rec}» → {estado_anterior} → {nuevo_estado}{accion_extra}"


def comando_aprobar_recomendacion(n: int) -> str:
    """aprobar <n> — Marca como aprobada."""
    return _actualizar_estado_recomendacion(n, "aprobada")


def comando_rechazar_recomendacion(n: int) -> str:
    """rechazar <n> — Marca como rechazada."""
    return _actualizar_estado_recomendacion(n, "rechazada")


def comando_ya_existe_recomendacion(n: int) -> str:
    """ya existe <n> — Marca como ya existente."""
    return _actualizar_estado_recomendacion(n, "ya_existe")


def comando_encarga_recomendacion(n: int) -> str:
    """encarga <n> — Marca como encargada y crea encargo/ola."""
    recs = _leer_recomendaciones()
    if not (1 <= n <= len(recs)):
        return f"❌ No existe la recomendación #{n}. Hay {len(recs)} recomendaciones."
    
    rec = recs[n - 1]
    
    # Crear encargo en el sistema de encargos
    from peticiones_telegram import _crear_encargo_desde_recomendacion
    try:
        # _crear_encargo_desde_recomendacion toma un dict de recomendación y no retorna ID
        # Simulamos la recomendación actualizada para pasarla
        rec_actualizada = dict(rec)
        rec_actualizada["estado"] = "encargada"
        _crear_encargo_desde_recomendacion(rec_actualizada)
        accion_extra = " · Encargo creado y planificado"
    except Exception as e:
        accion_extra = f" · ⚠️ Error creando encargo: {e}"
    
    return _actualizar_estado_recomendacion(n, "encargada", accion_extra)


def ejecutar_comando_recomendacion(texto: str) -> str | None:
    """Ejecuta comando de recomendación si aplica. Devuelve respuesta o None."""
    parsed = _parsear_comando_recomendacion(texto)
    if not parsed:
        return None
    accion, numero = parsed
    if accion == "aprobar":
        return comando_aprobar_recomendacion(numero)
    if accion == "rechazar":
        return comando_rechazar_recomendacion(numero)
    if accion == "ya existe":
        return comando_ya_existe_recomendacion(numero)
    if accion == "encarga":
        return comando_encarga_recomendacion(numero)
    return None


# --- Reglas de síntesis ("Recuerda...") ---

CLAVES_REGLA_SINTESIS = [
    r"^recuerda\s+(?:que\s+)?",
    r"^nota\s+(?:para\s+)?(?:la\s+)?s[ií]ntesis\s*[:\-]?\s*",
    r"^regla\s+(?:de\s+)?(?:la\s+)?s[ií]ntesis\s*[:\-]?\s*",
    r"^aprend[eií]\s+(?:para\s+)?(?:la\s+)?s[ií]ntesis\s*[:\-]?\s*",
]


def _es_regla_sintesis(texto: str) -> bool:
    """Detecta si el mensaje es una regla para la síntesis."""
    t = texto.strip().lower()
    for patron in CLAVES_REGLA_SINTESIS:
        if re.match(patron, t):
            return True
    return False


def _extraer_regla_sintesis(texto: str) -> str:
    """Extrae el contenido de la regla quitando el prefijo."""
    t = texto.strip()
    for patron in CLAVES_REGLA_SINTESIS:
        t = re.sub(patron, "", t, flags=re.IGNORECASE)
    return t.strip()


def _guardar_regla_sintesis(regla: str) -> str:
    """Guarda la regla en el archivo de notas de agentes de la síntesis."""
    notas_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "starseed_memory_root", "sintesis", "notas-agentes.json"
    )
    try:
        with open(notas_path, encoding="utf-8") as f:
            notas = json.load(f)
    except (OSError, ValueError):
        notas = {}
    
    hoy = datetime.now(timezone.utc).date().isoformat()
    if hoy not in notas:
        notas[hoy] = {}
    
    # Guardar como regla general (sin rol específico)
    if "reglas_sintesis" not in notas[hoy]:
        notas[hoy]["reglas_sintesis"] = []
    notas[hoy]["reglas_sintesis"].append({
        "regla": regla,
        "fecha": datetime.now(timezone.utc).isoformat(),
        "origen": "chat_telegram"
    })
    
    os.makedirs(os.path.dirname(notas_path), exist_ok=True)
    with open(notas_path, "w", encoding="utf-8") as f:
        json.dump(notas, f, ensure_ascii=False, indent=1)
    
    return f"✅ Regla de síntesis guardada: «{regla[:100]}»"


def procesar_regla_sintesis(texto: str) -> str | None:
    """Procesa mensaje como regla de síntesis si aplica. Devuelve confirmación o None."""
    if not _es_regla_sintesis(texto):
        return None
    regla = _extraer_regla_sintesis(texto)
    if not regla:
        return "❓ Regla vacía. Usa: «Recuerda que...» o «Nota para la síntesis:...»"
    return _guardar_regla_sintesis(regla)