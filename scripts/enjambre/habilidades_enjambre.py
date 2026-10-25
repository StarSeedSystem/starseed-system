#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Habilidades de Matt Pocock para los escritores del enjambre (Ola 1018L · L)

Contrato: architecture/laya-y-habilidades.md §5 y §7 — cada escritor recibe AL FINAL la
TARJETA (≤ 60 palabras) de la habilidad de ingeniería que encaja, con el título «Cómo
trabajar (habilidad de Matt Pocock, MIT)». Si el servidor local de Laya responde en ≤ 3 s,
su «choice» calibrado (`answer_confidence`) decide en vez de las palabras; nunca
`confidence`. Módulo PURO (sin disco ni reloj); la única red, `preguntar_a_laya`, lleva el
transporte inyectable. MIT (Matt Pocock): vendor/habilidades/mattpocock-skills/LICENSE.
"""

import json
import urllib.request

ATRIBUCION = "Habilidades de ingeniería de Matt Pocock (github.com/mattpocock/skills), licencia MIT."
TITULO_BLOQUE = "Cómo trabajar (habilidad de Matt Pocock, MIT)"
URL_LAYA_DEFECTO = "http://127.0.0.1:4470/v1/systemone"
PLAZO_LAYA_S = 3.0  # contrato §2/§8: en CPU responde en ~3 s; a más de eso, palabras
UMBRAL_LAYA = 0.7  # en español baja (§2); por debajo de 0,7 decide la regla, no Laya
ESTADO_MAX = 4000  # ventana del checkpoint inglés: 512 tokens ≈ 2.000-4.000 caracteres


# id → nombre, cuándo aplica y tarjeta (≤ 60 palabras): copia fiel de src/ai/astraura/habilidades.
TARJETAS = {
    "tdd": dict(nombre="TDD · Desarrollo guiado por pruebas", cuando="Construir o arreglar escribiendo primero la prueba.",
        tarjeta="Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión."),
    "diagnosing-bugs": dict(nombre="Diagnóstico de fallos difíciles", cuando="Algo roto que lanza errores, falla o va lento.",
        tarjeta="Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>."),
    "codebase-design": dict(nombre="Diseño de módulos profundos", cuando="Diseñar o mejorar la interfaz de un módulo o una costura.",
        tarjeta="Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real."),
    "to-spec": dict(nombre="De la conversación a la especificación", cuando="Convertir lo ya discutido en una especificación publicada.",
        tarjeta="Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent."),
}
# Las cinco opciones del choice de Laya (contrato §4, fila «Habilidad que aplica»).
OPCIONES_LAYA = {**{i: d["cuando"] for i, d in TARJETAS.items()},
    "ninguna": "Ninguna habilidad aplica; trabaja sin tarjeta."}
PISTAS = (  # palabras del título/prompt → habilidad; el orden manda: «fallo con prueba» es TDD
    ("tdd", ("prueba", "tdd", "vitest", "pytest", "test")),
    ("diagnosing-bugs", ("error", "fallo", "falla", "arreglar", "diagnostica", "depura", "bug", "roto")),
    ("codebase-design", ("módulo", "modulo", "interfaz", "refactor")),
    ("to-spec", ("contrato", "especificación", "especificacion", "spec")),
)


def estado_de_tarea(t):
    """El estado que se le enseña a Laya: [id] título. prompt, dentro de la ventana."""
    if not isinstance(t, dict):
        t = {"id": "", "titulo": t, "prompt": ""}
    return ("[%s] %s. %s" % (t.get("id") or "", t.get("titulo") or "", t.get("prompt") or "")).strip()[:ESTADO_MAX]


def tarjeta_para(tarea):
    """El id de la tarjeta que encaja por PALABRAS del título/prompt, o None."""
    texto = estado_de_tarea(tarea).lower()
    llano = texto.translate(str.maketrans("óáéúí", "oaeui"))
    for id_, palabras in PISTAS:
        if any(palabra in llano or palabra in texto for palabra in palabras):
            return id_
    return None


def _respuesta_de_habilidad(respuesta):
    """La decisión «habilidad» de /v1/systemone (respuesta entera o suelta) o None."""
    if not isinstance(respuesta, dict):
        return None
    candidato = respuesta.get("answers")
    if isinstance(candidato, dict) and candidato:
        return candidato.get("habilidad") or next(
            (d for d in candidato.values() if isinstance(d, dict) and d.get("type") == "choice"), None)
    return respuesta if respuesta.get("type") == "choice" or respuesta.get("choice") else None


def elegir_con_laya(respuesta, tarea, umbral=None):
    """La decisión de Laya («choice» con «answer_confidence» al umbral) o las palabras.
    «ninguna» segura devuelve None; sin confianza, elección desconocida o dudosa, la regla.
    """
    tope = UMBRAL_LAYA if umbral is None else umbral
    por_palabras = tarjeta_para(tarea)
    decision = _respuesta_de_habilidad(respuesta)
    if not isinstance(decision, dict) or not decision.get("choice"):
        return por_palabras
    try:
        confianza = float(decision["answer_confidence"])
    except (KeyError, TypeError, ValueError):
        return por_palabras  # la calibrada es la que decide; «confidence» NO se usa
    eleccion = decision["choice"]
    if eleccion not in OPCIONES_LAYA or (eleccion not in TARJETAS and eleccion != "ninguna"):
        return por_palabras
    return None if (eleccion == "ninguna" and confianza >= tope) else por_palabras if confianza < tope else eleccion


def con_habilidad(prompt, tarea, respuesta_laya=None):
    """Añade la tarjeta elegida AL FINAL del prompt; sin tarjeta, lo devuelve intacto."""
    id_ = elegir_con_laya(respuesta_laya, tarea) if respuesta_laya is not None else tarjeta_para(tarea)
    datos = TARJETAS.get(id_) if id_ else None
    if not datos:
        return prompt or ""
    bloque = "%s: %s — %s\n(%s)" % (TITULO_BLOQUE, datos["nombre"], datos["tarjeta"], ATRIBUCION)
    return "%s\n\n%s" % ((prompt or "").rstrip(), bloque)


def preguntar_a_laya(tarea, url=None, plazo=PLAZO_LAYA_S, abrir=None):
    """UNA pregunta choice al servidor local de Laya (formato de `jev.py`) o None si no
    responde a plazo; `abrir` (por defecto urllib.request.urlopen) queda inyectable."""
    cuerpo = {"state": estado_de_tarea(tarea), "questions": {"habilidad": {
        "type": "choice",
        "instructions": "¿Qué habilidad de ingeniería conviene seguir en esta tarea? Si ninguna encaja, elige «ninguna».",
        "criteria": OPCIONES_LAYA,
    }}}
    peticion = urllib.request.Request(
        url or URL_LAYA_DEFECTO, method="POST",
        data=json.dumps(cuerpo, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with (abrir or urllib.request.urlopen)(peticion, timeout=plazo) as respuesta:
            datos = json.loads(respuesta.read().decode("utf-8"))
    except Exception:
        return None  # sin Laya (caída o lenta al plazo): decide la regla de palabras
    return datos if isinstance(datos, dict) else None