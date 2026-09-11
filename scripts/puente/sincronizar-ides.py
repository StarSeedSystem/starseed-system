#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenera PUENTE-DE-MANDO.md desde el Mando VIVO y lo reparte a los cuatro IDE.

No copia estado a mano: lee localhost:9002 y el latido en disco, escribe UN documento
canónico en la raíz del repo, y deja en cada IDE un puntero a ese mismo archivo. Así
Claude, Codex, Hermes y Antigravity abren su chat con el mismo contexto y el mismo
estado, sin que nadie tenga que resumirle nada a nadie.

  python3 scripts/puente/sincronizar-ides.py          # regenera y reparte
  python3 scripts/puente/sincronizar-ides.py --solo   # solo regenera el documento
"""
import json, os, subprocess, sys, time, urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
MANDO = os.environ.get("STARSEED_MANDO_URL") or "http://127.0.0.1:9003"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
DOC = os.path.join(RAIZ, "PUENTE-DE-MANDO.md")


def api(ruta):
    try:
        with urllib.request.urlopen("%s/api/mando/%s" % (MANDO, ruta), timeout=8) as r:
            return json.load(r)
    except Exception as e:
        return {"_error": str(e)}


def git(*a):
    try:
        return subprocess.run(["git", "-C", RAIZ] + list(a), capture_output=True,
                              text=True, timeout=20).stdout.strip()
    except Exception:
        return ""


def latido():
    mejor, mt = None, 0
    try:
        for f in os.listdir(OLAS):
            if f.startswith("latidos-cola-") and f.endswith(".json"):
                m = os.path.getmtime(os.path.join(OLAS, f))
                if m > mt: mejor, mt = f, m
    except Exception:
        pass
    if not mejor: return {}, 0
    try:
        return json.load(open(os.path.join(OLAS, mejor), encoding="utf-8")), mt
    except Exception:
        return {}, mt


def documento():
    e = api("estado")
    lat, mt = latido()
    ahora = time.time()
    vivo = "_error" not in e
    c = (e.get("cuentas") or {}) if vivo else {}
    u = (c.get("ultimas") or {}) if vivo else {}
    L = []
    A = L.append
    A("# Puente de Mando · contexto compartido de los cuatro entornos")
    A("")
    A("> Generado por `scripts/puente/sincronizar-ides.py` el %s desde el Mando vivo."
      % time.strftime("%Y-%m-%d %H:%M:%S"))
    A("> **No lo edites a mano: se regenera.** Lo permanente va en `CLAUDE.md` y en `AGENTS.md`.")
    A("")
    A("Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,")
    A("**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Mando y dan órdenes por el")
    A("mismo canal, así que ninguno necesita que otro le resuma nada.")
    A("")
    A("## Estado ahora mismo")
    A("")
    if vivo:
        A("| | |")
        A("|---|---|")
        A("| Mando | **encendido** en %s/mando |" % MANDO)
        A("| Ola arriba | %s |" % c.get("ola", "—"))
        A("| Agentes escribiendo | **%d** |" % len(e.get("latidos") or []))
        A("| En esta ola | integradas %s · en curso %s · esperando aprobación %s · pendientes %s |"
          % (c.get("integradas"), c.get("enCurso"), c.get("esperandoAprobacion"), c.get("pendientes")))
        A("| Últimas %s olas | en curso %s · pendientes %s · integradas %s |"
          % (u.get("olas"), u.get("enCurso"), u.get("pendientes"), u.get("integradas")))
    else:
        A("El Mando está **apagado**. Levántalo con `bash scripts/puente/arrancar-mando.sh`")
        A("y vuelve a ejecutar este script; sin él los cuatro entornos van a ciegas.")
    A("| HEAD | `%s` |" % git("log", "--oneline", "-1")[:90])
    A("| Sin publicar | %s commits |" % git("rev-list", "--count", "origin/main..main"))
    sucio = git("status", "--porcelain")
    A("| Árbol | %s |" % ("limpio" if not sucio else "%d archivos sin commitear" % len(sucio.splitlines())))
    A("")
    tareas = (lat.get("tareas") or {})
    if tareas:
        A("## Quién escribe ahora (latido de `%s`, hace %ds)"
          % (lat.get("cola", "?"), int(ahora - mt)))
        A("")
        A("| tarea | fase | modelo | lleva | quieto | bytes |")
        A("|---|---|---|---|---|---|")
        for tid, v in sorted(tareas.items(), key=lambda x: -(x[1].get("avance") or 0)):
            A("| `%s` | %s | %s | %.0f min | %.0f s | %d |" % (
                tid, v.get("fase", ""), (v.get("modelo") or "")[:34],
                (ahora - v.get("desde", ahora)) / 60, ahora - v.get("avance", ahora), v.get("bytes", 0)))
        A("")
        A("**Quieto por encima de 300 s con los bytes parados = API colgada, no modelo lento.**")
        A("Suéltala y dásela a un agente del IDE: `starseed-puente soltar <id>`.")
        A("")
    A("## Cómo dirige cada IDE (idéntico en los cuatro)")
    A("")
    A("```")
    A("starseed-puente estado                # foto viva")
    A("starseed-puente agentes               # quién escribe y desde hace cuánto")
    A("starseed-puente aprobar  <id> [...]   # desbloquea la puerta humana")
    A("starseed-puente soltar   <id> [...]   # la tarea pasa a un agente del IDE")
    A("starseed-puente reasignar <id> <modelo>")
    A("starseed-puente puertas               # tsc · vitest · build · sin publicar")
    A("```")
    A("")
    A("Las órdenes se escriben en `starseed_memory_root/olas/control-<cola>.json`, que el")
    A("vigilante del orquestador lee **cada 20 s**. Da igual quién la escriba: es el mismo canal.")
    A("")
    A("## Reglas que valen para los cuatro")
    A("")
    A("- **Un solo orquestador** (`starseed-enjambre.py`) con N trabajadores. Tres procesos a la")
    A("  vez = tres `tsc` simultáneos = la Mac de rodillas. Los AGENTES sí se multiplican: cuantos")
    A("  más, mejor, mientras cada uno trabaje en su propio worktree.")
    A("- **Nunca `next build` con el enjambre vivo.** La Mac es de 8 GB.")
    A("- Tres puertas antes de publicar: `tsc --noEmit`, `vitest run`, `next build` completo.")
    A("- **Nada está hecho hasta que se ve en el Mando de la Mac.**")
    A("- Claves solo en archivos de entorno (`~/.hermes/.env`, `~/.starseed/env`). En el repo,")
    A("  en documentos y en los latidos, solo NOMBRES de variable. En `opencode.json`, `{env:VAR}`.")
    A("- Nunca `amend`, `rebase` ni `force-push` para cambiar autoría.")
    A("- Cada tarea escribe un módulo puro NUEVO y pequeño; el cableado va aparte.")
    A("- Los `id` de tarea son únicos en todo el histórico **y** entre los archivos de cola vivos.")
    A("")
    A("## Dónde está cada cosa")
    A("")
    A("| | |")
    A("|---|---|")
    A("| Repo | `%s` |" % RAIZ)
    A("| Rumbo y reglas permanentes | `CLAUDE.md` (Claude) · `AGENTS.md` (Codex, Antigravity) · `gemini.md` |")
    A("| Estado del enjambre | `starseed_memory_root/olas/` — **no se versiona**, muere con la máquina |")
    A("| Orquestador | `scripts/enjambre/starseed-enjambre.py`, instalado en `~/.local/bin/` |")
    A("| Mando | `%s/mando` — local, `/api/mando/*` devuelve 404 en producción |" % MANDO)
    A("| Publicado | https://starseed-os.vercel.app |")
    A("")
    return "\n".join(L) + "\n"


def repartir(texto):
    destinos = []
    # Codex y Antigravity leen AGENTS.md del repo; Hermes y Claude tienen los suyos.
    # A cada IDE le dejamos un PUNTERO, no una copia: una sola verdad.
    puntero = ("# Puente de Mando · StarSeed\n\n"
               "El contexto y el estado vivos están en un solo sitio, y se regeneran solos:\n\n"
               "    %s\n\n"
               "Ábrelo al empezar cualquier chat. Para refrescarlo:\n\n"
               "    python3 %s/scripts/puente/sincronizar-ides.py\n\n"
               "Para ver y dirigir el enjambre desde esta terminal:\n\n"
               "    starseed-puente estado\n"
               "    starseed-puente agentes\n"
               "    starseed-puente aprobar <id>\n" % (DOC, RAIZ))
    for ruta in (os.path.expanduser("~/.codex/AGENTS.md"),
                 os.path.expanduser("~/.hermes/PUENTE-DE-MANDO.md"),
                 os.path.expanduser("~/.gemini/antigravity/PUENTE-DE-MANDO.md")):
        try:
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            open(ruta, "w", encoding="utf-8").write(puntero)
            destinos.append(ruta)
        except Exception as e:
            destinos.append("%s  (FALLÓ: %s)" % (ruta, e))
    return destinos


if __name__ == "__main__":
    texto = documento()
    open(DOC, "w", encoding="utf-8").write(texto)
    print("Escrito %s (%d líneas)" % (DOC, len(texto.splitlines())))
    if "--solo" not in sys.argv:
        for d in repartir(texto):
            print("  puntero →", d)
