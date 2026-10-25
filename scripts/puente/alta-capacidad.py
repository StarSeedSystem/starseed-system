#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad: candidatas y cupo de Claude para la dirección. Solo lee.

Uso: alta-capacidad.py [--en-marcha N] [--json] [--olas DIR] [--progreso F] [--limites F]

La lógica pura vive en `alta_capacidad_logica.py` (necesita_alta · cupo_claude · elegir);
aquí solo se lee disco (progreso, colas fuente del puente y límites de Claude) y se imprime.
No toca `progreso.json` ni lanza agentes.

Variables de entorno: STARSEED_ROOT, STARSEED_OLAS, STARSEED_PROGRESO
y STARSEED_LIMITES_CLAUDE (la lee limites_claude).
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

import asignar_huecos  # noqa: E402  (su `_colas_fuente` es el cargador de colas del puente)
import alta_capacidad_logica as logica  # noqa: E402
import limites_claude  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(AQUI))
OLAS = os.environ.get("STARSEED_OLAS") or os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.environ.get("STARSEED_PROGRESO") or os.path.join(OLAS, "progreso.json")

# Estados que no demandan el carril aunque la tarea pida capacidad alta.
CERRADAS = {"commit", "hecho", "rechazada", "esperando_aprobacion", "pendiente_aprobacion", "informe"}
# Estados desde los que se puede relanzar en el carril; las bloqueadas las juzga el revisor.
REINTENTABLES = {"pendiente", "fallo", "fallo_tests", "fallo_timeout", "sin_cambios", "interrumpida"}


def _leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError):
        return {}


def _intentos(tarea, entrada):
    def n(valor):
        try:
            return int(valor or 0)
        except (TypeError, ValueError):
            return 0
    return max(n(tarea.get("intentos_auto")), n(entrada.get("intentos_auto")))


def _dependencias_ok(tarea, progreso):
    """Una candidata solo se elige si lo que depende ya está en el repo."""
    deps = tarea.get("depende") or []
    deps = [deps] if isinstance(deps, str) else deps
    return all(
        (progreso.get(str(d)) or {}).get("estado") in ("commit", "hecho", "integrada")
        for d in deps
    )


def candidatas(progreso, colas):
    """Devuelve (filas, elegibles): lo que se lista y lo que `elegir` puede ordenar.

    Una tarea entra si `alta_capacidad_logica.necesita_alta` la pide y su estado no
    está cerrado; solo las reintenables con dependencias integradas pasan a elegibles.
    """
    progreso = progreso if isinstance(progreso, dict) else {}
    filas, elegibles, vistas = [], [], set()
    for nombre, tareas in colas or []:
        for tarea in tareas or []:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
            estado = str(entrada.get("estado") or "pendiente")
            if estado in CERRADAS or estado == "en_curso":
                continue
            if not logica.necesita_alta(tarea, entrada):
                continue
            filas.append({
                "id": tid, "titulo": str(tarea.get("titulo") or ""),
                "estado": estado, "intentos": _intentos(tarea, entrada),
            })
            if estado in REINTENTABLES and _dependencias_ok(tarea, progreso):
                elegibles.append({**tarea, "id": tid})
    return filas, elegibles


def resumen(progreso, colas, limites, en_marcha=0, ahora=None):
    """PURA. Devuelve {cupo:{ok,motivo}, candidatas:[…], elegidas:[…]} sin tocar disco."""
    ahora = ahora or datetime.now().astimezone()
    lecturas = limites.get("lecturas") if isinstance(limites, dict) else []
    ok, motivo = logica.cupo_claude(list(lecturas or []), ahora)
    filas, elegibles = candidatas(progreso, colas)
    elegidas = [str(c["id"]) for c in logica.elegir(elegibles, max(0, en_marcha))] if ok else []
    return {"cupo": {"ok": ok, "motivo": motivo}, "candidatas": filas, "elegidas": elegidas}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Carril de alta capacidad (lista y cupo).")
    parser.add_argument("--olas")
    parser.add_argument("--progreso")
    parser.add_argument("--limites")
    parser.add_argument("--en-marcha", type=int, default=0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    olas = args.olas or OLAS
    progreso = args.progreso or os.path.join(olas, "progreso.json")
    if args.limites:
        limites_claude.ARCHIVO = os.path.expanduser(args.limites)
    asignar_huecos.OLAS = olas
    datos = resumen(
        _leer_json(progreso), asignar_huecos._colas_fuente(),
        limites_claude.leer(), args.en_marcha,
    )
    cupo = datos["cupo"]
    if args.json:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
    else:
        print("Cupo de Claude: %s · %s" % ("sí" if cupo["ok"] else "no", cupo["motivo"]))
        for c in datos["candidatas"]:
            print("%s · %s · %s · %s intento(s)" % (c["id"], c["titulo"], c["estado"], c["intentos"]))
        print("Elegidas ahora (%d en marcha): %s" % (
            max(0, args.en_marcha),
            ", ".join(datos["elegidas"]) or "ninguna",
        ))
    return 0



if __name__ == "__main__":
    sys.exit(main())
