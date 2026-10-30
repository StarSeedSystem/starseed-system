# -*- coding: utf-8 -*-
"""Habilidades de ingeniería para los escritores del enjambre (Ola 1018L · LYS1018L).

Contrato architecture/laya-y-habilidades.md §5: al final del prompt va la tarjeta de Matt
Pocock (MIT) que encaja con la tarea, copiada de `src/ai/astraura/habilidades` como dato.
Elige por palabras y, si el Laya local contesta en ≤ 3 s con `answer_confidence` bastante,
decide Laya («ninguna» también). Red y reloj son inyectables; las pruebas no tocan la red.
"""
import json, math, os, re, unicodedata, urllib.request

NINGUNA = "ninguna"
UMBRAL = 0.6
PLAZO_S = 3.0
TITULO = "Cómo trabajar (habilidad de Matt Pocock, MIT)"
TRANSPORTE = None  # (estado, preguntas, timeout) -> respuesta cruda de Laya

_RAIZ = "vendor/habilidades/mattpocock-skills/engineering"
_TARJETAS = (
    ("tdd", "TDD · Desarrollo guiado por pruebas", "Cuando se quiere construir una función o arreglar un fallo escribiendo primero la prueba, se menciona «rojo-verde-refactor» o se piden pruebas de integración.", "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión.", _RAIZ + "/tdd/SKILL.md"),
    ("diagnosing-bugs", "Diagnóstico de fallos difíciles", "Cuando alguien pide «diagnostica» o «depura esto», o informa de algo roto, que lanza errores, falla o va lento.", "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>.", _RAIZ + "/diagnosing-bugs/SKILL.md"),
    ("codebase-design", "Diseño de módulos profundos", "Cuando se diseña o mejora la interfaz de un módulo, se buscan oportunidades de profundizar, se decide dónde va una costura o se quiere código más fácil de probar y de recorrer por una IA.", "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real.", _RAIZ + "/codebase-design/SKILL.md"),
    ("to-spec", "De la conversación a la especificación", "Cuando ya se habló de una función y hay que convertirla en una especificación publicada, sin volver a entrevistar.", "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent.", _RAIZ + "/to-spec/SKILL.md"),
)
TARJETAS = {
    ident: {"id": ident, "nombre": nombre, "cuando": cuando, "tarjeta": tarjeta, "ruta": ruta}
    for ident, nombre, cuando, tarjeta, ruta in _TARJETAS
}
#: En el orden del contrato: la primera que casa decide. Los patrones ya van sin acentos.
_PALABRAS = (
    (re.compile(r"\bpruebas?\b|\btests?\b|\btdd\b|\brojo[- ]verde\b"), "tdd"),
    (re.compile(r"\berrores?\b|\bfall[oa]s?\b|\barregl\w*\b|\bdepur\w*\b|\bdiagnostic\w*\b"), "diagnosing-bugs"),
    (re.compile(r"\bmodulos?\b|\binterfaces?\b|\brefactor\w*\b|\bdiseno de modulos?\b"), "codebase-design"),
    (re.compile(r"\bcontratos?\b|\bespecificaci\w*\b|\bespecificar\b|\bspecs?\b"), "to-spec"),
)

def _texto(tarea):
    """Título y prompt de la tarea, o el texto entero si ya viene como cadena."""
    if isinstance(tarea, str):
        return tarea
    if not isinstance(tarea, dict):
        return ""
    return ("%s %s" % (tarea.get("titulo") or "", tarea.get("prompt") or "")).strip()

def _normalizar(texto):
    """Minúsculas y sin acentos, para que «módulo» y «modulo» casen igual."""
    plano = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in plano if not unicodedata.combining(c)).lower()

def tarjeta_para(tarea):
    """Elige la tarjeta por palabras del título y el prompt; None si no hay señal."""
    texto = _normalizar(_texto(tarea))
    for patron, ident in _PALABRAS:
        if patron.search(texto):
            return TARJETAS.get(ident)
    return None

def _pregunta():
    """Pregunta `choice` para Laya: una opción por habilidad, más «ninguna»."""
    criteria = {ident: t["cuando"] for ident, t in TARJETAS.items()}
    criteria[NINGUNA] = "Ninguna habilidad: escribir sin aplicar ninguna"
    return {"type": "choice", "criteria": criteria,
            "instructions": "¿Qué habilidad de ingeniería conviene aplicar a esta tarea?"}

def _leer_respuesta(respuesta, umbral=UMBRAL):
    """(decidió, tarjeta). Usa `answer_confidence` (calibrada), nunca `confidence`."""
    if not isinstance(respuesta, dict):
        return False, None
    answers = respuesta.get("answers")
    if isinstance(answers, dict):
        respuesta = answers.get("habilidad") or (
            next(iter(answers.values())) if len(answers) == 1 else None
        )
    if not isinstance(respuesta, dict):
        return False, None
    confianza = respuesta.get("answer_confidence")
    if isinstance(confianza, bool) or not isinstance(confianza, (int, float)):
        return False, None
    if not math.isfinite(confianza) or confianza < umbral:
        return False, None
    elegida = respuesta.get("choice")
    if elegida == NINGUNA:
        return True, None
    if elegida not in TARJETAS:
        return False, None
    return True, TARJETAS[elegida]

def _transporte_local(estado, preguntas, timeout):
    """POST real al Laya local; solo se usa si no se inyecta transporte (sin claves)."""
    url = os.environ.get("STARSEED_LAYA_URL", "http://127.0.0.1:4470/v1/systemone")
    cuerpo = json.dumps({"state": estado, "questions": preguntas}, ensure_ascii=False)
    peticion = urllib.request.Request(
        url, data=cuerpo.encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
        if respuesta.status != 200:
            return None
        return json.loads(respuesta.read().decode("utf-8"))

def _preguntar(tarea, consultar, plazo_s):
    texto = _texto(tarea)
    if not texto:
        return None
    transporte = consultar or TRANSPORTE or _transporte_local
    try:
        return transporte({"tarea": texto[:4000]}, {"habilidad": _pregunta()}, plazo_s)
    except Exception:
        return None

def elegir_con_laya(tarea, consultar=None, umbral=UMBRAL, plazo_s=PLAZO_S):
    """La tarjeta que decide Laya a tiempo y con confianza; si no, decide las palabras."""
    decidio, tarjeta = _leer_respuesta(_preguntar(tarea, consultar, plazo_s), umbral)
    return tarjeta if decidio else tarjeta_para(tarea)

def con_habilidad(prompt, tarea, consultar=None, umbral=UMBRAL, plazo_s=PLAZO_S):
    """Añade al final del prompt la tarjeta elegida, con su título y atribución."""
    tarjeta = elegir_con_laya(tarea, consultar=consultar, umbral=umbral, plazo_s=plazo_s)
    if not tarjeta:
        return prompt
    return "%s\n\n## %s\n\n%s\n" % (prompt, TITULO, tarjeta["tarjeta"])
