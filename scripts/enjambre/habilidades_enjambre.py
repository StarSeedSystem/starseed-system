# -*- coding: utf-8 -*-
"""Tarjetas de ingeniería para los escritores del enjambre (Ola 1018L · tarea L).
PURA: sin red, disco, reloj ni modelo propios. Red, reloj y Laya van INYECTADOS.
Las tarjetas son las mismas de `src/ai/astraura/habilidades` (Matt Pocock, MIT),
copiadas aquí como datos porque el orquestador corre como script suelto y no debe
depender de TypeScript. Laya elige con `elegir_con_laya` cuando contesta en ≤ 3 s;
en CPU tarda segundos (architecture/laya-y-habilidades.md §2), así que si no llega
a tiempo deciden las palabras: nunca bloquea la primera palabra de una conversación.
Atribución: https://github.com/mattpocock/skills (commit 49dd158), licencia MIT;
texto íntegro en vendor/habilidades/mattpocock-skills/LICENSE.
"""

import time

PLAZO_LAYA_MS = 3000
UMBRAL_LAYA = 0.70
TITULO = "Cómo trabajar (habilidad de Matt Pocock, MIT)"
ATRIBUCION = "Habilidades de ingeniería de Matt Pocock (github.com/mattpocock/skills), licencia MIT."


def _sin_acentos(texto):
    """Minúsculas y sin tildes para que «módulo» y «modulo» casen igual. Pura."""
    reemplazos = str.maketrans("áéíóúüñ", "aeiouun")
    return (texto or "").lower().translate(reemplazos)


#: Palabras → habilidad, en orden de prioridad (contrato, tarea L).
PALABRAS = (
    ("tdd", ("prueba", "test", "tdd", "vitest", "pytest")),
    ("diagnosing-bugs", ("error", "fallo", "falla", "arreglar", "bug", "depurar", "diagnosticar")),
    ("codebase-design", ("módulo", "modulo", "interfaz", "refactor")),
    ("to-spec", ("contrato", "especificación", "especificacion")),
)

HABILIDADES = {
    "tdd": {
        "nombre": "TDD · Desarrollo guiado por pruebas",
        "cuando": "Cuando se quiere construir una función o arreglar un fallo escribiendo primero la prueba, se menciona «rojo-verde-refactor» o se piden pruebas de integración.",
        "tarjeta": "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión.",
    },
    "diagnosing-bugs": {
        "nombre": "Diagnóstico de fallos difíciles",
        "cuando": "Cuando alguien pide «diagnostica» o «depura esto», o informa de algo roto, que lanza errores, falla o va lento.",
        "tarjeta": "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>.",
    },
    "codebase-design": {
        "nombre": "Diseño de módulos profundos",
        "cuando": "Cuando se diseña o mejora la interfaz de un módulo, se busca dónde va una costura o se quiere código más fácil de probar y de recorrer por una IA.",
        "tarjeta": "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real.",
    },
    "to-spec": {
        "nombre": "De la conversación a la especificación",
        "cuando": "Cuando ya se habló de una función y hay que convertirla en una especificación publicada, sin volver a entrevistar.",
        "tarjeta": "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent.",
    },
}


def tarjeta_para(tarea):
    """Id de la habilidad que encaja con el título/prompt de la tarea, o None. Pura."""
    firma = _sin_acentos("%s %s" % ((tarea or {}).get("titulo", ""), (tarea or {}).get("prompt", "")))
    for identificador, claves in PALABRAS:
        if any(clave in firma for clave in claves):
            return identificador
    return None


def pregunta_habilidad():
    """Pregunta `choice` de Laya: una opción por habilidad más «ninguna». Pura."""
    criterios = {identificador: h["cuando"] for identificador, h in HABILIDADES.items()}
    criterios["ninguna"] = "Ninguna habilidad de ingeniería encaja con esta tarea."
    return {"type": "choice", "criteria": criterios,
            "instructions": "Elige la habilidad de ingeniería que mejor encaja con esta tarea."}


def _respuesta(respuesta, nombre):
    """Saca `nombre` de la forma real de Laya (`{answers: {...}}`). Pura."""
    if not isinstance(respuesta, dict):
        return None
    respuestas = respuesta.get("answers")
    return respuestas.get(nombre) if isinstance(respuestas, dict) else respuesta


def elegir_con_laya(tarea, preguntar, ahora=None):
    """Decide con Laya si contesta en ≤ 3 s; si no, None (deciden las palabras). Pura.

    `preguntar(estado, pregunta)` va inyectada y devuelve el cuerpo real de Laya;
    se decide con `answer_confidence` (calibrada), NUNCA con `confidence`. `ahora` es inyectable.
    """
    reloj = ahora or time.monotonic
    estado = "%s\n%s" % ((tarea or {}).get("titulo", ""), (tarea or {}).get("prompt", ""))
    inicio = reloj()
    try:
        answer = _respuesta(preguntar(estado[:4000], pregunta_habilidad()), "habilidad")
    except Exception:
        return None
    if (reloj() - inicio) * 1000 > PLAZO_LAYA_MS or not isinstance(answer, dict):
        return None
    conf = answer.get("answer_confidence")
    if isinstance(conf, bool) or not isinstance(conf, (int, float)) or conf < UMBRAL_LAYA:
        return None
    eleccion = answer.get("choice")
    if eleccion == "ninguna":
        return "ninguna"
    return eleccion if eleccion in HABILIDADES else None


def con_habilidad(prompt, tarea, elegir=None):
    """Añade la tarjeta que toca al final del prompt; sin tarjeta, lo deja igual. Pura."""
    if not prompt:
        return prompt
    try:
        identificador = elegir(tarea) if elegir else tarjeta_para(tarea)
    except Exception:
        identificador = tarjeta_para(tarea)
    habilidad = HABILIDADES.get(identificador)
    if identificador == "ninguna" or not habilidad or TITULO in prompt:
        return prompt
    bloque = "\n\n## %s\n**%s** — %s\n\n_%s_" % (TITULO, habilidad["nombre"], habilidad["tarjeta"], ATRIBUCION)
    return prompt.rstrip() + bloque
