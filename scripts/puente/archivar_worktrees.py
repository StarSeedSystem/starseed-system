#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Archivar y podar worktrees de tareas TERMINADAS que git no deja quitar (2026-10-20).

POR QUÉ. Medido el 2026-10-19 18:14 (hora de la Mac): 2,2 GB libres en disco (99 %),
71 worktrees en `~/Documents/starseed-wt/` (9,6 GB). La higiene horaria
(`higiene_worktrees.py`) elige 26 de tareas ya en `commit`/`sustituida`, pero los 26
tienen cambios sin guardar y git se niega a quitarlos sin `--force` (bien: así nadie
pierde trabajo). Resultado: 4,78 GB que no se liberan nunca.

QUÉ HACE. Para cada uno de esos worktrees guarda TODO lo que tiene sin guardar (cambios
y archivos nuevos; lo ignorado por .gitignore, como `.next`, no) en una rama local nueva
`archivo-wt/<tarea>` y comprueba que el worktree queda limpio. Con `--aplicar`, después
llama a la poda de siempre (`higiene_worktrees.podar`, sin `--force`). Nada se pierde:
`git switch archivo-wt/<tarea>` lo recupera entero. Las ramas `archivo-wt/*` no se
publican.

  python3 scripts/puente/archivar_worktrees.py            # solo cuenta (no toca nada)
  python3 scripts/puente/archivar_worktrees.py --aplicar  # archiva y poda
"""
import datetime, fcntl, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import higiene_worktrees as H  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
WT = os.environ.get("STARSEED_WT") or os.path.join(os.path.dirname(RAIZ), "starseed-wt")
AUTOR = ["-c", "user.name=Alex Bordón Garrigós", "-c", "user.email=alexbordongarrigos@gmail.com"]


def git(ruta, *args, timeout=60):
    r = subprocess.run(["git", "-C", ruta] + AUTOR + list(args),
                       capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def sucio(ruta):
    """Cuántas entradas tiene `git status --porcelain` (cambios y archivos nuevos)."""
    rc, out = git(ruta, "status", "--porcelain")
    return -1 if rc else len([l for l in out.splitlines() if l.strip()])


def nombre_rama(nombre, existentes, hoy):
    """PURA: `archivo-wt/<tarea>`; si ya existe, `archivo-wt/<tarea>-<hoy>[-n]`."""
    base = "archivo-wt/" + nombre
    if base not in existentes:
        return base
    cand, n = "%s-%s" % (base, hoy), 2
    while cand in existentes:
        cand, n = "%s-%s-%d" % (base, hoy, n), n + 1
    return cand


def archivar(ruta, nombre, hoy):
    """Guarda lo sin guardar en una rama nueva. Devuelve (ok, rama o motivo)."""
    _, ramas = git(ruta, "for-each-ref", "--format=%(refname:short)", "refs/heads/archivo-wt/")
    rama = nombre_rama(nombre, set(ramas.split()), hoy)
    for paso in (["switch", "-q", "-c", rama], ["add", "-A"],
                 ["commit", "-q", "--no-verify", "-m",
                  "archivo-wt: trabajo sin integrar de %s, guardado antes de podar (%s)" % (nombre, hoy)]):
        rc, out = git(ruta, *paso, timeout=300)
        if rc:
            return False, "%s: %s" % (paso[0], out.strip()[:160])
    return (sucio(ruta) == 0), rama


def tamano_mb(ruta):
    try:
        out = subprocess.run(["du", "-sk", ruta], capture_output=True, text=True, timeout=60).stdout
        return int(out.split()[0]) // 1024
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return 0


def main(argv):
    aplicar = "--aplicar" in argv
    elegidos = H.podar(RAIZ, WT, simular=True, decir=False)
    sucios = [n for n in elegidos if sucio(os.path.join(WT, n)) > 0]
    mb = sum(tamano_mb(os.path.join(WT, n)) for n in elegidos)
    print("terminadas: %d · con cambios sin guardar: %d · ocupan %.2f GB"
          % (len(elegidos), len(sucios), mb / 1024.0))
    if not aplicar:
        print("(solo cuenta; para archivar y podar: --aplicar)")
        return 0
    hoy = datetime.date.today().isoformat()
    hechos = []
    os.makedirs(os.path.dirname(H.CERROJO), exist_ok=True)
    with open(H.CERROJO, "w") as cerrojo:
        fcntl.flock(cerrojo, fcntl.LOCK_EX)  # espera a que el integrador suelte main
        for n in sucios:
            ok, rama = archivar(os.path.join(WT, n), n, hoy)
            print(("archivado  %s → %s" if ok else "SE QUEDA   %s (%s)") % (n, rama))
            if ok:
                hechos.append({"tarea": n, "rama": rama})
    reg = os.path.join(RAIZ, "starseed_memory_root", "olas", "archivo-worktrees.jsonl")
    with open(reg, "a", encoding="utf-8") as f:
        for h in hechos:
            f.write(json.dumps(dict(h, fecha=hoy), ensure_ascii=False) + "\n")
    quitados = H.podar(RAIZ, WT, decir=False)
    print("podados: %d · archivados: %d" % (len(quitados or []), len(hechos)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
