#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad (ola 1021A): candidatas y cupo de Claude para la dirección.

Solo LEE: progreso.json, las colas fuente y los límites de Claude; no lanza agentes ni
escribe nada. Las decisiones son del módulo puro `alta_capacidad_logica` (ALT1021Ac:
`necesita_alta`, `cupo_claude`, `elegir`), como en su hermano `alta-capacidad-nube.py`;
las colas se cargan con el cargador del puente (`asignar_huecos._colas_fuente`, el mismo
filtro `es_cola_de_codigo` del vigilante que usa el revisor de bloqueadas y
`reconciliar_progreso`): no hay un segundo cargador de colas.

Uso:
  alta-capacidad.py [--en-marcha N] [--json] [--olas D] [--progreso F] [--limites F]

Las rutas se inyectan por argumentos o por variables de entorno (STARSEED_ROOT,
STARSEED_OLAS, STARSEED_PROGRESO, STARSEED_LIMITES_CLAUDE), igual que en los demás
scripts del puente.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import alta_capacidad_logica as logica  # noqa: E402
import asignar_huecos  # noqa: E402  (solo por su `_colas_fuente`, el cargador de colas del puente)
import limites_claude  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(AQUI))

#: Estados cerrados para CANDIDATAS: una tarea ya integrada o esperando persona no vuelve
#: a pedir el carril (los estados que `necesita_alta` no distingue por sí solo). Sin
#: «bloqueante»: es justamente la marca que deja la escalera (`escalada_logica`).
CERRADAS = {"commit", "hecho", "integrada", "sustituida", "rechazada", "informe",
            "no_aplica", "en_curso", "esperando_aprobacion", "pendiente_aprobacion"}

