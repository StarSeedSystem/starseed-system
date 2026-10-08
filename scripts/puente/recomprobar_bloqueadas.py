#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recomprueba TODAS las bloqueadas con los directores (botón del medidor «Bloqueadas»).

Alex (2026-10-08): «para las bloqueadas agrega un botón de recomprobar todas con los directores
desde el medidor». Medido ese día: 36 bloqueadas (28 «escalada agotada tras 8 intentos (libre×8)»,
casi todas de los días en que todos los proveedores gratuitos estaban sin cupo; 8 que la nube no
integró; 1 que YA estaba en main).

Qué decide, tarea por tarea (PURO: `clasificar`):
  · ya en main (su commit de integración, misma ola y mismo id) → «commit»;
  · el fallo fue del MEDIO (sin cupo, todos caídos, la nube dijo sin_cambios/en_curso, escalada
    con modelos libres) → vuelve a la cola de la Mac («pendiente», medio «mac»): la sonda del
    orquestador ya espera a que haya un escritor con cupo en vez de gastar intentos;
  · el fallo es de la TAREA (no tocó sus archivos, puertas en rojo con modelo de pago…) → sigue,
    con el motivo: necesita «Reintentar con un cambio» o una persona.
Jev opina SOLO sobre las que se reabrirían y llevan más de 7 días: si está seguro (p ≥ 0,9) de que
ya no tiene sentido, no se reabre y se dice («decide Alex»). Nunca archiva nada por su cuenta.
Cada tarea se reabre por aquí como mucho una vez cada 24 h. Los cambios van por
`olas/progreso-correcciones.json`, el camino de siempre (los aplica el vigilante sin pisar al
orquestador vivo).

