"""Rescatar a main el trabajo de ramas de la nube archivadas POR ERROR (2026-10-12).

El 12-10 un revisor dio por integradas 11 tareas que main no tenía (traer_nube hacía cherry-pick en
main y lo deshacía; en ese hueco se leyó `git log main`). Luego `revisar_ramas_nube` las tomó por
«superadas», las archivó en `refs/archivo/nube/…` y las borró del remoto: el trabajo NO se perdió,
pero ya nadie lo iba a traer. Este guion lo trae por el MISMO camino comprobado de `traer_nube._traer`
(carpeta aparte, puertas, main solo avanza si pasa), en el orden que se le da, y deja constancia.

    python3 scripts/puente/rescatar_archivadas.py COL1012A COL1012B …   (en ese orden)
    python3 scripts/puente/rescatar_archivadas.py --seco COL1012A …      (solo dice qué haría)

(2026-10-20) Si ninguna ref se llama como la tarea —ramas con nombre de run o del A1 con varias
tareas—, se busca la que lleva su commit de integración («Ola … · ID: …»).
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import traer_nube as T  # noqa: E402


def ultima_archivada(tid, refs):
    """PURA: la ref archivada más reciente cuyo nombre acaba en `-<tid>` (las del A1) o `/ola/<tid>`."""
    propias = [r for r in refs if r.endswith("-" + tid) or r.endswith("/ola/" + tid)]
    return sorted(propias)[-1] if propias else None


def ref_por_asunto(tid, lineas):
    """PURA: entre líneas «ref\tasunto» (commits de ramas archivadas), la ref más reciente con la
    integración («ola») de `tid`. Para las ramas con nombre de run (`nube/39264258239`) o las del A1
    que llevaban varias tareas (2026-10-20: TIP1013A y CB1013T se archivaron con la de otra tarea)."""
    refs = set()
    for linea in lineas:
        ref, _, asunto = linea.partition("\t")
        if ref and T.tid_de_asunto(asunto) == ("ola", tid):
            refs.add(ref.strip())
    return sorted(refs)[-1] if refs else None


def archivada_por_asunto(tid):
    """La ref archivada que integra `tid` aunque su nombre no lo diga (un solo `git log`)."""
    _, salida = T._git(["log", "--source", "--glob=refs/archivo/nube/*", "--not", "main", "--fixed-strings",
                        "--grep", "· %s: " % tid, "--format=%S\t%s"])
    ref = ref_por_asunto(tid, salida.splitlines())
    return ref[len("refs/"):] if ref and ref.startswith("refs/archivo/") else ref


def fila_de(ref, tid):
    """Los commits de `tid` en `ref` que main no tiene (como `traer_nube.inventario`)."""
    _, cherry = T._git(["cherry", "main", ref])
    nuevos = {l[2:].strip() for l in cherry.splitlines() if l.startswith("+ ")}
    _, log = T._git(["log", "--reverse", "--format=%H\t%s", "main.." + ref])
    commits, sueltos = [], []
    for linea in log.splitlines():
        if "\t" not in linea:
            continue
        sha, asunto = linea.split("\t", 1)
        tipo, de = T.tid_de_asunto(asunto)
        if tipo == "reparto":
            continue
        _, nombres = T._git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha])
        c = {"sha": sha, "asunto": asunto, "tipo": tipo, "nuevo": sha in nuevos,
             "vacio": not [n for n in nombres.splitlines() if n.strip()]}
        if de == tid:
            commits.append(c)
        elif de is None:
            sueltos.append(c)
    return {"tid": tid, "rama": ref, "commits": commits + (sueltos if commits else [])}


def main(argv):
    seco = "--seco" in argv
    ids = [a for a in argv[1:] if not a.startswith("--")]
    _, salida = T._git(["for-each-ref", "--format=%(refname:short)", "refs/archivo/nube/"])
    refs = [r for r in salida.splitlines() if r.strip()]
    hechas = []
    for tid in ids:
        ref = ultima_archivada(tid, refs) or archivada_por_asunto(tid)
        if not ref:
            print("%-20s sin rama archivada" % tid, flush=True)
            continue
        fila = fila_de(ref, tid)
        if not [c for c in fila["commits"] if c["nuevo"]]:
            print("%-20s %s: nada nuevo respecto a main" % (tid, ref), flush=True)
            continue
        if seco:
            print("%-20s %s: traería %d commit(s)" % (tid, ref, len(fila["commits"])), flush=True)
            continue
        t0 = time.time()
        ok, detalle, del_medio = T._traer(fila, 600)
        texto = "%-20s %s: %s en %d s · %s" % (tid, ref, "TRAÍDA" if ok else ("ESPERA (medio)" if del_medio else "NO PASA"),
                                               time.time() - t0, detalle.replace("\n", " ")[:300])
        print(texto, flush=True)
        if ok:
            T._actualizar_progreso({tid: {"estado": "commit", "nota": "rescatada de %s (archivada por error): %s" % (ref, detalle)}})
            hechas.append(tid)
        elif not del_medio:
            T._actualizar_progreso({tid: {"estado": "pendiente", "nota": (
                "rescate: su trabajo está en %s (archivada por error) y en la Mac no pasa: %s"
                % (ref, detalle[:300]))}})
    if hechas and not seco:
        T._avisar("Rescatadas a main %d tarea(s) que se archivaron por error (comprobadas en carpeta aparte): %s."
                  % (len(hechas), ", ".join(hechas)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
