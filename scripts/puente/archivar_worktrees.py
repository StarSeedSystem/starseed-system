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
import datetime, fcntl, json, os, re, subprocess, sys

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


def a_medias(ruta):
    """PURA de solo-lectura: (tipo, sha) si hay un cherry-pick o un revert a medias, si no None.

    (SUP0811J, 08-11) El integrador hace `cherry-pick -n` de VARIOS commits: git guarda lo que falta
    en `sequencer/` y, con --no-commit, NO escribe CHERRY_PICK_HEAD. `switch` se niega igual
    («cannot switch branch while cherry-picking»), así que el estado del secuenciador también cuenta;
    el tipo y el sha salen de la primera línea de `sequencer/todo` (la orden que quedó a medias)."""
    for tipo, ref in (("cherry-pick", "CHERRY_PICK_HEAD"), ("revert", "REVERT_HEAD")):
        rc, out = git(ruta, "rev-parse", "-q", "--verify", ref)
        if rc == 0 and out.strip():
            return tipo, out.strip()
    rc, out = git(ruta, "rev-parse", "--git-path", "sequencer")
    sec = out.strip().splitlines()[0].strip() if rc == 0 and out.strip() else ""  # stdout va delante
    if not sec:
        return None
    sec = sec if os.path.isabs(sec) else os.path.join(ruta, sec)
    if not os.path.isdir(sec):
        return None
    tipo, sha = "cherry-pick", "?"
    try:
        with open(os.path.join(sec, "todo"), encoding="utf-8", errors="replace") as f:
            for linea in f:
                partes = linea.split()
                if len(partes) >= 2 and not partes[0].startswith("#"):
                    tipo = "revert" if partes[0] == "revert" else "cherry-pick"
                    sha = partes[1]
                    break
    except OSError:
        pass
    return tipo, sha


def _sin_lo_grande(ruta):
    """GUA1113A: lo que pasa del tope por archivo o es salida de build NO entra en la rama de archivo.
    Sale del índice pero sigue en el disco, así que `sucio()` lo sigue contando y el worktree NO se
    poda: nada se pierde, lo decide una persona. Si el módulo falta, no hace nada."""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "enjambre"))
        import guardia_disco as GD

        def _sh(cmd, cwd=None, timeout=120, env=None, **_):
            rc, out = git(cwd or ruta, *cmd[1:], timeout=timeout)
            return rc, out

        GD.filtrar_indice(_sh, ruta, tid=os.path.basename(ruta))
    except Exception:
        pass


def archivar(ruta, nombre, hoy):
    """Guarda lo sin guardar en una rama nueva. Devuelve (ok, rama o motivo)."""
    _, ramas = git(ruta, "for-each-ref", "--format=%(refname:short)", "refs/heads/archivo-wt/")
    rama = nombre_rama(nombre, set(ramas.split()), hoy)
    medias = a_medias(ruta)
    mensaje = "archivo-wt: trabajo sin integrar de %s, guardado antes de podar (%s)" % (nombre, hoy)
    pasos = []
    if medias:
        pasos.append([medias[0], "--quit"])  # deja el árbol y el índice como estaban, conflictos incluidos
        pasos.append(["add", "-A"])  # los archivos en conflicto se guardan tal cual, con sus marcas
        mensaje += " · estaba a mitad del %s de %s" % medias
    pasos += [["switch", "-q", "-c", rama], ["add", "-A"],
              ["commit", "-q", "--no-verify", "-m", mensaje]]
    for paso in pasos:
        rc, out = git(ruta, *paso, timeout=300)
        if rc:
            return False, "%s: %s" % (paso[0], out.strip()[:160])
        if paso[:1] == ["add"]:
            _sin_lo_grande(ruta)  # GUA1113A
    return (sucio(ruta) == 0), rama


def tamano_mb(ruta):
    try:
        out = subprocess.run(["du", "-sk", ruta], capture_output=True, text=True, timeout=60).stdout
        return int(out.split()[0]) // 1024
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return 0


#: (DIR1126F, 26-11) Estados en los que ningún agente de ESTA Mac usa ya el worktree: la tarea
#: vuelve a crear el suyo si la retoma, y su rama `ola/<tarea>` no se toca. Medido el 26-11: cada
#: intento fallido vuelve a «pendiente» y el orquestador conserva su worktree (~170 MB,
#: `limpiar_worktree` está en contención), así que 30 intentos rápidos llenaron el disco y la
#: guardia de 10 GB paró el enjambre dos veces en la tarde.
ESTADOS_LIBERABLES = {"pendiente", "reasignada", "rechazada", "integrada", "commit", "sustituida"}


def liberables(progreso, nombres, lineas_ps, vivas, edades, min_edad_s=600):
    """PURA: worktrees que se pueden archivar y podar sin quitarle nada a nadie.

    Fuera: los que empiezan por `_`/`.`, los que laten (`vivas`), los que no están en un estado
    liberable, los más nuevos que `min_edad_s` (un arranque en curso aún no ha latido) y los
    que algún proceso nombra."""
    salen = []
    for nombre in sorted(nombres):
        if not nombre or nombre[0] in "_." or nombre in vivas:
            continue
        entrada = progreso.get(nombre)
        if not isinstance(entrada, dict) or entrada.get("estado") not in ESTADOS_LIBERABLES:
            continue
        if edades.get(nombre, 0) < min_edad_s:
            continue
        patron = re.compile(r"starseed-wt/" + re.escape(nombre) + r"(?:$|[^A-Za-z0-9_-])")
        if any(patron.search(l or "") for l in lineas_ps):
            continue
        salen.append(nombre)
    return salen


def liberar_no_vivas(min_edad_s=600, decir=print):
    """(DIR1126F) Archiva lo sin guardar en `archivo-wt/<tarea>` y poda los worktrees liberables."""
    import time

    olas = os.path.join(RAIZ, "starseed_memory_root", "olas")
    progreso = H._leer_progreso(os.path.join(olas, "progreso.json"))
    nombres = [d for d in os.listdir(WT) if os.path.isdir(os.path.join(WT, d))
               and not os.path.islink(os.path.join(WT, d))]
    ahora = time.time()
    edades = {}
    for d in nombres:
        try:
            edades[d] = ahora - os.path.getmtime(os.path.join(WT, d))
        except OSError:
            edades[d] = 0
    elegidos = liberables(progreso, nombres, H._procesos(), H.tareas_que_laten(olas), edades, min_edad_s)
    if not elegidos:
        return []
    hoy = datetime.date.today().isoformat()
    hechos, podados = [], []
    os.makedirs(os.path.dirname(H.CERROJO), exist_ok=True)
    with open(H.CERROJO, "w") as cerrojo:
        fcntl.flock(cerrojo, fcntl.LOCK_EX)  # espera a que el integrador suelte main
        for n in elegidos:
            ruta = os.path.join(WT, n)
            if sucio(ruta) > 0:
                ok, rama = archivar(ruta, n, hoy)
                if not ok:
                    decir("SE QUEDA   %s (%s)" % (n, rama))
                    continue
                hechos.append({"tarea": n, "rama": rama, "fecha": hoy})
            rc, out = git(RAIZ, "worktree", "remove", ruta, timeout=600)
            if rc == 0:
                podados.append(n)
            else:
                decir("no podado %s: %s" % (n, out.strip()[:120]))
    if hechos:
        with open(os.path.join(olas, "archivo-worktrees.jsonl"), "a", encoding="utf-8") as f:
            for h in hechos:
                f.write(json.dumps(h, ensure_ascii=False) + "\n")
    return podados


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