#: Los únicos estados de los que el carril puede TOMAR una tarea: «en_curso» y
#: «reasignada» ya tienen a alguien trabajando (el carril de nube, por ejemplo).
REINTENTABLES = {"pendiente", "bloqueada", "bloqueante", "conflicto", "interrumpida",
                 "sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "fallo_motor"}

#: Una dependencia cerrada, la misma terna que `asignar_huecos` y el vigilante usan.
DEP_CERRADA = ("commit", "hecho", "integrada")

#: Cupo de la dirección (plan de Claude): como mucho 2 Opus a la vez; el medio «nube»
#: (crédito aparte) lo cuenta `alta-capacidad-nube.py` con su propio tope.
MAX_AGENTES = 2


def _leer_json(ruta):
    """El JSON de la ruta o {} si no se puede leer: nunca tumba el listado."""
    try:
        with open(ruta, encoding="utf-8") as archivo:
            datos = json.load(archivo)
    except (OSError, ValueError):
        return {}
    return datos if isinstance(datos, dict) else {}


def _intentos(tarea, entrada):
    """El mayor de los intentos que declare la cola y el progreso (pueden divergir)."""
    n = 0
    for origen in (tarea, entrada):
        valor = (origen or {}).get("intentos_auto")
        if isinstance(valor, (int, float)) and not isinstance(valor, bool):
            n = max(n, int(valor))
    return n


def _archivos(tarea):
    archivos = tarea.get("archivos") or []
    return 1 if isinstance(archivos, str) else len(archivos)


def _motivo(tarea, entrada):
    """Por qué esta tarea pide el carril, en una línea corta."""
    motivos = []
    if (entrada or {}).get("alta_capacidad") is True:
        motivos.append("marcada por la escalera")
    if tarea.get("alta_capacidad") is True:
        motivos.append("marcada alta_capacidad")
    for campo, etiqueta in (("capacidad", "capacidad alta"), ("dificultad", "dificultad alta")):
        if str(tarea.get(campo) or "").lower() == "alta":
            motivos.append(etiqueta)
    for nota in (tarea.get("nota"), tarea.get("nota_director"), (entrada or {}).get("nota")):
        if isinstance(nota, str) and nota.strip().startswith("director: escalada agotada"):
            motivos.append("escalada agotada")
            break
    if _archivos(tarea) >= 3:
        motivos.append("%d archivos" % _archivos(tarea))
    if _intentos(tarea, entrada) >= 2 or (entrada or {}).get("modelos_fallidos"):
        motivos.append("ya falló con otros modelos")
    return " · ".join(motivos)


def _dependencias_ok(deps, progreso):
    """True si toda la dependencia declarada está integrada (misma terna que el puente)."""
    for dep in deps or []:
        entrada = progreso.get(str(dep))
        estado = str((entrada or {}).get("estado") or "pendiente") if isinstance(entrada, dict) else "pendiente"
        if estado not in DEP_CERRADA:
            return False
    return True


def candidatas(progreso, colas):
    """Las tareas que piden el carril, en el orden en que las reciben las colas.

    La CANDIDATURA la decide el módulo puro (`necesita_alta`); aquí solo se añade el
    filtro de estados cerrados que el módulo no distingue y los datos que pinta el CLI.
    """
    filas, vistas = [], set()
    for nombre, tareas in colas or []:
        for tarea in tareas or []:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
            if not logica.necesita_alta(tarea, entrada):
                continue
            estado = str(entrada.get("estado") or "pendiente")
            if estado in CERRADAS:
                continue
            deps = tarea.get("depende") or tarea.get("dependencias") or []
            filas.append({
                "id": tid,
                "titulo": str(tarea.get("titulo") or ""),
                "estado": estado,
                "intentos": _intentos(tarea, entrada),
                "cola": str(nombre),
                "archivos": _archivos(tarea),
                "motivo": _motivo(tarea, entrada),
                # Campos que `logica.elegir` usa para ordenar:
                "adelantar": str(tarea.get("adelantar") or ""),
                "importancia": str(tarea.get("importancia") or ""),
                "intentos_auto": _intentos(tarea, entrada),
                "depende": [deps] if isinstance(deps, str) else list(deps),
            })
    return filas


def diagnostico(progreso, colas, limites, en_marcha=0, ahora=None):
    """PURA (no toca disco): {cupo:{ok,motivo}, candidatas:[…], elegidas:[…]}.

    El cupo lo decide `logica.cupo_claude` con las lecturas de `limites_claude.leer()`;
    la elección, `logica.elegir`, sobre las candidatas que HOY pueden tomarse (estado
    reintentable y dependencias integradas). Sin cupo no se elige ninguna.
    """
    ahora = ahora or datetime.now(timezone.utc)
    en_marcha = max(0, int(en_marcha or 0))
    lecturas = (limites or {}).get("lecturas", [])
    if not isinstance(lecturas, list):
        lecturas = []
    ok, motivo = logica.cupo_claude(lecturas, ahora)
    filas = candidatas(progreso or {}, colas or [])
    elegidas: list = []
    if ok:
        # Solo tareas que hoy pueden tomarse: estado reintentable y dependencias integradas.
        tomables = [
            fila for fila in filas
            if fila["estado"] in REINTENTABLES
            and _dependencias_ok(fila["depende"], progreso or {})
        ]
        elegidas = [fila["id"] for fila in logica.elegir(tomables, en_marcha, max_agentes=MAX_AGENTES)]
    return {"cupo": {"ok": ok, "motivo": motivo}, "candidatas": filas, "elegidas": elegidas}


def principal(argv=None):
    """Lee lo mínimo de disco y pinta el cupo, las candidatas y la elección. Nunca escribe."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--en-marcha", type=int, default=0,
                        help="sesiones de alta capacidad ya en marcha (por defecto 0)")
    parser.add_argument("--json", action="store_true", help="salida como objeto JSON")
    parser.add_argument("--raiz", help="raíz del repo (por defecto, la de este script)")
    parser.add_argument("--olas", help="carpeta de colas (por defecto <raiz>/starseed_memory_root/olas)")
    parser.add_argument("--progreso", help="progreso.json (por defecto <olas>/progreso.json)")
    parser.add_argument("--limites", help="limites-claude.json (por defecto lo que decida limites_claude)")
    args = parser.parse_args(argv)

    raiz = args.raiz or RAIZ
    olas = args.olas or os.environ.get("STARSEED_OLAS") or os.path.join(raiz, "starseed_memory_root", "olas")
    progreso = args.progreso or os.environ.get("STARSEED_PROGRESO") or os.path.join(olas, "progreso.json")
    if args.limites:
        limites_claude.ARCHIVO = args.limites
    # El cargador de colas del puente lee su OLAS global: se apunta al de esta ejecución.
    asignar_huecos.OLAS = olas

    datos = diagnostico(
        _leer_json(progreso), asignar_huecos._colas_fuente(), limites_claude.leer(),
        en_marcha=args.en_marcha,
    )
    if args.json:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return 0
    cupo = datos["cupo"]
    print("Cupo de Claude: %s · %s" % ("sí" if cupo["ok"] else "no", cupo["motivo"]))
    if not datos["candidatas"]:
        print("Ninguna candidata necesita el carril ahora.")
    for fila in datos["candidatas"]:
        print("  %s · %s · %s · %d intento(s) · %s" % (
            fila["id"], fila["titulo"], fila["estado"], fila["intentos"], fila["motivo"],
        ))
    print("Elegidas ahora (%d en marcha): %s" % (
        args.en_marcha, ", ".join(datos["elegidas"]) or "ninguna",
    ))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
