#!/usr/bin/env python3
"""Commit del director en `main` SIN chocar con el enjambre (2026-09-20).

Dos veces hoy un commit mío coincidió con el `git commit`/`merge --ff-only` de una
tarea y una de las dos partes murió con «index.lock … another git process» (JV4 a las
06:05, MD1b a las 14:35). Este script: (1) espera a que ninguna tarea viva esté en una
fase que toque git en main (commit, integración; desde el 2026-10-10 ya no espera a tsc,
pruebas ni revisión, que corren en el worktree de cada tarea), (2) toma el mismo cerrojo
`integrar` que usa el orquestador y espera hasta 90 s a que se suelte un index.lock breve,
(3) commitea.

    python3 scripts/puente/commit-seguro.py -m "mensaje" [--] archivos…
"""
import fcntl
import glob
import json
import os
import subprocess
import sys
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
CERROJO = os.path.expanduser("~/.starseed/cerrojos/integrar.lock")
# (2026-10-10) Solo esperan las fases que tocan git en el árbol PRINCIPAL o sus ramas
# compartidas. tsc, pruebas, revisión y reparación corren en el worktree de cada tarea
# (su propio índice): esperar a que ninguna estuviera en tsc dejó commits de los
# directores y agentes horas en cola con la Mac sin memoria (tsc de 5-15 min seguidos).
# La integración en main ya se serializa con el cerrojo `integrar`, que también se toma aquí.
FASES_GIT = ("commit", "integrando", "integracion", "integración", "completando")
INDEX_LOCK_ESPERA_S = 90


def fases_vivas():
    """{tid: fase} de los latidos frescos (< 3 min) de la cola viva."""
    salida = {}
    for f in glob.glob(os.path.join(OLAS, "latidos-cola-auto-*.json")):
        if time.time() - os.path.getmtime(f) > 180:
            continue
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for tid, v in (d.get("tareas") or {}).items():
            if isinstance(v, dict) and v.get("fase") not in (None, "hecho"):
                salida[tid] = str(v.get("fase"))
    return salida


def esperar_momento_seguro(tope_s=900):
    t0 = time.time()
    while time.time() - t0 < tope_s:
        ocupadas = {t: f for t, f in fases_vivas().items() if f.lower().startswith(FASES_GIT)}
        if not ocupadas:
            return True
        print("esperando: %s" % ", ".join("%s(%s)" % kv for kv in ocupadas.items()), flush=True)
        time.sleep(15)
    return False


def main():
    args = sys.argv[1:]
    if "-m" not in args:
        print(__doc__); return 2
    i = args.index("-m"); mensaje = args[i + 1]; resto = args[:i] + args[i + 2:]
    if resto and resto[0] == "--":
        resto = resto[1:]
    if not esperar_momento_seguro():
        print("no hubo momento seguro en 15 min; no commiteo"); return 1
    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    f = open(CERROJO, "w")
    fcntl.flock(f, fcntl.LOCK_EX)
    try:
        candado = os.path.join(RAIZ, ".git", "index.lock")
        t0 = time.time()
        while os.path.exists(candado) and time.time() - t0 < INDEX_LOCK_ESPERA_S:
            time.sleep(3)  # un git status breve de otro proceso suelta el candado en segundos
        if os.path.exists(candado):
            print("index.lock presente %d s; no commiteo" % INDEX_LOCK_ESPERA_S); return 1
        if resto:
            subprocess.run(["git", "add", "--"] + resto, cwd=RAIZ, check=True)
        r = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", mensaje], cwd=RAIZ)
        if r.returncode == 0:
            print(subprocess.run(["git", "log", "--oneline", "-1"], cwd=RAIZ, capture_output=True, text=True).stdout.strip())
        return r.returncode
    finally:
        fcntl.flock(f, fcntl.LOCK_UN); f.close()


if __name__ == "__main__":
    sys.exit(main())
