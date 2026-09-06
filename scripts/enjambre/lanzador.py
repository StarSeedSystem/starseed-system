#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lanzador de olas en la nube: escucha en el bus (`relevo_eventos`) las órdenes `lanzar`
FIRMADAS que publica el Puente de Mando de la Mac y arranca aquí el orquestador.

Orden esperada (datos): {donde:"nube", cola:"cola-241-x", workers:2, t:ISO, firma:HMAC, tareas:[…]}
La firma es HMAC-SHA256(STARSEED_LANZADOR_SECRETO, "cola|t"); una orden sin firma válida, con
más de 15 min, o de otra máquina (donde != nube) se ignora y se anota. También atiende `detener`
(mismo esquema) para parar el orquestador de una cola.

Claves y secreto: ~/.starseed/env (chmod 600), nunca en el código."""
import hashlib, hmac, json, os, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

ENV = {}
for ruta in (os.path.expanduser("~/.starseed/env"),):
    try:
        for l in open(ruta, encoding="utf-8"):
            l = l.strip()
            if l and not l.startswith("#") and "=" in l:
                k, v = l.split("=", 1); ENV[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
URL = "https://pqzdpmedcsgcedkvndzl.supabase.co/rest/v1/relevo_eventos"
K = ENV.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SECRETO = ENV.get("STARSEED_LANZADOR_SECRETO", "")
ROOT = os.environ.get("STARSEED_ROOT", "/home/claude/starseed-system")
WT = os.environ.get("STARSEED_WT", "/home/claude/starseed-wt")
OLAS = os.path.join(ROOT, "starseed_memory_root", "olas")
ORQ = os.path.expanduser("~/bin/starseed-enjambre.py")
ULTIMO_TXT = os.path.expanduser("~/.starseed/lanzador-ultimo.txt")

def log(m):
    print("[%s] %s" % (datetime.now(timezone.utc).strftime("%H:%M:%S"), m), flush=True)

def evento(tipo, texto, datos=None):
    try:
        cuerpo = json.dumps({"quien": "lanzador", "tipo": tipo, "tarea": "", "texto": texto[:600],
                             "datos": {**(datos or {}), "donde": "nube", "categoria": "ola"}}, ensure_ascii=False).encode()
        req = urllib.request.Request(URL, data=cuerpo, method="POST",
                                     headers={"apikey": K, "Authorization": "Bearer " + K, "Content-Type": "application/json", "Prefer": "return=minimal"})
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        log("no pude anotar en el bus: %s" % str(e)[:80])

def leer_ultimo():
    try:
        return int(open(ULTIMO_TXT).read().strip())
    except Exception:
        # Primera vez: solo lo que llegue a partir de ahora.
        try:
            u = "%s?select=id&order=id.desc&limit=1" % URL
            r = urllib.request.Request(u, headers={"apikey": K, "Authorization": "Bearer " + K})
            filas = json.loads(urllib.request.urlopen(r, timeout=20).read())
            return int(filas[0]["id"]) if filas else 0
        except Exception:
            return 0

def guardar_ultimo(n):
    try:
        open(ULTIMO_TXT, "w").write(str(n))
    except Exception:
        pass

def pedir(desde):
    u = "%s?select=id,t,quien,tipo,texto,datos&id=gt.%d&tipo=in.(lanzar,detener,control)&order=id.asc&limit=20" % (URL, desde)
    r = urllib.request.Request(u, headers={"apikey": K, "Authorization": "Bearer " + K})
    return json.loads(urllib.request.urlopen(r, timeout=25).read())

def firma_ok(d):
    if not SECRETO:
        return False, "sin STARSEED_LANZADOR_SECRETO en la nube"
    cola, t, firma = d.get("cola", ""), d.get("t", ""), d.get("firma", "")
    esperada = hmac.new(SECRETO.encode(), ("%s|%s" % (cola, t)).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(esperada, str(firma)):
        return False, "firma inválida"
    try:
        edad = (datetime.now(timezone.utc) - datetime.fromisoformat(t.replace("Z", "+00:00"))).total_seconds()
    except Exception:
        return False, "fecha ilegible"
    if abs(edad) > 15 * 60:
        return False, "orden caducada (%d s)" % int(edad)
    return True, ""

def orquestadores_de(cola):
    try:
        out = subprocess.run(["pgrep", "-af", "starseed-enjambre.py"], capture_output=True, text=True).stdout
    except Exception:
        return []
    pids = []
    for l in out.splitlines():
        if cola in l and "pgrep" not in l:
            try: pids.append(int(l.split()[0]))
            except Exception: pass
    return pids

def lanzar(d):
    cola = str(d.get("cola", "")).strip()
    if not cola.startswith("cola-") or "/" in cola or ".." in cola:
        return "nombre de cola no válido"
    workers = max(1, min(4, int(d.get("workers") or 2)))
    tareas = d.get("tareas")
    os.makedirs(OLAS, exist_ok=True)
    ruta = os.path.join(OLAS, cola + ".json")
    if isinstance(tareas, list) and tareas:
        json.dump(tareas, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    elif not os.path.exists(ruta):
        return "la cola no existe aquí y la orden no traía tareas"
    if orquestadores_de(cola):
        return "ya hay un orquestador con esa cola"
    # El repo tiene que estar limpio para que el orquestador arranque.
    sucio = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if sucio:
        return "working tree de main con cambios sin commit: no arranco"
    env = {**os.environ, "STARSEED_ROOT": ROOT, "STARSEED_WT": WT, "STARSEED_DONDE": "nube", "STARSEED_MEDIO": "mando",
           **({"STARSEED_APROBACION": "1"} if d.get("aprobacion") else {}),
           "PATH": os.path.expanduser("~/.npm-global/bin") + ":" + os.path.expanduser("~/bin") + ":" + os.environ.get("PATH", "")}
    log_path = "/tmp/ola-%s.log" % cola.replace("cola-", "")
    with open(log_path, "a") as f:
        subprocess.Popen(["setsid", "python3", ORQ, os.path.join("starseed_memory_root", "olas", cola + ".json"), "--workers", str(workers)],
                         cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
    return ""

def detener(d):
    cola = str(d.get("cola", "")).strip()
    pids = orquestadores_de(cola)
    for p in pids:
        try: os.kill(p, 15)
        except Exception: pass
    return "" if pids else "no había orquestador con esa cola"

def control(d):
    """Orden por tarea (reasignar modelo/API o soltar la tarea hacia otro servidor): se deja en
    `olas/control-<cola>.json`, que el vigilante del orquestador lee cada 20 s. Si no hay
    orquestador con esa cola, un «reasignar» solo anota el modelo en la cola para la próxima."""
    cola = str(d.get("cola", "")).strip()
    tarea = str(d.get("tarea", "")).strip()
    accion = str(d.get("accion") or "reasignar")
    if not cola.startswith("cola-") or "/" in cola or ".." in cola or not tarea.isalnum() or accion not in ("reasignar", "soltar", "aprobar", "rechazar"):
        return "orden de control no válida"
    modelo = str(d.get("modelo") or "").strip()
    if accion == "reasignar" and ("/" not in modelo or any(c in modelo for c in " \t\n\"'`")):
        return "modelo no válido"
    os.makedirs(OLAS, exist_ok=True)
    if not orquestadores_de(cola):
        if accion != "reasignar":
            return "no hay orquestador con esa cola (nada que %s)" % ("soltar" if accion == "soltar" else "decidir: la rama quedó pendiente_aprobacion")
        ruta = os.path.join(OLAS, cola + ".json")
        try:
            tareas = json.load(open(ruta, encoding="utf-8"))
            for t in tareas:
                if t.get("id") == tarea:
                    t["modelo"] = modelo
            json.dump(tareas, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            return ""
        except Exception:
            return "no hay orquestador con esa cola ni cola en disco"
    ruta = os.path.join(OLAS, "control-" + cola + ".json")
    try:
        actual = json.load(open(ruta, encoding="utf-8")) if os.path.exists(ruta) else {}
    except Exception:
        actual = {}
    actual[tarea] = {"accion": accion, "modelo": modelo, "donde": str(d.get("donde_nuevo") or ""), "t": d.get("t"), "quien": "mando"}
    json.dump(actual, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return ""

if not K:
    print("sin NEXT_PUBLIC_SUPABASE_ANON_KEY", file=sys.stderr); sys.exit(1)
ultimo = leer_ultimo()
log("lanzador en marcha desde el evento %d (secreto %s)" % (ultimo, "sí" if SECRETO else "NO"))
while True:
    try:
        for e in pedir(ultimo):
            ultimo = max(ultimo, int(e["id"])); guardar_ultimo(ultimo)
            d = e.get("datos") or {}
            if not isinstance(d, dict) or d.get("donde") != "nube":
                continue
            ok, motivo = firma_ok(d)
            if not ok:
                log("orden %s ignorada: %s" % (e["id"], motivo)); evento("lanzar_rechazado", "%s: %s" % (d.get("cola", "?"), motivo)); continue
            err = lanzar(d) if e["tipo"] == "lanzar" else detener(d) if e["tipo"] == "detener" else control(d)
            if err:
                log("%s %s: %s" % (e["tipo"], d.get("cola"), err)); evento("lanzar_rechazado", "%s: %s" % (d.get("cola", "?"), err))
            elif e["tipo"] == "control":
                log("control %s %s %s OK" % (d.get("cola"), d.get("tarea"), d.get("accion"))); evento("controlada", "%s · %s: %s %s" % (d.get("cola"), d.get("tarea"), d.get("accion"), d.get("modelo") or d.get("donde_nuevo") or ""), {"cola": d.get("cola"), "tarea": d.get("tarea")})
            else:
                log("%s %s OK" % (e["tipo"], d.get("cola"))); evento("lanzada" if e["tipo"] == "lanzar" else "detenida", "%s en la nube (%s trabajadores)" % (d.get("cola"), d.get("workers", "?")), {"cola": d.get("cola")})
    except Exception as ex:
        log("fallo al leer el bus: %s" % str(ex)[:100])
    time.sleep(20)
