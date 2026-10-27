# -*- coding: utf-8 -*-
"""Tarjetas de habilidad de Matt Pocock para los escritores del enjambre (Ola 1018L · L).

Las tarjetas (≤ 60 palabras, en español) son las de src/ai/astraura/habilidades
(ingenieria-a/b.ts), copiadas como datos (contrato architecture/laya-y-habilidades.md
§4-§5). Si Laya local responde en ≤ PLAZO_LAYA_S la elige ella (`elegir_con_laya`) con su
confianza CALIBRADA `answer_confidence` (§1); si no llega o duda, la regla de palabras.
Laya tarda segundos (§2): arma el prompt de un escritor de fondo, nunca bloquea la primera
palabra de una conversación. PURO: red inyectable (`pedir`); pruebas sin red ni modelos.
"""

import json
import os
import re
import urllib.request

TITULO = "Cómo trabajar (habilidad de Matt Pocock, MIT)"
PLAZO_LAYA_S = 3.0
UMBRAL_CONF = 0.8
LAYA_URL = "http://127.0.0.1:4470/v1/systemone"

HABILIDADES = {  # id → (nombre, tarjeta); copia fiel de los datos de TS (§5)
    "tdd": ("TDD · Desarrollo guiado por pruebas",
        "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión."),
    "diagnosing-bugs": ("Diagnóstico de fallos difíciles",
        "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>."),
    "codebase-design": ("Diseño de módulos profundos",
        "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real."),
    "to-spec": ("De la conversación a la especificación",
        "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent."),
}

# Palabras (minúsculas, con y sin tilde) del título/prompt; en el orden del contrato, gana la primera.
REGLA_PALABRAS = (
    ("tdd", ("prueba", "pruebas", "test", "tests")),
    ("diagnosing-bugs", ("error", "errores", "fallo", "fallos", "arregla", "arreglar", "bug", "depura", "depurar")),
    ("codebase-design", ("modulo", "módulo", "modulos", "módulos", "interfaz", "interfaces", "refactor", "refactoriza", "refactorizar")),
    ("to-spec", ("contrato", "contratos", "especificacion", "especificación", "especificaciones", "spec")),
)

# Pregunta tipada de Laya (choice, §4): la habilidad que aplica + «ninguna».
PREGUNTA = {
    "habilidad": {
        "type": "choice",
        "instructions": "¿Qué habilidad de trabajo (Matt Pocock) aplica mejor a esta tarea?",
        "criteria": {
            "tdd": "construir con la prueba escrita primero",
            "diagnosing-bugs": "diagnosticar y arreglar un fallo",
            "codebase-design": "diseñar o mejorar la interfaz de un módulo",
            "to-spec": "convertir lo conversado en una especificación",
            "ninguna": "no aplica ninguna habilidad",
        },
    }
}


def tarjeta_para(tarea):
    """La habilidad que aplica según las palabras del título y del prompt; None si no hay."""
    if not isinstance(tarea, dict):
        return None
    texto = (str(tarea.get("titulo", "")) + " " + str(tarea.get("prompt", ""))).lower()
    return next((idi for idi, ps in REGLA_PALABRAS if any(re.search(r"\b%s\b" % re.escape(p), texto) for p in ps)), None)


def elegir_con_laya(prompt, tarea, pedir):
    """La elección de Laya; None si falla o duda (< UMBRAL_CONF); «ninguna» si está segura de que
    no aplica ninguna. En UNA pasada Laya responde choice/score/noul: aquí manda la choice con
    `answer_confidence` (la CALIBRADA, nunca `confidence`); el estado va recortado (512 tokens).
    """
    if pedir is None:
        return None
    if not isinstance(tarea, dict):
        tarea = {}
    estado = " ".join(str(p) for p in (tarea.get("titulo", ""), str(prompt or "")) if p)[:1200].strip()
    try:
        resultado = pedir(estado, PREGUNTA)
    except Exception:
        return None
    answers = resultado.get("answers") if isinstance(resultado, dict) else None
    respuesta = answers.get("habilidad") if isinstance(answers, dict) else None
    if not isinstance(respuesta, dict):
        return None
    confianza = respuesta.get("answer_confidence")
    if not isinstance(confianza, (int, float)) or float(confianza) < UMBRAL_CONF:
        return None
    choice = respuesta.get("choice")
    if not isinstance(choice, str):
        return None
    # Una «ninguna» segura también es decisión: sin tarjeta y sin vuelta a las palabras.
    return choice if choice in HABILIDADES or choice == "ninguna" else None


def con_habilidad(prompt, tarea, laya=None):
    """El encargo con la tarjeta al final (título TITULO); sin habilidad, tal cual. Idempotente.
    Con `laya` inyectado decide Laya (si responde y no duda); si no, las palabras.
    """
    texto = str(prompt or "")
    if not texto or TITULO in texto:
        return texto
    elegida = elegir_con_laya(texto, tarea, laya) if laya is not None else None
    if elegida is None:
        elegida = tarjeta_para(tarea)
    if elegida not in HABILIDADES:
        return texto
    nombre, tarjeta = HABILIDADES[elegida]
    return "%s\n\n## %s\n\nHabilidad que aplica: %s.\n\n%s\n" % (texto.rstrip(), TITULO, nombre, tarjeta)


def laya_local(estado, preguntas, url=None, plazo=PLAZO_LAYA_S):
    """POST /v1/systemone a Laya local (el formato de Jev); None ante cualquier imprevisto."""
    endpoint = url or os.environ.get("STARSEED_LAYA_URL", LAYA_URL)
    cuerpo = json.dumps({"state": estado, "questions": preguntas}, ensure_ascii=False).encode("utf-8")
    try:
        peticion = urllib.request.Request(endpoint, data=cuerpo, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(peticion, timeout=plazo) as respuesta:
            if respuesta.status != 200:
                return None
            datos = json.loads(respuesta.read().decode("utf-8"))
            return datos if isinstance(datos, dict) else None
    except Exception:
        return None
