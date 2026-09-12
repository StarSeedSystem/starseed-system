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
  starseed-puente integrada <id> [...]   # avisa: esa tarea YA esta en main
  starseed-puente chats                  # cual es el chat PRINCIPAL de cada entorno
  starseed-puente chat <entorno>         # abre/retoma ese chat principal
  starseed-puente decir "<texto>"        # habla en el canal comun de los 4 entornos
  starseed-puente mensajes [n]           # las ultimas n cosas dichas
  starseed-puente escuchar               # sigue el canal EN VIVO (chat principal)
  starseed-puente briefing               # el texto para pegar en un chat nuevo
"""
import json, os, socket, subprocess, sys, time, urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
MANDO = os.environ.get("STARSEED_MANDO_URL") or "http://127.0.0.1:9002"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")


def api(ruta, espera=25, intentos=3):
    """Pregunta al Mando, con paciencia y sin mentir.

    Esta Mac trabaja con el enjambre encima y a veces con `load` por encima de 13: una
    consulta que normalmente tarda 20 ms puede tardar segundos. Con un solo intento y 8 s
    de plazo, el CLI declaraba «Mando APAGADO» con el Mando perfectamente vivo, y eso es
    justo lo que los cuatro chats repetían. Ahora reintenta y distingue las dos cosas:
    no responder a tiempo NO es estar apagado."""
    ultimo = None
    for i in range(intentos):
        try:
            with urllib.request.urlopen("%s/api/mando/%s" % (MANDO, ruta), timeout=espera) as r:
                return json.load(r)
        except Exception as e:
            ultimo = e
            if i + 1 < intentos:
                time.sleep(1.5)
    lento = isinstance(ultimo, (TimeoutError, socket.timeout)) or "timed out" in str(ultimo)
    return {"_error": "%s: %s" % (type(ultimo).__name__, ultimo), "_lento": lento}


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


# ── canal compartido: un solo hilo de mensajes para los cuatro entornos ──────
# Todo lo que se dice —resultados, avances, avisos, comentarios— va aquí, y aquí
# lo lee el chat principal de cada IDE. No hay un feed por entorno: hay UNO.
CANAL = os.path.join(RAIZ, "starseed_memory_root", "mando", "canal.jsonl")


def _quien():
    return os.environ.get("STARSEED_QUIEN") or os.environ.get("STARSEED_IDE") or "puente"


def decir(texto, quien=None, tipo="mensaje", tarea=None):
    """Escribe una línea en el canal. Append puro: nadie pisa a nadie."""
    os.makedirs(os.path.dirname(CANAL), exist_ok=True)
    fila = {"t": time.strftime("%Y-%m-%d %H:%M:%S"), "epoch": time.time(),
            "quien": quien or _quien(), "tipo": tipo, "texto": texto}
    if tarea:
        fila["tarea"] = tarea
    with open(CANAL, "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    return fila


def _pinta(f):
    marca = {"error": "✗", "aviso": "!", "hecho": "✓", "mensaje": "·"}.get(f.get("tipo"), "·")
    tarea = (" [%s]" % f["tarea"]) if f.get("tarea") else ""
    return "%s %s %-16s%s %s" % (f.get("t", "")[11:], marca, f.get("quien", "?"), tarea, f.get("texto", ""))


def cmd_mensajes(n=30):
    try:
        lineas = open(CANAL, encoding="utf-8").read().splitlines()
    except Exception:
        print("Canal vacío. Escribe el primero:  starseed-puente decir \"hola\""); return
    for l in lineas[-int(n):]:
        try:
            print(_pinta(json.loads(l)))
        except Exception:
            pass


def cmd_escuchar():
    """Sigue el canal en vivo. Es lo que deja el chat principal de cada IDE
    sincronizado en tiempo real con lo que dicen los demás."""
    os.makedirs(os.path.dirname(CANAL), exist_ok=True)
    open(CANAL, "a", encoding="utf-8").close()
    print("Escuchando el canal (Ctrl-C para salir) — %s\n" % CANAL)
    with open(CANAL, encoding="utf-8") as f:
        for l in f.read().splitlines()[-15:]:
            try: print(_pinta(json.loads(l)))
            except Exception: pass
        f.seek(0, os.SEEK_END)
        while True:
            l = f.readline()
            if not l:
                time.sleep(1); continue
            try: print(_pinta(json.loads(l)), flush=True)
            except Exception: pass


# ── el chat PRINCIPAL de cada entorno ───────────────────────────────────────
# Al abrir un IDE aparecen muchos hilos de tarea y no se distingue cuál es el
# puesto de mando. Aquí está apuntado, con nombre fijo y con la orden exacta
# para volver a él. Los hilos de tarea se llaman «ola/<id> · …» y no se apuntan:
# el prefijo ya los separa.
# Vive en el REPOSITORIO, no en starseed_memory_root: esa carpeta no se versiona y muere
# con la maquina, y este registro tiene que viajar con el proyecto a cualquier entorno.
CHATS = os.path.join(RAIZ, "scripts", "puente", "chats.json")
_CHATS_LOCAL = os.path.join(RAIZ, "starseed_memory_root", "mando", "chats.json")


def _chats():
    """El del repositorio manda; el local solo si alguien lo puso a mano."""
    for ruta in (CHATS, _CHATS_LOCAL):
        try:
            return json.load(open(ruta, encoding="utf-8"))
        except Exception:
            continue
    return {}


def cmd_chats():
    d = _chats()
    if not d:
        print("No hay registro de chats en %s" % CHATS); return
    print("CHAT PRINCIPAL en cada entorno · se llama siempre «%s»" % d.get("nombre_canonico", ""))
    print("Los hilos de tarea llevan el prefijo «%s» y no se confunden con él.\n" % d.get("prefijo_tareas", "ola/"))
    for clave, e in (d.get("entornos") or {}).items():
        print("%-12s %s" % (clave, e.get("producto", "")))
        print("             proyecto: %s" % e.get("proyecto", "—"))
        print("             volver:   %s" % e.get("como_volver", "—"))
        if e.get("nota"):
            print("             nota:     %s" % e["nota"])
        print()


def cmd_chat(cual):
    e = (_chats().get("entornos") or {}).get(cual)
    if not e:
        print("No conozco «%s». Los que hay: %s" % (cual, ", ".join((_chats().get("entornos") or {}))))
        return 1
    orden = e.get("como_volver") or ""
    print("%s · %s" % (cual, e.get("producto", "")))
    if not orden or orden.startswith("Abre ") or orden.startswith("El bot"):
        print(orden or "sin orden registrada"); return 0
    print("→ %s\n" % orden)
    return subprocess.call(orden, shell=True)


def cmd_integrada(ids, sha=""):
    """Avisa al orquestador de que una tarea YA esta en main.

    Cuando un agente de un IDE escribe una tarea y la integramos por fuera, el
    orquestador no se entera: la vuelve a intentar, encuentra el codigo ya puesto,
    la anota «sin cambios» y con eso BLOQUEA a todas las que dependian de ella.
    Paso de verdad: 15 de 16 tareas de una cola ya estaban en main y el enjambre
    se quedo sin trabajo real creyendo que habia fallado.
    Regla: integrar por fuera y no decirlo aqui es dejar el enjambre a ciegas."""
    ruta = os.path.join(OLAS, "progreso.json")
    try:
        d = json.load(open(ruta, encoding="utf-8"))
    except Exception:
        d = {}
    for i in ids:
        d[i] = {"estado": "commit", "sha": sha or "integrada-fuera-del-orquestador",
                "modelo": _quien(), "nota": "integrada en main desde un IDE",
                "t": time.strftime("%Y-%m-%d %H:%M:%S")}
    json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    decir("integradas en main: %s" % ", ".join(ids), None, "hecho")
    print("Marcadas como integradas: %s\nEl enjambre ya no las reintenta ni bloquea a sus dependientes."
          % ", ".join(ids))


def cmd_estado():
    e = api("estado")
    if "_error" in e:
        if e.get("_lento"):
            print("Mando VIVO pero lento: no contestó en 25 s tras 3 intentos.")
            print("No está apagado; la máquina está saturada. Mira quién come CPU:")
            print("  ps -eo pid,%cpu,rss,comm -r | head -5")
        else:
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
    # El orquestador construye el nombre con splitext(): «cola-310-…» SIN extension.
    # `cola_viva()` la devuelve CON ella, asi que hay que quitarsela o sale
    # «control-cola-310-….json.json», un archivo que nadie lee nunca. Estuvo asi desde el
    # primer dia: ninguna orden de aprobar, soltar o reasignar llego al vigilante.
    ruta = os.path.join(OLAS, "control-%s.json" % (cola[:-5] if cola.endswith(".json") else cola))
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
    aviso = "orden «%s» → %s" % (accion, ", ".join(ids))
    if extra: aviso += " (%s)" % ", ".join("%s=%s" % kv for kv in extra.items())
    decir(aviso, quien, "aviso")
    print("Orden «%s» escrita para %s en %s.\nEl vigilante la recoge en menos de 20 s.\nAnunciada en el canal: la ven los cuatro entornos."
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
    elif c == "decir":
        if len(a) < 2: print('uso: decir "<texto>" [--de <quien>] [--tipo aviso|hecho|error] [--tarea <id>]'); return 1
        texto = a[1]
        de = a[a.index("--de") + 1] if "--de" in a else None
        tipo = a[a.index("--tipo") + 1] if "--tipo" in a else "mensaje"
        tarea = a[a.index("--tarea") + 1] if "--tarea" in a else None
        print(_pinta(decir(texto, de, tipo, tarea)))
    elif c == "mensajes": cmd_mensajes(a[1] if len(a) > 1 else 30)
    elif c == "escuchar": cmd_escuchar()
    elif c == "integrada":
        if len(a) < 2: print("uso: integrada <id> [<id>...] [--sha <sha>]"); return 1
        sha = a[a.index("--sha") + 1] if "--sha" in a else ""
        ids = [x for x in a[1:] if not x.startswith("--") and x != sha]
        cmd_integrada(ids, sha)
    elif c == "chats": cmd_chats()
    elif c == "chat":
        if len(a) < 2: cmd_chats(); return 0
        return cmd_chat(a[1])
    elif c == "puertas": cmd_puertas()
    elif c == "briefing": cmd_briefing()
    else:
        print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
