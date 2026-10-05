# -*- coding: utf-8 -*-
"""produccion_panel · panel de respaldo de la puerta 3 (§9, patrón CrewAI).

Cuando Jev no responde, decide un equipo de cuatro roles, cada uno con un modelo
gratuito DISTINTO de la flota: lanzamiento (propósito y coherencia), QA (pruebas y
regresión), seguridad (secretos, datos y permisos — con veto) y SRE (medios y
reversión). Una sola pregunta tipada (publicar sí/no, motivo de una línea) sobre el
paquete de contexto de la candidata.

Mayoría de los que respondan (mínimo 3); si seguridad dice no, no se publica.
Tiempo máximo total: 60 s; un rol que no responde no cuenta. Sin dependencias
nuevas: las funciones son PURAS excepto la selección por `optimizador_panel` (que se
importa de forma perezosa y tiene alternativa en Python puro).
"""

from __future__ import annotations

import json
import time

TIEMPO_MAX_S = 60
MIN_RESPUESTAS = 3

#: Flota gratuita de respaldo (ids `:free` de OpenRouter) si no hay lista útil.
FLOTA_RESPALDO = (
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "qwen/qwen3-32b:free",
)

#: Los cuatro roles con su instrucción breve (§9).
ROLES = {
    "lanzamiento": (
        "Eres el responsable de lanzamiento. Juzga el propósito declarado de la "
        "candidata y su coherencia con StarSeed OS."
    ),
    "qa": (
        "Eres QA. Juzga si las pruebas cubren el cambio y el riesgo de regresión "
        "en producción."
    ),
    "seguridad": (
        "Eres seguridad. Juzga secretos, datos y permisos. Tu «no» veta la "
        "publicación."
    ),
    "sre": (
        "Eres SRE. Juzga en qué medios se usa el cambio y si la reversión está "
        "asegurada."
    ),
}

ROL_SEGURIDAD = "seguridad"


def elegir_modelos_roles(utiles=None, pesos=None, azar=None):
    """Un modelo distinto por rol. Si existe `optimizador_panel`, reutiliza su
    `elegir_panel` (autoenrutado por pesos); si no, los primeros de la lista
    útil o de la flota de respaldo. PURA."""
    lista = [m for m in (utiles or []) if isinstance(m, str) and m] or list(FLOTA_RESPALDO)
    n = len(ROLES)
    elegidos = None
    try:
        import optimizador_panel as op  # importación perezosa y opcional
        elegidos = op.elegir_panel(pesos or {}, lista, k=n, azar=azar)
    except Exception:
        elegidos = None
    if not elegidos or len(elegidos) < n:
        base = list(elegidos or [])
        for m in lista + list(FLOTA_RESPALDO):
            if len(base) >= n:
                break
            if m not in base:
                base.append(m)
        elegidos = base[:n]
    return {rol: elegidos[i] for i, rol in enumerate(ROLES)}


def _resumen_candidata(candidata, max_chars=6000):
    """El paquete de contexto de la candidata como texto acotado. PURA."""
    if isinstance(candidata, str):
        texto = candidata
    else:
        try:
            texto = json.dumps(candidata or {}, ensure_ascii=False, indent=1)
        except (TypeError, ValueError):
            texto = str(candidata)
    return texto if len(texto) <= max_chars else texto[:max_chars] + "…"


def pregunta_rol(rol, candidata):
    """La única pregunta tipada del rol sobre el paquete: publicar sí/no con un
    motivo de una línea, en JSON. PURA."""
    instruccion = ROLES[rol]
    return (
        instruccion + "\n\nCon este paquete de contexto de una candidata a "
        "publicación, responde SOLO con un JSON: "
        '{"publicar": true|false, "motivo": "<una línea>"}.\n\nPaquete:\n'
        + _resumen_candidata(candidata)
    )


def interpretar_voto(texto):
    """El texto del modelo → {"publicar": bool, "motivo": str} o None. PURA."""
    if not isinstance(texto, str) or "{" not in texto:
        return None
    principio = texto.find("{")
    fin = texto.rfind("}")
    if fin <= principio:
        return None
    try:
        datos = json.loads(texto[principio:fin + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(datos, dict) or not isinstance(datos.get("publicar"), bool):
        return None
    return {"publicar": datos["publicar"],
            "motivo": str(datos.get("motivo") or "").strip()[:200]}


def decidir_panel(candidata, llamar=None, modelos_roles=None, utiles=None,
                  pesos=None, azar=None, tiempo_max=TIEMPO_MAX_S, reloj=None):
    """El panel decide por mayoría (mínimo MIN_RESPUESTAS respuestas) y el veto
    de seguridad. Devuelve {publicar, votos, motivos}: `votos` y `motivos` van
    por rol e incluyen solo a quienes respondieron a tiempo.

    `llamar(modelo, prompt) -> texto` es inyectable; sin `llamar` (o sin
    respuestas suficientes) `publicar` es False: el silencio no es aprobación.
    """
    reloj = reloj or time.monotonic
    inicio = reloj()
    asignacion = modelos_roles or elegir_modelos_roles(utiles, pesos, azar)
    votos = {}
    motivos = {}
    if llamar is not None:
        for rol, modelo in asignacion.items():
            if reloj() - inicio >= float(tiempo_max):
                break  # un rol que no responde a tiempo no cuenta
            try:
                texto = llamar(modelo, pregunta_rol(rol, candidata))
            except Exception:
                continue
            voto = interpretar_voto(texto)
            if voto is None:
                continue
            votos[rol] = voto["publicar"]
            motivos[rol] = voto["motivo"]
    return {"publicar": _veredicto(votos), "votos": votos, "motivos": motivos}


def _veredicto(votos):
    """Mayoría de los que respondieron (mínimo 3), con veto de seguridad. PURA."""
    if len(votos) < MIN_RESPUESTAS:
        return False
    if votos.get(ROL_SEGURIDAD) is False:
        return False
    return sum(1 for v in votos.values() if v) > len(votos) / 2
