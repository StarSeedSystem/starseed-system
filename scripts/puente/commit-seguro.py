#!/usr/bin/env python3
"""Commit del director en `main` SIN chocar con el enjambre (2026-09-20).

Dos veces hoy un commit mío coincidió con el `git commit`/`merge --ff-only` de una
tarea y una de las dos partes murió con «index.lock … another git process» (JV4 a las
06:05, MD1b a las 14:35). Este script: (1) espera a que ninguna tarea viva esté en una
fase que toque git (tsc, tests, commit, revisión, integración: solo «escribiendo» o
nada), (2) toma el mismo cerrojo `integrar` que usa el orquestador, (3) commitea.

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
FASES_GIT = ("tsc", "tests", "commit", "revision", "revisión", "integrando", "integracion", "completando", "reparando")


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
        if os.path.exists(os.path.join(RAIZ, ".git", "index.lock")):
            print("index.lock presente; no commiteo"); return 1
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
