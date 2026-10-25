#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad: candidatas y cupo de Claude. Solo lee; no lanza agentes.

Uso: alta-capacidad.py [--en-marcha N] [--json] [--raiz R] [--olas D]
                       [--progreso F] [--limites F]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import asignar_huecos  # noqa: E402  (_colas_fuente ya es el cargador de colas del puente)
import limites_claude  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(AQUI))
OLAS = os.environ.get("STARSEED_OLAS") or os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.environ.get("STARSEED_PROGRESO") or os.path.join(OLAS, "progreso.json")

TOPE_OPUS = 2
TOPE_SESION = 70.0
TOPE_SEMANA = 80.0
CERRADAS = {
    "commit", "hecho", "integrada", "sustituida", "rechazada", "bloqueante",
    "esperando_aprobacion", "pendiente_aprobacion", "informe",
}
REINTENTABLES = {
    "pendiente", "fallo", "fallo_tests", "fallo_timeout", "sin_cambios", "interrumpida",
}


def _leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _n(valor):
    try:
        return int(valor or 0)
    except (TypeError, ValueError):
        return 0


def _intentos(tarea, entrada):
    return max(_n(tarea.get("intentos_auto")), _n(entrada.get("intentos_auto")))


def _archivos(tarea):
    archivos = tarea.get("archivos") or []
    return 1 if isinstance(archivos, str) else len(archivos)


def _cupo(limites, en_marcha, ahora):
    """(ok, motivo): semana < 80 %, sesión < 70 % y como mucho 2 Opus a la vez."""
    try:
        estado = limites_claude.estado(limites if isinstance(limites, dict) else {}, ahora)
    except (TypeError, ValueError):
        return False, "no se pudo interpretar la lectura de límites de Claude"
    sesion = (estado.get("sesion") or {}).get("pct")
    semana = (estado.get("semana") or {}).get("pct")
    if sesion is None or semana is None:
        return False, "sin lectura de los límites de Claude (anótala con limites_claude.py declarar)"
    if estado.get("desactualizada"):
        return False, "lectura desactualizada (%s min)" % estado.get("lectura_hace_min")
    if sesion >= TOPE_SESION:
        return False, "sesión al %.0f %% (tope %.0f %%)" % (sesion, TOPE_SESION)
    if semana >= TOPE_SEMANA:
        return False, "semana al %.0f %% (tope %.0f %%)" % (semana, TOPE_SEMANA)
    huecos = TOPE_OPUS - max(0, en_marcha)
    if huecos <= 0:
        return False, "ya hay %d Opus en marcha (tope %d)" % (en_marcha, TOPE_OPUS)
    return True, "semana %.0f %% · sesión %.0f %% · caben %d" % (semana, sesion, huecos)


def _motivos(tarea, entrada):
    """Por qué esta tarea pide el carril de alta capacidad."""
    motivos = ["marcada alta_capacidad"] if tarea.get("alta_capacidad") else []
    for campo, etiqueta in (
        ("capacidad", "capacidad alta"),
        ("importancia", "importancia capacidad"),
        ("dificultad", "dificultad alta"),
    ):
        if str(tarea.get(campo) or "").lower() in ("alta", "capacidad"):
            motivos.append(etiqueta)
    if _archivos(tarea) >= 3:
        motivos.append("%d archivos" % _archivos(tarea))
    if _intentos(tarea, entrada) >= 2 or tarea.get("modelos_fallidos") or entrada.get("modelos_fallidos"):
        motivos.append("ya falló con otros modelos")
    return motivos


def _dependencias_ok(tarea, progreso):
    deps = tarea.get("depende") or []
    deps = [deps] if isinstance(deps, str) else deps
    return all(
        (progreso.get(str(d)) or {}).get("estado") in ("commit", "hecho", "integrada")
        for d in deps
    )


def alta_capacidad_logica(progreso, colas, limites, en_marcha=0, ahora=None):
    """PURA. Devuelve {cupo:{ok,motivo}, candidatas:[…], elegidas:[…]} sin tocar disco."""
    ahora = ahora or datetime.now().astimezone()
    progreso = progreso if isinstance(progreso, dict) else {}
    en_marcha = max(0, _n(en_marcha))
    ok, motivo = _cupo(limites, en_marcha, ahora)
    filas, vistas = [], set()
    for nombre, tareas in colas or []:
        for pos, tarea in enumerate(tareas or []):
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
            estado = str(entrada.get("estado") or "pendiente")
            motivos = _motivos(tarea, entrada)
            if not motivos or estado in CERRADAS:
                continue
            filas.append(({
                "id": tid,
                "titulo": str(tarea.get("titulo") or ""),
                "estado": estado,
                "intentos": _intentos(tarea, entrada),
                "cola": nombre,
                "archivos": _archivos(tarea),
                "motivo": " · ".join(motivos),
                "pos": pos,
            }, tarea, entrada))
    filas.sort(key=lambda f: (
        0 if f[1].get("alta_capacidad") else 1,
        0 if _archivos(f[1]) >= 3 else 1,
        0 if _intentos(f[1], f[2]) >= 2 else 1,
        f[0]["pos"],
    ))
    huecos = max(0, TOPE_OPUS - en_marcha) if ok else 0
    elegidas = [
        c["id"] for c, tarea, _ in filas
        if c["estado"] in REINTENTABLES and _dependencias_ok(tarea, progreso)
    ][:huecos]
    return {
        "cupo": {"ok": ok, "motivo": motivo},
        "candidatas": [c for c, _, _ in filas],
        "elegidas": elegidas,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raiz")
    parser.add_argument("--olas")
    parser.add_argument("--progreso")
    parser.add_argument("--limites")
    parser.add_argument("--en-marcha", type=int, default=0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    olas = args.olas or os.path.join(args.raiz or RAIZ, "starseed_memory_root", "olas")
    progreso = args.progreso or (
        os.path.join(olas, "progreso.json") if (args.raiz or args.olas) else PROGRESO
    )
    if args.limites:
        limites_claude.ARCHIVO = args.limites
    asignar_huecos.OLAS = olas
    datos = alta_capacidad_logica(
        _leer_json(progreso), asignar_huecos._colas_fuente(),
        limites_claude.leer(), args.en_marcha,
    )
    if args.json:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return 0
    cupo = datos["cupo"]
    print("Cupo de Claude: %s · %s" % ("sí" if cupo["ok"] else "no", cupo["motivo"]))
    for candidata in datos["candidatas"]:
        print("  %s · %s · %s · %d intento(s) · %s" % (
            candidata["id"], candidata["titulo"], candidata["estado"],
            candidata["intentos"], candidata["motivo"],
        ))
    print("Elegidas ahora (%d en marcha): %s" % (
        args.en_marcha, ", ".join(datos["elegidas"]) or "ninguna",
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
