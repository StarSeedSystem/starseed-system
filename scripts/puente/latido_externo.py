#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Latidos de agentes EXTERNOS en el Puente de Mando (2026-09-25).

Alex: «tus agentes, incluso los que uses con Claude Opus 5.5 para tareas que lo requieran
—como lo que estás haciendo— deben aparecer en los agentes y tareas del Puente de Mando».

El Mando ya pinta los agentes del enjambre leyendo `starseed_memory_root/olas/latidos-*.json`
(los escribe el orquestador cada 20 s). Este script escribe lo mismo para quien NO es el
orquestador: Claude en Cowork, sus subagentes, Hermes… Cada tarea dice hasta cuándo sigue
viva (`hasta`), así que no hace falta latir cada 20 s: basta con avisar al empezar, al
cambiar de fase y al terminar.

Uso:
  latido_externo.py empezar <id> "<título>" [--modelo anthropic/claude-opus-5.5]
                    [--proveedor anthropic] [--donde cowork] [--medio claude] [--fase escribiendo]
                    [--minutos 45] [--agente cowork]
  latido_externo.py fase <id> <fase> [--minutos 45] [--agente cowork]
  latido_externo.py terminar <id> [--agente cowork]
  latido_externo.py lista [--agente cowork]

Escribe `latidos-externo-<agente>.json` (el Mando acepta estos archivos hasta 45 min sin
tocar y descarta cada tarea al pasar su `hasta`). Nunca guarda claves ni texto de prompts.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR_OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")


def ruta(agente: str) -> str:
    limpio = re.sub(r"[^a-z0-9-]", "-", agente.lower()).strip("-") or "externo"
    return os.path.join(DIR_OLAS, f"latidos-externo-{limpio}.json")


def leer(agente: str) -> dict:
    try:
        with open(ruta(agente), encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("tareas"), dict):
            return d
    except (OSError, ValueError):
        pass
    return {"cola": f"externo-{agente}", "donde": agente, "tareas": {}}


def escribir(agente: str, datos: dict) -> None:
    os.makedirs(DIR_OLAS, exist_ok=True)
    destino = ruta(agente)
    fd, tmp = tempfile.mkstemp(dir=DIR_OLAS, prefix=".latido-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, destino)  # atómico: el Mando nunca lee un archivo a medias


def limpiar_caducadas(datos: dict, ahora: float) -> None:
    for tid in list(datos["tareas"]):
        t = datos["tareas"][tid]
        if t.get("fase") == "hecho" or (t.get("hasta") or 0) < ahora - 3600:
            del datos["tareas"][tid]


def empezar(a) -> dict:
    if not _ID.match(a.id):
        sys.exit("id inválido (letras, números, . _ : -; máx. 64)")
    ahora = time.time()
    datos = leer(a.agente)
    limpiar_caducadas(datos, ahora)
    datos["tareas"][a.id] = {
        "titulo": a.titulo[:200],
        "fase": a.fase,
        "modelo": a.modelo,
        "proveedor": a.proveedor,
        "donde": a.donde or a.agente,
        "medio": a.medio,
        "desde": ahora,
        "avance": ahora,
        "hasta": ahora + a.minutos * 60,
    }
    escribir(a.agente, datos)
    return datos["tareas"][a.id]


def fase(a) -> dict:
    ahora = time.time()
    datos = leer(a.agente)
    t = datos["tareas"].get(a.id)
    if not t:
        sys.exit(f"no hay ninguna tarea «{a.id}» latiendo para {a.agente}")
    t["fase"] = a.fase
    t["avance"] = ahora
    t["hasta"] = ahora + a.minutos * 60
    escribir(a.agente, datos)
    return t


def terminar(a) -> None:
    datos = leer(a.agente)
    datos["tareas"].pop(a.id, None)
    escribir(a.agente, datos)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    e = sub.add_parser("empezar")
    e.add_argument("id")
    e.add_argument("titulo")
    e.add_argument("--modelo", default="anthropic/claude-opus-5.5")
    e.add_argument("--proveedor", default="anthropic")
    e.add_argument("--donde", default="")
    e.add_argument("--medio", default="claude")
    e.add_argument("--fase", default="escribiendo")
    e.add_argument("--minutos", type=int, default=45)
    e.add_argument("--agente", default="cowork")
    f = sub.add_parser("fase")
    f.add_argument("id")
    f.add_argument("fase")
    f.add_argument("--minutos", type=int, default=45)
    f.add_argument("--agente", default="cowork")
    t = sub.add_parser("terminar")
    t.add_argument("id")
    t.add_argument("--agente", default="cowork")
    l = sub.add_parser("lista")
    l.add_argument("--agente", default="cowork")
    a = ap.parse_args(argv)
    if a.orden == "empezar":
        print(json.dumps(empezar(a), ensure_ascii=False))
    elif a.orden == "fase":
        print(json.dumps(fase(a), ensure_ascii=False))
    elif a.orden == "terminar":
        terminar(a)
        print("terminada")
    else:
        print(json.dumps(leer(a.agente), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