Uso: python3 scripts/puente/recomprobar_bloqueadas.py [--simular] [--json]
"""
import glob
import json
import os
import re
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
FUENTES = os.path.join(RAIZ, "starseed_memory_root", "colas-fuente")
PROGRESO = os.path.join(OLAS, "progreso.json")
CORRECCIONES = os.path.join(OLAS, "progreso-correcciones.json")
INFORME = os.path.join(RAIZ, "starseed_memory_root", "mando", "recomprobacion-bloqueadas.json")
MEMORIA = os.path.expanduser("~/.starseed/recomprobaciones-bloqueadas.json")

ESTADOS_BLOQUEADOS = ("bloqueada", "bloqueante")
UNA_VEZ_CADA_S = 24 * 3600
JEV_VIEJA_S = 7 * 24 * 3600
JEV_OBSOLETA = 0.9

#: Señales de que el fallo fue del MEDIO (proveedores, nube, cupos), no de la tarea.
_MEDIO = re.compile(
    r"libre×|sin_cambios|«en_curso»|ning[uú]n proveedor|todos ca[ií]dos|sin cupo|cupo del d[ií]a|"
    r"\b429\b|\b402\b|rate.?limit|timeout|colgad|no lleg[oó] a github|la nube la intent[oó]",
    re.I)
#: Señales de que la TAREA falla por sí misma: repetirla igual no sirve.
_TAREA = re.compile(r"no toc[oó] ning|alcance|puertas? en rojo|tsc|vitest|revisi[oó]n (es )?bloqueante|conflicto", re.I)


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def tareas_conocidas(carpetas):
    """{id: tarea} de todas las colas (vivas y archivadas). La más reciente gana."""
    salida = {}
    archivos = []
    for c in carpetas:
        archivos += glob.glob(os.path.join(c, "cola-*.json"))
    for ruta in sorted(archivos, key=lambda r: os.path.getmtime(r) if os.path.exists(r) else 0):
        d = _leer(ruta, None)
        lista = d if isinstance(d, list) else (d or {}).get("tareas") if isinstance(d, dict) else None
        for t in lista or []:
            if isinstance(t, dict) and t.get("id"):
                salida[str(t["id"])] = t
    return salida


def en_main(tid, tarea, asuntos):
    """Integrada si hay un commit de integración de ESA tarea (no un «salvavidas»)."""
    try:
        import identidad_tarea
        if tarea and identidad_tarea.esta_integrada(tarea, asuntos):
            return True
    except Exception:
        pass
    patron = re.compile(r"^Ola [^·]+·.*· %s: " % re.escape(tid))
    return any(patron.search(a or "") for a in asuntos or [])


def clasificar(tid, entrada, tarea, asuntos, ahora, ultima_reapertura=None):
    """('commit'|'reabrir'|'sigue', motivo). PURA."""
    nota = str((entrada or {}).get("nota") or "")
    if en_main(tid, tarea, asuntos):
        return "commit", "ya estaba integrada en main"
    if ultima_reapertura and ahora - float(ultima_reapertura) < UNA_VEZ_CADA_S:
        return "sigue", "ya se reabrió por aquí hace menos de 24 h"
    if _TAREA.search(nota) and not re.search(r"libre×", nota):
        return "sigue", "falla la propia tarea: «Reintentar con un cambio» o una persona"
    if _MEDIO.search(nota):
        return "reabrir", "el fallo fue del medio (proveedores o nube), no de la tarea"
    return "sigue", "sin una causa clara de medio: la revisa una persona"


def antigua(entrada, ahora):
    t = str((entrada or {}).get("t") or "")
    try:
        return ahora - time.mktime(time.strptime(t[:19], "%Y-%m-%dT%H:%M:%S")) > JEV_VIEJA_S
    except ValueError:
        try:
            return ahora - time.mktime(time.strptime(t[:16], "%Y-%m-%d %H:%M")) > JEV_VIEJA_S
        except ValueError:
            return False


def opinion_jev(candidatas, titulos, asuntos, consultar_lote=None):
    """{tid: p_obsoleta} para las candidatas. Sin Jev, vacío (se reabren todas)."""
    if not candidatas:
        return {}
    if consultar_lote is None:
        try:
            import decidir
            consultar_lote = decidir.consultar_lote
        except Exception:
            return {}
    integraciones = [a[:120] for a in asuntos if a.startswith("Ola ")][:40]
    salida = {}
    for i in range(0, len(candidatas), 24):
        trozo = candidatas[i:i + 24]
        preguntas = {tid: {"tipo": "si-no",
                           "pregunta": "¿Ha quedado obsoleta (ya hecha por otra tarea o sin sentido hoy) la "
                                       "tarea %s: «%s»?" % (tid, (titulos.get(tid) or "")[:160])}
                     for tid in trozo}
        try:
            r = consultar_lote({"integraciones_recientes_en_main": integraciones}, preguntas,
                               quien="director-bloqueadas", dominio="bloqueadas")
        except Exception:
            continue
        for tid, resp in ((r or {}).get("respuestas") or {}).items():
            si = str(resp.get("respuesta")).lower() in ("sí", "si", "true")
            conf = float(resp.get("confianza") or resp.get("p") or 0)
            if si:
                salida[tid] = conf
    return salida


def recomprobar(progreso, tareas, asuntos, ahora, memoria, jev=None):
    """Decide todo. Devuelve (correcciones, informe, memoria_nueva). PURA salvo `jev`."""
    bloqueadas = {k: v for k, v in (progreso or {}).items()
                  if isinstance(v, dict) and v.get("estado") in ESTADOS_BLOQUEADOS}
    decisiones = {}
    for tid, v in sorted(bloqueadas.items()):
        decisiones[tid] = clasificar(tid, v, tareas.get(tid), asuntos, ahora, (memoria or {}).get(tid))
    viejas = [t for t, (d, _) in decisiones.items() if d == "reabrir" and antigua(bloqueadas[t], ahora)]
    titulos = {t: str((tareas.get(t) or {}).get("titulo") or "") for t in viejas}
    obsoletas = {t: p for t, p in (jev(viejas, titulos) if jev else {}).items() if p >= JEV_OBSOLETA}
    hora = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
    correcciones, informe, memoria_nueva = {}, {"integradas": [], "reabiertas": [], "siguen": []}, dict(memoria or {})
    for tid, (decision, motivo) in decisiones.items():
        if decision == "reabrir" and tid in obsoletas:
            decision, motivo = "sigue", "Jev la ve obsoleta (%.2f): decide Alex si se archiva o se reintenta" % obsoletas[tid]
        if decision == "commit":
            correcciones[tid] = {"estado": "commit", "nota": "recomprobada por los directores: %s" % motivo, "t": hora}
            informe["integradas"].append(tid)
        elif decision == "reabrir":
            correcciones[tid] = {"estado": "pendiente", "medio": "mac", "t": hora,
                                 "nota": "recomprobada por los directores: %s; vuelve a la cola de la Mac" % motivo}
            informe["reabiertas"].append(tid)
            memoria_nueva[tid] = ahora
        else:
            informe["siguen"].append({"id": tid, "motivo": motivo})
    informe["total"] = len(bloqueadas)
    return correcciones, informe, memoria_nueva


def resumen(informe):
    partes = ["%d bloqueadas recomprobadas" % informe.get("total", 0)]
    if informe["integradas"]:
        partes.append("%d ya estaban en main (%s)" % (len(informe["integradas"]), ", ".join(informe["integradas"][:6])))
    if informe["reabiertas"]:
        partes.append("%d vuelven a la cola (fallo del medio)" % len(informe["reabiertas"]))
    if informe["siguen"]:
        partes.append("%d siguen bloqueadas por la propia tarea o porque Jev las ve obsoletas" % len(informe["siguen"]))
    return " · ".join(partes)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    simular = "--simular" in argv
    ahora = time.time()
    progreso = _leer(PROGRESO, {})
    tareas = tareas_conocidas([OLAS, FUENTES])
    asuntos = subprocess.run(["git", "log", "main", "--format=%s"], cwd=RAIZ, capture_output=True,
                             text=True, timeout=60).stdout.splitlines()
    memoria = _leer(MEMORIA, {})
    correcciones, informe, memoria_nueva = recomprobar(
        progreso, tareas, asuntos, ahora, memoria,
        jev=lambda c, t: opinion_jev(c, t, asuntos))
    informe["resumen"] = resumen(informe)
    informe["t"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    informe["simulado"] = simular
    if not simular and correcciones:
        actuales = _leer(CORRECCIONES, {})
        actuales = actuales if isinstance(actuales, dict) else {}
        actuales.update(correcciones)
        _escribir(CORRECCIONES, actuales)
        _escribir(MEMORIA, memoria_nueva)
    if not simular:
        _escribir(INFORME, informe)
        try:
            import director_chat
            director_chat.publicar("Recomprobación de bloqueadas: %s." % informe["resumen"],
                                   de="director-bloqueadas", rol="director", tipo="informe")
        except Exception:
            pass
    if "--json" in argv:
        print(json.dumps(informe, ensure_ascii=False))
    else:
        print(informe["resumen"])
        for s in informe["siguen"]:
            print("  · %s: %s" % (s["id"], s["motivo"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
