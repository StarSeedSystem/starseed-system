#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad: qué tareas lo necesitan y si hay cupo de Claude (Ola 1021A).

  python3 scripts/puente/alta-capacidad.py [--en-marcha N] [--json]

Lee `starseed_memory_root/olas/progreso.json`, las colas con el MISMO cargador que usa
`revisor_bloqueadas.py` y `limites_claude.leer()`. Solo lee: no toca progreso.json, no lanza
agentes y no gasta créditos. `--en-marcha` son los agentes de alta capacidad trabajando ahora
(por defecto 0); el tope de la casa es 2 (memory/orquestacion-economica.md §0).

Rutas inyectables, como los demás scripts del puente: `STARSEED_ROOT`, `STARSEED_OLAS`,
`STARSEED_PROGRESO`, `STARSEED_LIMITES_CLAUDE`, o `--olas/--progreso/--limites`.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import alta_capacidad_logica as logica  # noqa: E402
import limites_claude  # noqa: E402
import revisor_bloqueadas as revisor  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as archivo:
            return json.load(archivo)
    except (OSError, ValueError, TypeError):
        return defecto


def _rutas(args):
    olas = args.olas or os.environ.get("STARSEED_OLAS") or os.path.join(
        RAIZ, "starseed_memory_root", "olas")
    progreso = args.progreso or os.environ.get("STARSEED_PROGRESO") or os.path.join(olas, "progreso.json")
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(olas))
    return raiz, olas, progreso


def foto(raiz, olas, progreso):
    """Las tareas de las colas, con el cargador del revisor (fuente antes que cola-auto)."""
    revisor.RAIZ = raiz
    revisor.OLAS = olas
    revisor.PROGRESO = progreso
    revisor.CORRECCIONES = os.path.join(olas, "progreso-correcciones.json")
    revisor.EVENTOS = os.path.join(olas, "eventos.jsonl")
    revisor.ESTADO = os.path.join(olas, "revisor-bloqueadas.json")
    return revisor.reunir()


def ids_fuente(colas):
    ids = set()
    for nombre, tareas in (colas or {}).items():
        if str(nombre).startswith("cola-auto-"):
            continue
        ids.update(str(t) for t in (tareas or []))
    return ids or None


def leer_limites(ruta=None):
    if ruta:
        limites_claude.ARCHIVO = ruta
    return limites_claude.leer()


def ahora():
    return datetime.now().astimezone()


def imprimir_texto(inf):
    c = inf["cupo"]
    print("Cupo de Claude: %s · %s" % ("sí" if c["ok"] else "no", c["motivo"]))
    print("Candidatas: %d" % len(inf["candidatas"]))
    for cand in inf["candidatas"]:
        print("  %s · %s · %s · %d intento(s) · %s" % (
            cand["id"], cand["titulo"], cand["estado"], cand["intentos"], cand["motivo"]))
    print("Elegidas ahora: %s" % (", ".join(inf["elegidas"]) or "ninguna"))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Carril de alta capacidad: candidatas y cupo.")
    parser.add_argument("--json", action="store_true", help="salida como objeto JSON")
    parser.add_argument("--en-marcha", type=int, default=0, help="agentes de alta capacidad en marcha")
    parser.add_argument("--olas", help="carpeta de colas (starseed_memory_root/olas)")
    parser.add_argument("--progreso", help="ruta de progreso.json")
    parser.add_argument("--limites", help="ruta de limites-claude.json")
    args = parser.parse_args(argv)
    raiz, olas, progreso = _rutas(args)
    datos = foto(raiz, olas, progreso)
    tareas = datos.get("tareas") if isinstance(datos, dict) else {}
    inf = logica.informe(leer_limites(args.limites), tareas, _leer_json(progreso, {}),
                         ahora(), max(0, args.en_marcha), ids_fuente(datos.get("colas")))
    if args.json:
        print(json.dumps(inf, ensure_ascii=False, indent=2))
    else:
        imprimir_texto(inf)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
