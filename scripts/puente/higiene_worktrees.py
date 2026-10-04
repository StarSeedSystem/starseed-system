#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Higiene de worktrees: poda los de tareas YA integradas (`commit`/`sustituida`).

POR QUÉ. 2026-10-04: la Mac quedó con 656 MB libres; `~/Documents/starseed-wt/` juntó
101 worktrees (5,6 GB). La limpieza del orquestador está apagada a propósito («ni un
fallo ni un cierre eliminan trabajo del agente»), así que lo hace el vigilante, cada
hora, SOLO sobre tareas en estado terminal y JAMÁS con `--force`: si git se niega, el
worktree se conserva.

  python3 scripts/puente/higiene_worktrees.py            # poda
  python3 scripts/puente/higiene_worktrees.py --simular  # solo lista
"""

import json, os, re, subprocess, sys

FIN = {"commit", "sustituida"}

#: Cerrojo del integrador: si está ocupado no podamos esta vuelta (y no esperamos).
CERROJO = os.path.expanduser("~/.starseed/cerrojos/integrar.lock")


def candidatos(progreso, nombres, lineas_ps):
    """PURA: carpetas con tarea en estado FIN y sin proceso que las mencione.

    `starseed-wt/<nombre>` solo cuenta seguido de fin de línea o de un carácter que no
    sea letra, dígito, `_` o `-`: así `SP09291` no se confunde con `SP092910`. Un nombre
    sin entrada en `progreso` no es candidato."""
    salen = []
    for nombre in sorted(nombres):
        if not nombre or nombre[0] in "_.":
            continue
        entrada = progreso.get(nombre)
        if not isinstance(entrada, dict) or entrada.get("estado") not in FIN:
            continue
        patron = re.compile(
            r"starseed-wt/" + re.escape(nombre) + r"(?:$|[^A-Za-z0-9_-])"
        )
        if any(patron.search(l or "") for l in lineas_ps):
            continue
        salen.append(nombre)
    return salen


def _procesos():
    # `-axo args=` y nunca `-E`: el entorno lleva secretos.
    r = subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True)
    return r.stdout.splitlines()


def podar(raiz, wt_base, simular=False, decir=True):
    """Quita los worktrees candidatos (sin --force). Devuelve los quitados."""
    ruta_p = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
    try:
        with open(ruta_p, encoding="utf-8") as f:
            progreso = json.load(f)
        if not isinstance(progreso, dict):
            progreso = {}
    except (OSError, ValueError):
        progreso = {}
    nombres = [
        d
        for d in os.listdir(wt_base)
        if os.path.isdir(os.path.join(wt_base, d))
        and not os.path.islink(os.path.join(wt_base, d))
    ]
    elegidos = candidatos(progreso, nombres, _procesos())
    if simular:
        return elegidos
    import fcntl

    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    quitados, negados = [], 0
    with open(CERROJO, "w") as cerrojo:
        try:
            fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return []
        for nombre in elegidos:
            ruta = os.path.join(wt_base, nombre)
            r = subprocess.run(
                ["git", "worktree", "remove", ruta],
                cwd=raiz,
                capture_output=True,
                text=True,
            )
            if r.returncode == 0:
                quitados.append(nombre)
            else:
                negados += 1
        subprocess.run(["git", "worktree", "prune"], cwd=raiz, capture_output=True)
    if quitados and decir:
        try:
            import puente

            puente.decir(
                "higiene: %d worktrees podados (git se negó en %d y se conservan)"
                % (len(quitados), negados),
                quien="higiene",
                tipo="hecho",
            )
        except Exception:
            pass
    return quitados


def main():
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    wt_base = os.environ.get("STARSEED_WT") or os.path.join(
        os.path.dirname(raiz), "starseed-wt"
    )
    if "--simular" in sys.argv:
        print("\n".join(podar(raiz, wt_base, simular=True)) or "nada que podar")
    else:
        print("higiene: %d worktrees podados" % len(podar(raiz, wt_base)))


if __name__ == "__main__":
    main()
