#!/usr/bin/env python3
"""Tarjeta de habilidad de Matt Pocock para cada escritor del enjambre (contrato
architecture/laya-y-habilidades.md §5 y §7, tarea L): al final del prompt del escritor va la
TARJETA (≤ 60 palabras) que encaja con su tarea; si Laya local responde en ≤ `PLAZO_LAYA_S` s,
la elige `elegir_con_laya` en vez de las palabras del título y el prompt. PURO: transporte y
reloj inyectados; textos = los de `src/ai/astraura/habilidades`, copiados verbatim.
"""

import re
import time
import unicodedata

TITULO = "CÓMO TRABAJAR (habilidad de Matt Pocock, MIT)"
LICENCIA = "Basado en github.com/mattpocock/skills (commit 49dd158), Copyright (c) 2026 Matt Pocock, licencia MIT."
#: Laya tarda segundos en CPU (contrato §2 y §8): si no llega, deciden las palabras.
PLAZO_LAYA_S = 3.0
#: Umbral sobre `answer_confidence` (calibrada; en español baja, §2): protocolo p ≥ 0,8.
UMBRAL_LAYA = 0.8

TARJETAS = (
    {"id": "tdd", "nombre": "TDD · Desarrollo guiado por pruebas",
     "cuando": "Cuando se quiere construir una función o arreglar un fallo escribiendo primero la prueba, se menciona «rojo-verde-refactor» o se piden pruebas de integración.",
     "tarjeta": "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión."},
    {"id": "diagnosing-bugs", "nombre": "Diagnóstico de fallos difíciles",
     "cuando": "Cuando alguien pide «diagnostica» o «depura esto», o informa de algo roto, que lanza errores, falla o va lento.",
     "tarjeta": "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>."},
    {"id": "codebase-design", "nombre": "Diseño de módulos profundos",
     "cuando": "Cuando se diseña o mejora la interfaz de un módulo, se buscan oportunidades de profundizar, se decide dónde va una costura o se quiere código más fácil de probar y de recorrer por una IA.",
     "tarjeta": "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real."},
    {"id": "to-spec", "nombre": "De la conversación a la especificación",
     "cuando": "Cuando ya se habló de una función y hay que convertirla en una especificación publicada, sin volver a entrevistar.",
     "tarjeta": "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent."},
)

# Palabras (sin acento; «prueba» casa con «pruebas» por prefijo) que activan cada tarjeta,
# en orden: la regla determinista del contrato §4, a la que se vuelve si Laya no llega.
PALABRAS = (("tdd", ("prueba",)), ("diagnosing-bugs", ("error", "fallo", "arreglar")),
            ("codebase-design", ("modulo", "interfa", "refactor")), ("to-spec", ("contrato", "especificacion")))


def tarjeta_de(id_habilidad) -> "dict[str, str] | None":
    """La tarjeta con ese id, o None."""
    return next((t for t in TARJETAS if t["id"] == id_habilidad), None)


def _norma(texto):
    """Minúsculas y sin tildes, para casar con palabras sin acento."""
    return "".join(c for c in unicodedata.normalize("NFD", (texto or "").lower()) if not unicodedata.combining(c))


def id_por_palabras(firma):
    """Id de la primera regla de palabras casada con la firma, o None."""
    tokens = re.findall(r"[a-z0-9-]+", _norma(firma))
    for id_habilidad, claves in PALABRAS:
        if any(t.startswith(k) for t in tokens for k in claves):
            return id_habilidad
    return None


def tarjeta_para(tarea) -> "dict[str, str] | None":
    """Tarjeta que encaja con la tarea por palabras de título y prompt; None si ninguna."""
    if not isinstance(tarea, dict):
        return None
    archivos = tarea.get("archivos") or []
    firma = " ".join(str(x) for x in (tarea.get("titulo", ""), " ".join(archivos) if not isinstance(archivos, str) else archivos, tarea.get("prompt", "")))
    return tarjeta_de(id_por_palabras(firma))


def id_de_respuesta(respuesta, umbral=UMBRAL_LAYA):
    """Id del `choice` de Laya, o None si duda o la forma no es la esperada (contrato §1:
    {"type": "choice", "choice": <valor>, "probabilities", "answer_confidence": <p>}; un
    `score` o un `noul` donde toca `choice` también es None).
    """
    try:
        if respuesta.get("type") != "choice":
            return None
        elegido = str(respuesta.get("choice", ""))
        if elegido not in {t["id"] for t in TARJETAS} or float(respuesta.get("answer_confidence", 0.0)) < umbral:
            return None
        return elegido
    except (AttributeError, KeyError, TypeError, ValueError):
        return None


def estado_laya(tarea, ancho=600):
    """Estado breve y sin claves para Laya: «título · archivos · trozo del prompt»."""
    if not isinstance(tarea, dict):
        return ""
    a = tarea.get("archivos") or []
    trozos = (str(tarea.get("titulo", ""))[:200], str(a if isinstance(a, str) else " ".join(a))[:200], str(tarea.get("prompt", ""))[:ancho])
    return " · ".join(trozos)


def elegir_con_laya(tarea, preguntar=None, reloj=time.monotonic, plazo=PLAZO_LAYA_S, umbral=UMBRAL_LAYA) -> "dict[str, str] | None":
    """Laya local decide si responde en ≤ `plazo` s con confianza ≥ `umbral`; si no, palabras.
    `preguntar(estado, pregunta, opciones)` es el transporte inyectado (None o error →
    palabras). Devuelve lo mismo que `tarjeta_para` (dict o None).
    """
    por_palabras = tarjeta_para(tarea)
    if preguntar is None:
        return por_palabras
    t0 = reloj()
    envio = (estado_laya(tarea), "¿Qué habilidad de ingeniería aplica a esta tarea? Elige una opción.", {t["id"]: t["cuando"] for t in TARJETAS})
    try:
        respuesta = preguntar(*envio)
    except Exception:  # el transporte no puede tumbar la escritura
        respuesta = None
    if respuesta is None or (reloj() - t0) > plazo:
        return por_palabras
    elegido = id_de_respuesta(respuesta, umbral=umbral)
    return tarjeta_de(elegido) if elegido else por_palabras


def con_habilidad(prompt, tarea, tarjeta=None):
    """Prompt con la tarjeta al final bajo el título del bloque; sin tarjeta, sin cambios."""
    t = tarjeta if tarjeta is not None else tarjeta_para(tarea)
    if t is None:
        return prompt or ""
    bloque = TITULO + " · «" + t["nombre"] + "»\n" + t["tarjeta"] + "\n(" + LICENCIA + ")"
    return (prompt.rstrip() + "\n\n" + bloque) if prompt else bloque
