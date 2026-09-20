#!/usr/bin/env python3
"""Veredictos de las tareas atascadas, con Jev de consejero y reglas deterministas delante.

(2026-09-20) Lo que ayer costó cuatro subagentes de Gemini —«¿reintentar, cambiar,
descartar o esperar?» por cada bloqueada— ahora cuesta una decisión tipada de
$0,00002 por tarea. Lee `progreso.json`, la ficha de cada cola, la objeción del revisor
en `revisiones.md` y el final del log de la tarea; escribe `veredictos.json` para el
Mando (botón «Reintentar con cambio inteligente») y para el director de Hermes, que
solo lanza un subagente cuando la confianza baja de 0,7.

Reglas deterministas (mandan sobre Jev, como pide Alex del 13/09):
- `bloqueada` por dependencia → esperar (sin preguntar a nadie).
- `sin_cambios` con TODOS los modelos → reintentar sin cambios cuando haya escritor:
  el fallo fue del proveedor, no de la tarea.
- objeción del revisor legible → reintentar con esa objeción literal como instrucción.
- `archivos: []` (verificación, push, navegador) → descartar: no es tarea de escritor.
Jev solo entra en lo que queda, y su confianza se guarda al lado del veredicto.
"""
import argparse
import glob
import json
import os
import re
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
ATASCADAS = ("bloqueada", "bloqueante", "rechazada", "sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "conflicto")
PISTAS_PROVEEDOR = ("usage limit", "tokens per minute", "check-in required", "rate limit", "402", "429",
                    "sin cupo", "colgado", "estancado", "no respondió", "payment required")
OPCIONES = {
    "reintentar": "relanzar tal cual: falló el proveedor (cupo, fichaje, colgado), no la tarea",
    "reintentar_con_cambio": "relanzar con una instrucción distinta porque la tarea misma falló o fue rechazada",
    "descartar": "no merece más intentos, ya no aplica o no es tarea de escritor",
    "esperar": "depende de otra tarea o de una acción humana",
}


def fichas():
    fuera = {}
    for f in sorted(glob.glob(os.path.join(OLAS, "cola-*.json"))):
        if "cola-auto-" in os.path.basename(f):
            continue
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for t in (d if isinstance(d, list) else d.get("tareas", [])):
            if isinstance(t, dict) and t.get("id"):
                fuera.setdefault(str(t["id"]), dict(t, _cola=os.path.basename(f)))
    return fuera


def objecion_de(revisiones_md, tid):
    """El bloque de `revisiones.md` cuya cabecera termina en `· <ID>:`, o ''."""
    patron = re.compile(r"(?ms)^## [^\n]*·\s*%s:[^\n]*\n(.*?)(?=^## |\Z)" % re.escape(tid))
    m = patron.search(revisiones_md or "")
    return m.group(1).strip()[:1500] if m else ""


def cola_del_log(tid, lineas=12):
    ruta = os.path.join(OLAS, "logs", tid + ".log")
    try:
        return "\n".join(open(ruta, encoding="utf-8", errors="ignore").read().splitlines()[-lineas:])[:1500]
    except OSError:
        return ""


def regla(estado, nota, ficha, objecion, log):
    """(veredicto, cambio, motivo) determinista, o None si hay que preguntar."""
    nota_l = (nota or "").lower()
    if estado == "bloqueada" and ("dependencia" in nota_l or "esperando" in nota_l):
        return "esperar", "", "depende de otra tarea: " + nota[:120]
    if not list((ficha or {}).get("archivos") or []):
        return "descartar", "", "sin archivos: es verificación, navegador o push, no trabajo de escritor"
    if objecion:
        return "reintentar_con_cambio", objecion[:600], "la objeción literal del revisor es la instrucción"
    if estado in ("sin_cambios", "bloqueante") and any(p in (log + nota_l).lower() for p in PISTAS_PROVEEDOR):
        return "reintentar", "", "todos los intentos murieron en el proveedor (cupo, fichaje, colgado), no en la tarea"
    return None


def preguntar_a_jev(tid, estado, nota, ficha, objecion, log):
    """(veredicto, cambio, motivo, confianza) o None si Jev no está o no contesta."""
    try:
        import jev
    except Exception:
        return None
    contexto = {"tarea": tid, "titulo": ficha.get("titulo"), "archivos": ficha.get("archivos"),
                "estado": estado, "nota": nota[:300], "objecion_del_revisor": objecion[:800], "final_del_log": log[:800]}
    # (2026-09-20) Por la puerta de la Trinidad: el juicio es de Jev y queda anotado como
    # experiencia para la conciencia colectiva (Needle no juzga: medido, copia cadenas).
    try:
        import razonador
        r = razonador.juicio(contexto, "¿Qué debe hacer el director del enjambre con esta tarea atascada?", OPCIONES, dominio="enjambre")
        r = r[:3] if r else None
    except Exception:
        r = jev.elegir(contexto, "¿Qué debe hacer el director del enjambre con esta tarea atascada?", OPCIONES)
    if not r:
        return None
    opcion, probs, conf = r
    cambio = objecion[:600] if opcion == "reintentar_con_cambio" else ""
    return opcion, cambio, "Jev: " + ", ".join("%s %.2f" % (k, v) for k, v in sorted(probs.items(), key=lambda kv: -kv[1])[:3]), conf


def veredictos(progreso, fichas_, revisiones_md, leer_log=cola_del_log, jev_disponible=True):
    """[{id, estado, veredicto, cambio, motivo, confianza, fuente}] para cada atascada."""
    fuera = []
    for tid, v in sorted((progreso or {}).items()):
        if not isinstance(v, dict) or v.get("estado") not in ATASCADAS:
            continue
        ficha = fichas_.get(tid) or {}
        nota = str(v.get("nota") or v.get("motivo") or "")
        objecion = objecion_de(revisiones_md, tid)
        log = leer_log(tid)
        r = regla(v.get("estado"), nota, ficha, objecion, log)
        if r:
            veredicto, cambio, motivo = r
            fuera.append({"id": tid, "estado": v.get("estado"), "veredicto": veredicto, "cambio": cambio,
                          "motivo": motivo, "confianza": 1.0, "fuente": "regla"})
            continue
        j = preguntar_a_jev(tid, v.get("estado"), nota, ficha, objecion, log) if jev_disponible else None
        if j:
            veredicto, cambio, motivo, conf = j
            fuera.append({"id": tid, "estado": v.get("estado"), "veredicto": veredicto, "cambio": cambio,
                          "motivo": motivo, "confianza": round(conf, 2), "fuente": "jev"})
        else:
            fuera.append({"id": tid, "estado": v.get("estado"), "veredicto": "esperar", "cambio": "",
                          "motivo": "sin regla y sin consejero: que lo mire el director", "confianza": 0.0, "fuente": "nadie"})
    return fuera


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seco", action="store_true", help="no escribir veredictos.json")
    ap.add_argument("--sin-jev", action="store_true")
    args = ap.parse_args()
    try:
        progreso = json.load(open(os.path.join(OLAS, "progreso.json"), encoding="utf-8"))
    except Exception:
        print("sin progreso.json"); return 1
    try:
        revisiones = open(os.path.join(OLAS, "revisiones.md"), encoding="utf-8", errors="ignore").read()
    except OSError:
        revisiones = ""
    filas = veredictos(progreso, fichas(), revisiones, jev_disponible=not args.sin_jev)
    for f in filas:
        print("%-10s %-12s %-22s %.2f %-6s %s" % (f["id"], f["estado"], f["veredicto"], f["confianza"], f["fuente"], f["motivo"][:70]))
    if not args.seco:
        ruta = os.path.join(OLAS, "veredictos.json")
        tmp = ruta + ".tmp"
        json.dump({"t": time.strftime("%Y-%m-%d %H:%M:%S"), "veredictos": filas}, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
        print("→", ruta, "(%d)" % len(filas))
    try:
        import jev
        print(jev.resumen_uso())
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
