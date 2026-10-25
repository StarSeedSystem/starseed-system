#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad (ALT1021Cd): lista candidatas y cupo de Claude.

Lee progreso.json, colas fuente y límites de Claude; imprime un resumen de
cupo y las candidatas que elige ahora, o --json para máquina.

Uso:
    python3 scripts/puente/alta-capacidad.py              # modo texto
    python3 scripts/puente/alta-capacidad.py --json       # modo JSON
    python3 scripts/puente/alta-capacidad.py --en-marcha 2  # 2 agentes en marcha
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

# Añadir el directorio del puente al path para importar lógica pura
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from alta_capacidad_logica import (
    necesita_alta,
    cupo_claude,
    elegir,
)
from limites_claude import leer as leer_limites

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")


def _leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto if defecto is not None else {}


def _leer_colas_fuente():
    """Lee las colas fuente (igual que reconcilia/progreso usa)."""
    carpeta = os.path.join(RAIZ, "starseed_memory_root", "colas-fuente")
    colas = {}
    try:
        for nombre in sorted(os.listdir(carpeta)):
            if not (nombre.startswith("cola-") and nombre.endswith(".json")):
                continue
            ruta = os.path.join(carpeta, nombre)
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
            # Cada cola es una lista de tareas
            tareas = datos if isinstance(datos, list) else datos.get("tareas", [])
            for t in tareas:
                if isinstance(t, dict) and t.get("id"):
                    cola = nombre  # nombre de la cola fuente
                    colas.setdefault(t["id"], []).append({
                        "cola": cola,
                        "titulo": t.get("titulo", ""),
                        "estado": t.get("estado", ""),
                        "intentos": t.get("intentos", 0),
                    })
    except OSError:
        pass
    return colas


def _progreso():
    return _leer_json(PROGRESO, {})


def _formatear_tarea(t):
    """Formatea una tarea de progreso a {id, titulo, estado, intentos}."""
    t_id = t.get("id", "")
    titulo = t.get("titulo", "")
    estado = t.get("estado", "")
    intentos = t.get("intentos", 0)
    return {"id": t_id, "titulo": titulo, "estado": estado, "intentos": intentos}


def main():
    en_marcha = int(os.environ.get("ALTA_EN_MARCHA", "0"))
    modo_json = "--json" in sys.argv

    # Leer progreso
    progreso = _progreso()
    lecturas_progreso = progreso.get("lecturas", []) if isinstance(progreso, dict) else []

    # Leer colas fuente
    colas_fuente = _leer_colas_fuente()

    # Leer límites de Claude
    limites = leer_limites()
    lecturas = limites.get("lecturas", []) if isinstance(limites, dict) else []

    # Determinar cupo de Claude
    ahora = datetime.now(timezone.utc)
    cupo_ok, cupo_motivo = cupo_claude(lecturas, ahora)

    # Construir lista de candidatas de progreso
    candidatas = []
    for tid, tarea in progreso.items():
        if not isinstance(tarea, dict):
            continue
        # Verificar si necesita alta capacidad
        if necesita_alta(tarea, None):
            # Buscar info en colas fuente
            info_cola = colas_fuente.get(tid, [{}])[0]
            base = {"id": tid, "titulo": info_cola.get("titulo", tarea.get("titulo", "")),
                    "estado": info_cola.get("estado", tarea.get("estado", "")),
                    "intentos": info_cola.get("intentos", tarea.get("intentos", 0))}
            candidatas.append(base)

    # Ordenar y elegir qué ejecutar ahora
    # Orden: adelantar por Alex, luego importancia "capacidad", luego más intentos_auto, luego id ascendente
    disponibles = max(0, 2 - en_marcha)  # máximo 2 agentes concurrentes
    orden = list(candidatas)

    def clave(c):
        adelantar = 1 if (c.get("adelantar") and str(c.get("adelantar", "")).strip()) else 0
        importancia = 1 if c.get("importancia") == "capacidad" else 0
        intentos = int(c.get("intentos_auto", 0) or 0)
        id_val = str(c.get("id", ""))
        return (-adelantar, -importancia, -intentos, id_val)

    orden.sort(key=clave)
    elegidas = orden[:disponibles]

    if modo_json:
        resultado = {
            "cupo": {"ok": cupo_ok, "motivo": cupo_motivo},
            "candidatas": [{"id": c["id"], "titulo": c["titulo"],
                          "estado": c["estado"], "intentos": c["intentos"]}
                         for c in candidatas],
            "elegidas": [{"id": c["id"], "titulo": c["titulo"],
                         "estado": c["estado"], "intentos": c["intentos"]}
                        for c in elegidas],
        }
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        # Modo texto: línea de cupo + candidatas + elegidas
        print(f"Cupo de Claude: {'sí' if cupo_ok else 'no'} · {cupo_motivo}")
        print()
        print("Candidatas:")
        for c in candidatas:
            print(f"  {c['id']} · {c['titulo']} · {c['estado']} · intentos:{c['intentos']}")
        print()
        print("Elegiría ahora:")
        if elegidas:
            for c in elegidas:
                print(f"  {c['id']} · {c['titulo']} · {c['estado']} · intentos:{c['intentos']}")
        else:
            print("  ninguna")


if __name__ == "__main__":
    main()