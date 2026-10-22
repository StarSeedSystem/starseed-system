# -*- coding: utf-8 -*-
"""Decisiones PURAS del carril de alta capacidad (Ola 1021A, ALT1021C).

`memory/orquestacion-economica.md` §0: las tareas muy complicadas (diseño fino, contratos
delicados, ≥3 archivos, dificultad alta o escalera agotada) pueden ir a agentes potentes si hay
cupo. El CLI `alta-capacidad.py` solo lee y pinta; sin disco, red ni reloj: todo entra por fuera.
"""
from __future__ import annotations

import limites_claude as L

SEMANA_MAX = 80.0
SESION_MAX = 70.0
MAX_EN_MARCHA = 2
ABIERTOS = frozenset({
    "pendiente", "fallo", "fallo_tsc", "fallo_tests", "fallo_motor", "sin_cambios",
    "conflicto", "interrumpida", "bloqueante", "bloqueada",
})
_ALTAS = frozenset({"alta", "muy alta", "máxima", "maxima", "crítica", "critica"})

def archivos(tarea):
    a = (tarea or {}).get("archivos") or []
    return 1 if isinstance(a, str) else len(a)

def intentos(tarea, entrada=None):
    for d in (entrada or {}, tarea or {}):
        if not isinstance(d, dict) or "intentos_auto" not in d:
            continue
        try:
            return max(0, int(d.get("intentos_auto") or 0))
        except (TypeError, ValueError):
            continue
    return 0

def necesita(tarea, entrada=None):
    """(bool, motivo): marca explícita, dificultad, ≥3 archivos o escalera agotada."""
    t = tarea if isinstance(tarea, dict) else {}
    motivos = []
    if t.get("alta_capacidad"):
        motivos.append("marcada alta_capacidad")
    if str(t.get("dificultad") or "").strip().lower() in _ALTAS:
        motivos.append("dificultad alta")
    if str(t.get("capacidad") or "").strip().lower() in _ALTAS:
        motivos.append("capacidad alta")
    n = archivos(t)
    if n >= 3:
        motivos.append("%d archivos" % n)
    fallos = intentos(t, entrada)
    if fallos >= 2:
        motivos.append("%d intentos fallidos" % fallos)
    if t.get("modelos_fallidos") or (entrada or {}).get("modelos_fallidos"):
        motivos.append("ya falló con otros modelos")
    return bool(motivos), "; ".join(motivos)

def cupo(limites, ahora, en_marcha=0, max_en_marcha=MAX_EN_MARCHA,
         semana_max=SEMANA_MAX, sesion_max=SESION_MAX):
    """{ok, motivo}. Honesto: sin lectura reciente no se lanza a ciegas."""
    marcha = max(0, int(en_marcha or 0))
    if not isinstance(limites, dict) or not limites.get("lecturas"):
        return {"ok": False, "motivo": "no hay lectura de los límites de Claude"}
    try:
        estado = L.estado(limites, ahora)
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "motivo": "la lectura de límites no se entiende"}
    semana = (estado.get("semana") or {}).get("pct")
    sesion = (estado.get("sesion") or {}).get("pct")
    if semana is None or sesion is None:
        return {"ok": False, "motivo": "la última lectura no trae semana y sesión"}
    if estado.get("desactualizada"):
        return {"ok": False, "motivo": "la última lectura está vieja (más de 120 min)"}
    if semana >= semana_max:
        return {"ok": False, "motivo": "la semana va al %.0f %% (tope %.0f %%)" % (semana, semana_max)}
    if sesion >= sesion_max:
        return {"ok": False, "motivo": "la sesión va al %.0f %% (tope %.0f %%)" % (sesion, sesion_max)}
    if marcha >= max_en_marcha:
        return {"ok": False, "motivo": "ya hay %d agentes de alta capacidad en marcha (tope %d)" % (
            marcha, max_en_marcha)}
    return {"ok": True, "motivo": "semana %.0f %% (tope %.0f %%), sesión %.0f %% (tope %.0f %%), %d/%d en marcha" % (
        semana, semana_max, sesion, sesion_max, marcha, max_en_marcha)}

def candidatas(tareas, progreso, ids_fuente=None):
    """Tareas abiertas que necesitan el carril, en orden: marca, dificultad, archivos, fallos."""
    progreso = progreso if isinstance(progreso, dict) else {}
    filas = []
    for pos, (tid, t) in enumerate((tareas or {}).items()):
        tid = str(tid)
        if ids_fuente is not None and tid not in ids_fuente:
            continue
        t = t if isinstance(t, dict) else {}
        entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        estado = str(entrada.get("estado") or t.get("estado") or "pendiente")
        if estado not in ABIERTOS:
            continue
        vale, motivo = necesita(t, entrada)
        if not vale:
            continue
        n = intentos(t, entrada)
        clave = (0 if t.get("alta_capacidad") else 1,
                 0 if (str(t.get("dificultad") or "").strip().lower() in _ALTAS
                       or str(t.get("capacidad") or "").strip().lower() in _ALTAS) else 1,
                 0 if archivos(t) >= 3 else 1, -n, pos)
        filas.append((clave, {"id": tid, "titulo": str(t.get("titulo") or t.get("title") or ""),
                              "estado": estado, "intentos": n, "motivo": motivo,
                              "archivos": archivos(t)}))
    filas.sort(key=lambda f: f[0])
    return [c for _, c in filas]


def elegir(cands, ok, en_marcha=0, max_en_marcha=MAX_EN_MARCHA):
    """Ids de las candidatas que caben ahora (tope de agentes en marcha)."""
    if not ok:
        return []
    huecos = max(0, int(max_en_marcha) - max(0, int(en_marcha or 0)))
    return [c["id"] for c in (cands or [])[:huecos]]


def informe(limites, tareas, progreso, ahora, en_marcha=0, ids_fuente=None):
    c = cupo(limites, ahora, en_marcha)
    cands = candidatas(tareas, progreso, ids_fuente)
    return {"cupo": c, "candidatas": cands, "elegidas": elegir(cands, c["ok"], en_marcha)}
