#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente de Mando desde cualquier IDE — Claude, Codex, Hermes, Antigravity.

Un solo mando para los cuatro entornos. No duplica estado: LEE el Mando vivo en
localhost:9002 y ESCRIBE órdenes en el mismo archivo de control que el orquestador
ya vigila cada 20 s. Quien lo ejecute —una terminal de Codex, el agente de Hermes,
el chat de Antigravity o esta sesión de Claude— ve y dirige exactamente lo mismo.

  starseed-puente estado                 # foto viva: olas, agentes, puertas, git
  starseed-puente agentes                # quién escribe AHORA y desde hace cuánto
  starseed-puente olas [n]               # últimas n olas con su recuento
  starseed-puente aprobar  <id> [...]    # desbloquea tareas en la puerta humana
  starseed-puente rechazar <id> [...]
  starseed-puente soltar   <id> [...]    # la tarea se va a otro motor (agente IA)
  starseed-puente reasignar <id> <modelo>
  starseed-puente cola                   # qué cola corre y qué queda
  starseed-puente puertas                # tsc · vitest · build · sin publicar
  starseed-puente briefing               # el texto para pegar en un chat nuevo
"""
import json, os, subprocess, sys, time, urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
MANDO = os.environ.get("STARSEED_MANDO_URL") or "http://localhost:9002"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")


def api(ruta, espera=8):
    try:
        with urllib.request.urlopen("%s/api/mando/%s" % (MANDO, ruta), timeout=espera) as r:
            return json.load(r)
    except Exception as e:
        return {"_error": "%s: %s" % (type(e).__name__, e)}


def cola_viva():
    """La cola que corre ahora: la del latido más reciente en disco."""
    mejor, mt = None, 0
    try:
        for f in os.listdir(OLAS):
            if f.startswith("latidos-cola-") and f.endswith(".json"):
                p = os.path.join(OLAS, f)
                m = os.path.getmtime(p)
                if m > mt:
                    mejor, mt = f, m
    except Exception:
        pass
    if not mejor:
        return None, None, 0
    try:
        d = json.load(open(os.path.join(OLAS, mejor), encoding="utf-8"))
        return d.get("cola", ""), d, mt
    except Exception:
        return None, None, mt


def git(*args):
    try:
        return subprocess.run(["git", "-C", RAIZ] + list(args), capture_output=True,
                              text=True, timeout=20).stdout.strip()
    except Exception:
        return ""


def cmd_estado():
    e = api("estado")
    if "_error" in e:
        print("Mando APAGADO (%s).\nLevántalo:  bash scripts/puente/arrancar-mando.sh" % e["_error"])
    else:
        c = e.get("cuentas") or {}
        u = c.get("ultimas") or {}
        print("OLA ARRIBA: %s" % c.get("ola", "—"))
        print("  integradas %s · en curso %s · esperando aprobación %s · fallidas %s · pendientes %s"
              % (c.get("integradas"), c.get("enCurso"), c.get("esperandoAprobacion"),
                 c.get("fallidas"), c.get("pendientes")))
        print("  en las últimas %s olas: en curso %s · pendientes %s · integradas %s"
              % (u.get("olas"), u.get("enCurso"), u.get("pendientes"), u.get("integradas")))
        print("AGENTES ESCRIBIENDO AHORA: %d" % len(e.get("latidos") or []))
    cola, lat, mt = cola_viva()
    if cola:
        print("COLA VIVA: %s (latido hace %ds)" % (cola, int(time.time() - mt)))
    print("GIT: %s · sin publicar: %s" % (git("log", "--oneline", "-1")[:80],
                                          git("rev-list", "--count", "origin/main..main")))
    sucio = git("status", "--porcelain")
    print("ÁRBOL: %s" % ("limpio" if not sucio else "%d archivos sin commitear" % len(sucio.splitlines())))


def cmd_agentes():
    cola, lat, mt = cola_viva()
    if not lat:
        print("Sin latido en disco: el orquestador no está corriendo.")
        return
    ahora = time.time()
    tareas = lat.get("tareas") or {}
    if not tareas:
        print("Latido sin tareas.")
        return
    print("%-8s %-16s %-30s %8s %8s %10s" % ("TAREA", "FASE", "MODELO", "LLEVA", "QUIETO", "BYTES"))
    for tid, v in sorted(tareas.items(), key=lambda x: -(x[1].get("avance") or 0)):
        print("%-8s %-16s %-30s %7.1fm %7.0fs %10d" % (
            tid, v.get("fase", ""), (v.get("modelo") or "")[:30],
            (ahora - v.get("desde", ahora)) / 60, ahora - v.get("avance", ahora), v.get("bytes", 0)))
    print("\nQuieto > 300 s con los bytes parados = API colgada, no modelo lento.")
    print("Suéltala y dásela a un agente IA:  starseed-puente soltar <id>")


def cmd_olas(n=6):
    e = api("estado")
    if "_error" in e:
        print("Mando apagado."); return
    for o in (e.get("olas") or [])[: int(n)]:
        print("· %-70s total %s" % (str(o.get("id"))[:70], o.get("total")))


def orden(accion, ids, extra=None):
    cola, _, _ = cola_viva()
    if not cola:
        print("No hay cola viva: no hay a quién dar la orden."); return 1
    ruta = os.path.join(OLAS, "control-%s.json" % cola)
    try:
        d = json.load(open(ruta, encoding="utf-8"))
    except Exception:
        d = {}
    quien = os.environ.get("STARSEED_IDE") or "ide"
    for i in ids:
        d[i] = {"accion": accion, "quien": quien, "t": time.strftime("%Y-%m-%d %H:%M:%S")}
        if extra:
            d[i].update(extra)
    json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("Orden «%s» escrita para %s en %s.\nEl vigilante la recoge en menos de 20 s."
          % (accion, ", ".join(ids), os.path.basename(ruta)))
    return 0


def cmd_puertas():
    print("Puertas (ejecútalas TÚ, con el enjambre parado para el build):")
    print("  1  npx tsc --noEmit")
    print("  2  npx vitest run")
    print("  3  npx next build          ← nunca con el enjambre vivo: la Mac es de 8 GB")
    print("\nSin publicar ahora mismo: %s commits" % git("rev-list", "--count", "origin/main..main"))
    print("Regla: nada está hecho hasta que se ve en el Mando de la Mac.")


def cmd_briefing():
    p = os.path.join(RAIZ, "PUENTE-DE-MANDO.md")
    if not os.path.exists(p):
        print("Falta PUENTE-DE-MANDO.md. Genéralo:  python3 scripts/puente/sincronizar-ides.py")
        return
    sys.stdout.write(open(p, encoding="utf-8").read())


def main():
    a = sys.argv[1:] or ["estado"]
    c = a[0]
    if c == "estado": cmd_estado()
    elif c == "agentes": cmd_agentes()
    elif c == "olas": cmd_olas(a[1] if len(a) > 1 else 6)
    elif c == "cola":
        cola, _, mt = cola_viva()
        print(cola or "sin cola viva")
    elif c == "aprobar": return orden("aprobar", a[1:])
    elif c == "rechazar": return orden("rechazar", a[1:])
    elif c == "soltar": return orden("soltar", a[1:], {"donde": "agentes-ia"})
    elif c == "reasignar":
        if len(a) < 3: print("uso: reasignar <id> <modelo>"); return 1
        return orden("reasignar", [a[1]], {"modelo": a[2]})
    elif c == "puertas": cmd_puertas()
    elif c == "briefing": cmd_briefing()
    else:
        print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
