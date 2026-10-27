#!/usr/bin/env python3
"""Habilidades para los escritores del enjambre (Ola 1018L · L).

Cada encargo añade al FINAL la TARJETA (≤ 60 palabras) de la habilidad de Matt Pocock que encaja
(las de src/ai/astraura/habilidades que alcanza el emparejamiento; contrato:
architecture/laya-y-habilidades.md §5). Primero decide Laya —choice con umbral sobre
`answer_confidence`, la CALIBRADA— y, si no responde en ≤ 3 s o duda, las palabras.
Módulo PURO: red (pedir), reloj (ahora) y respuesta de Laya inyectados; pruebas sin red. MIT.
"""

import json
import os
import re
import time
import unicodedata
import urllib.request
from typing import Callable, Mapping

MAX_PALABRAS_TARJETA = 60        # la tarjeta va a los modelos pequeños: no crece
UMBRAL_CONF = 0.8                # la calibrada baja en español (contrato §2): si duda, palabras
PLAZO_LAYA = 3.0                 # Laya en CPU tarda segundos (§2/§8): si pasa el plazo, palabras
LAYA_URL_DEFECTO = "http://127.0.0.1:4470/v1/systemone"
TRUNCADO = 2_000                 # ventanas del checkpoint inglés (512 tokens)
TITULO_BLOQUE = "Cómo trabajar (habilidad de Matt Pocock, MIT)"
ATRIBUCION = "Habilidades de ingeniería de Matt Pocock (github.com/mattpocock/skills), licencia MIT."

# Las cuatro tarjetas que este emparejamiento alcanza (id → nombre, tarjeta), copia fiel de ingenieria-a/-b.ts.
HABILIDADES: Mapping[str, tuple[str, str]] = {
    "tdd": ("TDD · Desarrollo guiado por pruebas", "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión."),
    "diagnosing-bugs": ("Diagnóstico de fallos difíciles", "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>."),
    "codebase-design": ("Diseño de módulos profundos", "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real."),
    "to-spec": ("De la conversación a la especificación", "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent."),
}

#: Parejas en orden determinista: palabra (sin acentos) → habilidad.
PALABRAS_HABILIDAD: tuple[tuple[str, str], ...] = (
    ("prueba", "tdd"), ("tdd", "tdd"), ("error", "diagnosing-bugs"),
    ("fallo", "diagnosing-bugs"), ("arreglar", "diagnosing-bugs"),
    ("modulo", "codebase-design"), ("interfaz", "codebase-design"), ("refactor", "codebase-design"),
    ("contrato", "to-spec"), ("especificacion", "to-spec"),
)


def palabras_de(texto: str) -> "list[str]":
    """Minúsculas y sin acentos: «modulo» y «especificacion» cuentan igual."""
    return [p for p in re.split(r"\W+", unicodedata.normalize(
        "NFKD", (texto or "").lower()).encode("ascii", "ignore").decode()) if p]


def tarjeta_para(tarea: "dict | str") -> "str | None":
    """Elige por palabras del título y del prompt (dict de la cola o texto).
    Devuelve el id —la tarjeta vive en `HABILIDADES`— o None si no aplica."""
    texto = tarea if isinstance(tarea, str) else "%s %s" % (
        (tarea or {}).get("titulo", ""), (tarea or {}).get("prompt", ""))
    for buscada, id_h in PALABRAS_HABILIDAD:
        if any(p.startswith(buscada) for p in palabras_de(texto)):
            return id_h
    return None


def estado_laya(prompt: str, tarea: "dict | str") -> str:
    """El estado que Laya lee: título + encargo, acotado a la ventana del checkpoint."""
    titulo = "" if isinstance(tarea, str) else str((tarea or {}).get("titulo", ""))
    return (titulo + "\n" + (prompt or "")).strip()[:TRUNCADO]

def preguntas_laya() -> "dict[str, dict]":
    """UNA pregunta `choice` entre las habilidades y «ninguna» (contrato §4)."""
    criterios = dict((i, n) for i, (n, _t) in HABILIDADES.items()) | {"ninguna": "Ninguna habilidad de ingeniería aplica"}
    return {"habilidad": {"type": "choice", "instructions":
            "Da igual lo largo del encargo: ¿qué habilidad de trabajo aplicar en esta tarea?",
            "criteria": criterios}}


def pedir_laya(estado: str, preguntas: "dict", timeout: float = PLAZO_LAYA, url: "str | None" = None) -> "dict | None":
    """El ÚNICO punto con red: POST al servidor local de Laya (formato de `jev.py`,
    /v1/systemone). Devuelve `answers` o None: se seca sola, sin insistir."""
    endpoint = url or os.environ.get("STARSEED_LAYA_URL") or LAYA_URL_DEFECTO
    try:
        req = urllib.request.Request(endpoint, data=json.dumps(
            {"state": estado, "questions": preguntas}, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as respuesta:
            datos = json.loads(respuesta.read().decode("utf-8")) if respuesta.status == 200 else {}
            if isinstance(datos, dict) and isinstance(datos.get("answers"), dict):
                return datos["answers"]
        return None
    except Exception:
        return None


def elegir_de_respuesta(respuestas: "Mapping[str, dict] | None", umbral: float = UMBRAL_CONF, clave="habilidad") -> "str | None":
    """Pura sobre la forma real de Laya (choice/probabilities/answer_confidence, score,
    noul): manda `answer_confidence`, la CALIBRADA; `confidence` NO decide (§1). «ninguna» → None."""
    r = (respuestas or {}).get(clave) or {}
    confianza = r.get("answer_confidence") if isinstance(r, dict) else None
    if not isinstance(confianza, (int, float)) or isinstance(confianza, bool) or confianza < umbral:
        return None
    elegida = r.get("choice")
    return elegida if isinstance(elegida, str) and elegida in HABILIDADES else None


def elegir_con_laya(prompt: str, tarea: "dict | str", pedir: "Callable | None" = pedir_laya,
                    ahora: "Callable[[], float]" = time.monotonic, umbral: float = UMBRAL_CONF) -> "str | None":
    """«Si Laya local responde en ≤ 3 s, decide en vez de las palabras» (§5).
    Llamada y reloj inyectados; None = no llega, duda o dice «ninguna»."""
    if pedir is None:
        return None
    t0 = ahora()
    try:
        respuestas = pedir(estado_laya(prompt, tarea), preguntas_laya(), timeout=PLAZO_LAYA)
    except Exception:
        respuestas = None
    if respuestas is None or (ahora() - t0) > PLAZO_LAYA:
        return None
    return elegir_de_respuesta(respuestas, umbral=umbral)


def con_habilidad(prompt: str, tarea: "dict | str", pedir: "Callable | None" = pedir_laya,
                  ahora: "Callable[[], float]" = time.monotonic, umbral: float = UMBRAL_CONF) -> str:
    """Añade al FINAL la tarjeta de la habilidad que aplique bajo el título del bloque:
    decide Laya y, si calla, las palabras. Sin tarjeta («ninguna» incluida) queda EXACTO."""
    encargo = (prompt or "").rstrip()
    id_h = elegir_con_laya(encargo, tarea, pedir=pedir, ahora=ahora, umbral=umbral) or tarjeta_para(tarea)
    habilidad = HABILIDADES.get(id_h) if isinstance(id_h, str) else None
    if not habilidad:
        return encargo
    bloque = "%s · %s\n%s\n(%s)" % (TITULO_BLOQUE, habilidad[0], habilidad[1], ATRIBUCION)
    return encargo + "\n\n" + bloque if encargo else bloque

