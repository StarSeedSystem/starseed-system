# -*- coding: utf-8 -*-
"""Tarjetas de habilidad de Matt Pocock para el escritor del enjambre (Ola 1018L).

Contrato architecture/laya-y-habilidades.md §5: la tarjeta (≤ 60 palabras) va al final del
prompt, bajo el título «Cómo trabajar (habilidad de Matt Pocock, MIT)».
Módulo PURO: la respuesta de Laya llega INYECTADA; solo el atajo `con_habilidad_viva`
consulta los locales. Copias de src/ai/astraura/habilidades (github.com/mattpocock/skills,
commit 49dd158, MIT).
"""
import re
import unicodedata
from time import monotonic

# Las mismas tarjetas de src/ai/astraura/habilidades.
TARJETAS = {
    "tdd": {"nombre": "TDD · Desarrollo guiado por pruebas", "texto": "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión."},
    "diagnosing-bugs": {"nombre": "Diagnóstico de fallos difíciles", "texto": "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>."},
    "codebase-design": {"nombre": "Diseño de módulos profundos", "texto": "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real."},
    "to-spec": {"nombre": "De la conversación a la especificación", "texto": "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent."},
}

# Palabras (sin acentos) → habilidad; orden manda (la primera coincide) y si nada encaja,
# nada se añade.
REGLAS_PALABRAS = (
    (("prueba", "pruebas", "test", "tests", "vitest", "pytest"), "tdd"),
    (("error", "fallo", "arreglar", "depura", "bug"), "diagnosing-bugs"),
    (("modulo", "modulos", "interfaz", "refactor"), "codebase-design"),
    (("contrato", "especificacion", "especificaciones", "spec"), "to-spec"),
)
# En español la confianza de Laya baja a ~0,61 (contrato §2): menos alto que el umbral de Jev.
UMBRAL_LAYA = 0.6
TOPE_SEGUNDOS = 3.0  # contrato §2: en CPU tarda segundos; si tarda más, deciden las palabras.
TITULO_PROMPT = "Cómo trabajar (habilidad de Matt Pocock, MIT)"

# Pregunta `choice` a los locales, en el formato de jev.py (`criteria`).
PREGUNTA_LAYA = {
    "hab": {
        "type": "choice",
        "instructions": "¿Qué habilidad de ingeniería aplica mejor a esta tarea? «ninguna» si es general o encajan varias.",
        "criteria": {"tdd": "escribir primero la prueba", "diagnosing-bugs": "algo ya roto: da error, falla o va lento",
                     "codebase-design": "afinar la interfaz de un módulo", "to-spec": "convertir lo hablado en especificación",
                     "ninguna": "no encaja ninguna con precisión"},
    }
}


def _sin_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFD", (texto or "").lower()) if unicodedata.category(c) != "Mn")


def tarjeta_para(tarea):
    """La tarjeta según las palabras del título y del prompt; None si ninguna encaja."""
    if isinstance(tarea, dict):
        texto = "%s %s" % (tarea.get("titulo", ""), str(tarea.get("prompt", ""))[:600])
    else:
        texto = str(tarea or "")
    partes = re.findall(r"[a-z0-9]+", _sin_acentos(texto))
    for palabras, id_hab in REGLAS_PALABRAS:
        if any(p in partes for p in palabras):
            return TARJETAS[id_hab]
    return None


def elegir_con_laya(respuesta):
    """La tarjeta que Laya eligió (answer `choice`, forma real) o None si duda o falla.

    Umbral con `answer_confidence` (calibrada, contrato §1), NO con `confidence`; si duda
    o da «ninguna», manda la regla de palabras: Laya aporta a la zona de duda, no la sustituye.
    """
    if not isinstance(respuesta, dict):
        return None
    cual = respuesta.get("hab")  # decidir_con_laya devuelve {clave_pregunta: answer}
    if isinstance(cual, dict):
        respuesta = cual
    confianza = respuesta.get("answer_confidence")
    if not isinstance(confianza, (int, float, str)):
        return None
    try:
        confia = float(confianza)
    except (TypeError, ValueError):
        return None
    if respuesta.get("choice") in TARJETAS and confia >= UMBRAL_LAYA:
        return TARJETAS[respuesta["choice"]]
    return None


def con_habilidad(prompt, tarea, respuesta_laya=None, t_laya=None):
    """El prompt con la tarjeta al final; si nada encaja, devuelta sin tocar.

    La respuesta de Laya llega INYECTADA con lo que tardó (`t_laya`): si no respondió en
    ≤ 3 s (contrato §2) su elección no cuenta; aquí no se consulta nada, nunca bloquea.
    """
    tarjeta = None
    if respuesta_laya is not None and (t_laya is None or t_laya <= TOPE_SEGUNDOS):
        tarjeta = elegir_con_laya(respuesta_laya)
    if tarjeta is None:
        tarjeta = tarjeta_para(tarea)
    if tarjeta is None:
        return prompt
    return "%s\n\n%s\n%s — %s" % (prompt, TITULO_PROMPT, tarjeta["nombre"], tarjeta["texto"])


def estado_laya(tarea):
    """Estado breve para el local: título y SOLO la cabeza del prompt (600 caracteres);
    lo privado va a los locales de la persona (127.0.0.1), como en `jev.py`."""
    if not isinstance(tarea, dict):
        return {"tarea": {"texto": str(tarea or "")[:600]}}
    return {"tarea": {
        "titulo": str(tarea.get("titulo", "")),
        "prompt": str(tarea.get("prompt", ""))[:600],
    }}


def con_habilidad_viva(prompt, tarea, tope=1.5):
    """Atajo del enjambre: pregunta a los System One locales y decide `con_habilidad`.

    NO es pura (red real; los módulos puros usan `con_habilidad` con lo inyectado). Sin
    `jev`, sin locales o hablando con Astraura, `decidir_con_laya` da None y las palabras
    deciden. Tope por extremo 1,5 s (contrato §2): dos locales son ≤ 3 s en total.
    """
    respuesta, tado = None, None
    try:  # `jev` vive en scripts/puente; el enjambre y las pruebas ya lo ponen en sys.path.
        import importlib

        jev = importlib.import_module("jev")
        respuesta = jev.decidir_con_laya(estado_laya(tarea), PREGUNTA_LAYA, timeout=tope)
        if respuesta is not None:
            tado = monotonic() - t0
    except Exception:
        respuesta, tado = None, None
    return con_habilidad(prompt, tarea, respuesta_laya=respuesta, t_laya=tado)
