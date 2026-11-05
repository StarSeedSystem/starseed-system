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

#: (SUP0511B, 05-11) Una tarea con latido reciente y fase abierta en `olas/latidos-*.json` es de un
#: orquestador que sigue con ella, diga lo que diga `progreso.json`. Medido el 05-11 (vigía de la
#: supervisión, cada 3 s): VER1105A desapareció a las 01:27:58 y SUP0411J a las 01:47:02, las dos
#: «en_curso» en `progreso.json` un instante después; VER1105A acabó «commit» traída de la nube
#: mientras la tanda local también la corría. Una tarea corrida en dos sitios puede salir «commit»
#: o «sustituida» por la otra vía mientras el orquestador local sigue en sus puertas; tras el commit
#: «salvavidas» el worktree está limpio y, esperando el veredicto de GitHub, ningún proceso nombra su
#: carpeta: sin esta guarda, la higiene la daba por cerrada y `git worktree remove` la quitaba bajo
#: el orquestador («[Errno 2] No such file or directory: '…/starseed-wt/<ID>'»). Además `podar`
#: relee el estado justo antes de quitar cada una: la lectura del principio puede ser vieja.
LATIDO_VIVO_S = 6 * 3600
FASES_CERRADAS = {"hecho"}


def tareas_que_laten(olas, ahora=None):
    """Ids con latido reciente (menos de LATIDO_VIVO_S) y fase abierta en `olas/latidos-*.json`.

    Nunca lanza: un archivo ilegible no protege nada (la relectura de `podar` sigue en pie)."""
    import glob
    import time

    ahora = time.time() if ahora is None else ahora
    vivas = set()
    for ruta in glob.glob(os.path.join(olas, "latidos-*.json")):
        try:
            if ahora - os.path.getmtime(ruta) > LATIDO_VIVO_S:
                continue
            with open(ruta, encoding="utf-8") as f:
                tareas = (json.load(f) or {}).get("tareas") or {}
        except (OSError, ValueError, AttributeError):
            continue
        if not isinstance(tareas, dict):
            continue
        for tid, latido in tareas.items():
            if not isinstance(latido, dict) or latido.get("fase") in FASES_CERRADAS:
                continue
            marcas = [v for v in (latido.get("avance"), latido.get("desde"))
                      if isinstance(v, (int, float)) and not isinstance(v, bool)]
            if marcas and ahora - max(marcas) > LATIDO_VIVO_S:
                continue
            vivas.add(str(tid))
    return vivas


def _leer_progreso(ruta):
    """`progreso.json` como dict; {} si no se puede leer entero (nadie sale con {})."""
    try:
        with open(ruta, encoding="utf-8") as f:
            progreso = json.load(f)
        return progreso if isinstance(progreso, dict) else {}
    except (OSError, ValueError):
        return {}


def candidatos(progreso, nombres, lineas_ps, vivas=()):
    """PURA: carpetas con tarea en estado FIN, sin proceso que las mencione y sin latido vivo.

    `starseed-wt/<nombre>` solo cuenta seguido de fin de línea o de un carácter que no
    sea letra, dígito, `_` o `-`: así `SP09291` no se confunde con `SP092910`. Un nombre
    sin entrada en `progreso` no es candidato; uno en `vivas` (ver `tareas_que_laten`), tampoco."""
    vivas = set(vivas or ())
    salen = []
    for nombre in sorted(nombres):
        if not nombre or nombre[0] in "_." or nombre in vivas:
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
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    ruta_p = os.path.join(olas, "progreso.json")
    progreso = _leer_progreso(ruta_p)
    nombres = [
        d
        for d in os.listdir(wt_base)
        if os.path.isdir(os.path.join(wt_base, d))
        and not os.path.islink(os.path.join(wt_base, d))
    ]
    elegidos = candidatos(progreso, nombres, _procesos(), tareas_que_laten(olas))
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
            # (SUP0511B) Cada `git worktree remove` puede tardar minutos con la Mac cargada: lo leído
            # al principio puede ser viejo. Justo antes de quitarla se vuelve a mirar todo (estado,
            # procesos y latidos) y, si ya no es candidata, se conserva.
            if not candidatos(_leer_progreso(ruta_p), [nombre], _procesos(), tareas_que_laten(olas)):
                continue
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
