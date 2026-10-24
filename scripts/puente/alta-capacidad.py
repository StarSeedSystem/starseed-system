#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad: candidatas y cupo de Claude. Solo lee; no lanza agentes.
Uso: alta-capacidad.py [--en-marcha N] [--json] [--raiz R] [--olas D] [--progreso F] [--limites F]
"""
from __future__ import annotations
import argparse, json, os, sys
from datetime import datetime
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import asignar_huecos  # noqa: E402  (`_colas_fuente` es el cargador de colas del puente)
import limites_claude  # noqa: E402
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(AQUI))
OLAS = os.environ.get("STARSEED_OLAS") or os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.environ.get("STARSEED_PROGRESO") or os.path.join(OLAS, "progreso.json")
TOPE_OPUS, TOPE_SESION, TOPE_SEMANA = 2, 70.0, 80.0
# Mismos cierres que `reconciliar_progreso.py` + los estados VIVOS de la cola (`asignar_huecos.py`,
# carril nube): una tarea ya cogida por otro medio no es candidata aquí.
CERRADAS = {"commit", "bloqueante", "sustituida", "rechazada", "hecho", "esperando_aprobacion",
            "pendiente_aprobacion", "informe", "integrada", "en_curso", "reasignada", "por_traer"}
REINTENTABLES = {"pendiente", "fallo", "fallo_tests", "fallo_timeout", "sin_cambios", "interrumpida"}
def _leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}
def _n(valor):
    try: return int(valor or 0)
    except (TypeError, ValueError): return 0
def _intentos(t, entrada):
    return max(_n(t.get("intentos_auto")), _n(entrada.get("intentos_auto")))
def _archivos(t):
    a = t.get("archivos") or []
    return len(a) if isinstance(a, list) else 1
def _cupo(limites, en_marcha, ahora):
    """(ok, motivo): semana < 80 %, sesión < 70 % y como mucho 2 Opus a la vez."""
    try:
        e = limites_claude.estado(limites if isinstance(limites, dict) else {}, ahora)
    except (TypeError, ValueError):
        return False, "no se pudo interpretar la lectura de límites de Claude"
    sp, wp = (e.get("sesion") or {}).get("pct"), (e.get("semana") or {}).get("pct")
    if sp is None or wp is None:
        return False, "sin lectura de los límites de Claude (anótala con limites_claude.py declarar)"
    if e.get("desactualizada"):
        return False, "lectura desactualizada (%s min)" % e.get("lectura_hace_min")
    if sp >= TOPE_SESION:
        return False, "sesión al %.0f %% (tope %.0f %%)" % (sp, TOPE_SESION)
    if wp >= TOPE_SEMANA:
        return False, "semana al %.0f %% (tope %.0f %%)" % (wp, TOPE_SEMANA)
    huecos = TOPE_OPUS - max(0, en_marcha)
    if huecos <= 0:
        return False, "ya hay %d Opus en marcha (tope %d)" % (en_marcha, TOPE_OPUS)
    return True, "semana %.0f %% · sesión %.0f %% · caben %d" % (wp, sp, huecos)
def _motivos(t, entrada):
    m = ["marcada alta_capacidad"] if t.get("alta_capacidad") else []
    for campo, etiqueta in (("capacidad", "capacidad alta"), ("importancia", "importancia capacidad"),
                            ("dificultad", "dificultad alta")):
        if str(t.get(campo) or "").lower() in ("alta", "capacidad"):
            m.append(etiqueta)
    if _archivos(t) >= 3: m.append("%d archivos" % _archivos(t))
    if _intentos(t, entrada) >= 2 or t.get("modelos_fallidos") or entrada.get("modelos_fallidos"):
        m.append("ya falló con otros modelos")
    return m
def _dependencias_ok(t, progreso):
    deps = t.get("depende") or []
    deps = [deps] if isinstance(deps, str) else deps
    return all((progreso.get(str(d)) or {}).get("estado") in ("commit", "hecho", "integrada")
               for d in deps)
def alta_capacidad_logica(progreso, colas, limites, en_marcha=0, ahora=None):
    """PURA. {cupo:{ok,motivo}, candidatas:[…], elegidas:[…]}, sin tocar disco."""
    ahora = ahora or datetime.now().astimezone()
    progreso = progreso if isinstance(progreso, dict) else {}
    en_marcha = max(0, _n(en_marcha))
    ok, motivo = _cupo(limites, en_marcha, ahora)
    filas, vistas = [], set()
    for nombre, tareas in colas or []:
        for pos, t in enumerate(tareas or []):
            if not isinstance(t, dict) or not t.get("id") or str(t["id"]) in vistas: continue
            tid = str(t["id"]); vistas.add(tid)
            entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
            estado = str(entrada.get("estado") or "pendiente")
            razones = _motivos(t, entrada)
            if razones and estado not in CERRADAS:
                filas.append(({"id": tid, "titulo": str(t.get("titulo") or ""), "estado": estado,
                               "intentos": _intentos(t, entrada), "cola": nombre,
                               "archivos": _archivos(t), "motivo": " · ".join(razones), "pos": pos},
                              t, entrada))
    filas.sort(key=lambda f: (0 if f[1].get("alta_capacidad") else 1,
                              0 if _archivos(f[1]) >= 3 else 1,
                              0 if _intentos(f[1], f[2]) >= 2 else 1, f[0]["pos"]))
    huecos = max(0, TOPE_OPUS - en_marcha) if ok else 0
    elegidas = [c["id"] for c, t, _ in filas
                if c["estado"] in REINTENTABLES and _dependencias_ok(t, progreso)][:huecos]
    return {"cupo": {"ok": ok, "motivo": motivo}, "candidatas": [c for c, _, _ in filas],
            "elegidas": elegidas}
def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raiz"); p.add_argument("--olas"); p.add_argument("--progreso")
    p.add_argument("--limites"); p.add_argument("--en-marcha", type=int, default=0)
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    olas = a.olas or os.path.join(a.raiz or RAIZ, "starseed_memory_root", "olas")
    progreso = a.progreso or (os.path.join(olas, "progreso.json") if (a.raiz or a.olas) else PROGRESO)
    if a.limites: limites_claude.ARCHIVO = a.limites
    asignar_huecos.OLAS = olas
    datos = alta_capacidad_logica(_leer_json(progreso), asignar_huecos._colas_fuente(),
                                  limites_claude.leer(), a.en_marcha)
    if a.json:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return 0
    cupo = datos["cupo"]
    print("Cupo de Claude: %s · %s" % ("sí" if cupo["ok"] else "no", cupo["motivo"]))
    for c in datos["candidatas"]:
        print("  %s · %s · %s · %d intento(s) · %s" % (
            c["id"], c["titulo"], c["estado"], c["intentos"], c["motivo"]))
    print("Elegidas ahora (%d en marcha): %s" % (a.en_marcha, ", ".join(datos["elegidas"]) or "ninguna"))
    return 0
if __name__ == "__main__":
    sys.exit(main())
