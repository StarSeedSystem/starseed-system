#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recogida de worktrees terminados (TMP1113B).

POR QUÉ existe: el enjambre crea un `git worktree` por tarea (`~/Documents/starseed-wt/<ID>`, rama
`ola/<ID>`) y los directores otro por agente (`~/Documents/starseed-opus/OPUS1106-<ID>`, rama
`opus1106/<ID>`). `limpiar_worktree` del orquestador está deshabilitada a propósito (nunca debe
perderse trabajo de un agente) y la pasada diaria de `autocuracion_mando.limpiar_worktrees` solo mira
`starseed-wt`, no tiene plazo de reposo y no explica qué deja. Medido el 13-11 en la Mac: 73 worktrees
registrados, 32 en starseed-wt y 24 en starseed-opus (2,9 GB), alguno del 06-11.

Un worktree se QUITA solo si se cumple TODO esto:
  1. no es el worktree principal, no está bloqueado (`locked`) y vive bajo una de las raíces vigiladas
     (`starseed-wt`, `starseed-opus`); los que empiezan por «_» o «.» no se tocan (`_traer` es de traer_nube);
  2. su tarea está cerrada en `progreso.json` (commit, integrada, rechazada, sustituida, descartada,
     no_aplica) O su rama ya está entera en main (antepasada de main, o todos sus commits tienen un
     equivalente por parche en main: `git cherry`). Una tarea viva (pendiente, en curso, reasignada,
     por traer, o con latido de hoy) NUNCA se quita, ni siquiera con la rama fusionada;
  3. `git status` no dice nada, ni cambios ni archivos sin seguimiento;
  4. no ha cambiado nada en él desde hace `horas` (24 por defecto): mira la fecha de HEAD, del índice
     y del registro de la rama en el directorio administrativo de git y los archivos de primer nivel.
     La edad se mide ANTES del estado y con `--no-optional-locks`, para que mirar no cuente como cambio;
  5. si tiene HEAD suelto (sin rama), su commit está en main.
Se quita con `git worktree remove` (sin `--force`; nunca un borrado recursivo de una carpeta que git no
conozca), la RAMA se queda, y después `git worktree prune` quita los registros cuya carpeta ya no existe.

Sin `progreso.json` legible no se sabe qué tareas están vivas: no se toca ningún worktree
(mismo criterio que SUP0511E en `autocuracion_mando`).

Es lo único que este módulo borra: worktrees que git conoce, que están limpios, quietos y cerrados.

Uso:
    python3 scripts/puente/recoger_worktrees.py            # simulacro: solo lista, no toca nada
    python3 scripts/puente/recoger_worktrees.py --aplicar  # quita de verdad y apunta en el registro
    opciones: --horas N  --base main  --raiz <repo>  --raices a,b  --json
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")

#: Estados de progreso.json con los que la tarea ya no necesita su worktree (su código está en su rama).
ESTADOS_FINALES = frozenset({"commit", "integrada", "rechazada", "sustituida", "descartada", "no_aplica", "no-aplica"})
#: Estados que la hacen viva: no se toca aunque su rama esté fusionada (una rama recién creada lo está).
ESTADOS_VIVOS = frozenset({"pendiente", "en_curso", "reasignada", "por_traer"})
HORAS_POR_DEFECTO = 24.0
#: Registro de lo quitado y lo conservado (una línea JSON por worktree y por pasada). El simulacro no escribe.
REGISTRO = os.path.expanduser(os.environ.get("STARSEED_REGISTRO_WORKTREES") or "~/.starseed/recogida-worktrees.jsonl")


def raices_por_defecto(raiz=None):
    base = os.path.dirname(os.path.realpath(raiz or RAIZ))
    return [os.path.join(base, "starseed-wt"), os.path.join(base, "starseed-opus")]


def _git(repo, *args, timeout=120):
    """(código, salida). `--no-optional-locks`: mirar el estado no debe reescribir el índice ni cambiar su fecha."""
    try:
        r = subprocess.run(["git", "--no-optional-locks", "-C", repo, *args], capture_output=True, text=True,
                           timeout=timeout)
        return r.returncode, (r.stdout or "") + ("" if r.returncode == 0 else (r.stderr or ""))
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, "%s: %s" % (type(e).__name__, e)


def listar(repo):
    """Worktrees registrados: [{ruta, rama, cabeza, bloqueado, prunable, principal}] (el primero es el principal)."""
    rc, salida = _git(repo, "worktree", "list", "--porcelain")
    if rc != 0:
        return []
    lista, actual = [], None
    for linea in salida.splitlines() + [""]:
        if not linea.strip():
            if actual:
                lista.append(actual)
            actual = None
            continue
        clave, _, valor = linea.partition(" ")
        if clave == "worktree":
            actual = {"ruta": valor, "rama": None, "cabeza": None, "bloqueado": False, "prunable": False,
                      "principal": not lista}
        elif actual is not None:
            if clave == "branch":
                actual["rama"] = valor[len("refs/heads/"):] if valor.startswith("refs/heads/") else valor
            elif clave == "HEAD":
                actual["cabeza"] = valor
            elif clave == "locked":
                actual["bloqueado"] = True
            elif clave == "prunable":
                actual["prunable"] = True
    return lista


def leer_progreso(olas=None):
    """(progreso, vivas): progreso.json y los ids de las tareas con latido de las últimas 24 h. ({}, set()) si no se lee."""
    olas = olas or OLAS
    try:
        with open(os.path.join(olas, "progreso.json"), encoding="utf-8") as f:
            progreso = json.load(f)
    except (OSError, ValueError):
        return {}, set()
    if not isinstance(progreso, dict):
        return {}, set()
    vivas = set()
    for ruta in glob.glob(os.path.join(olas, "latidos-*.json")):
        try:
            if time.time() - os.path.getmtime(ruta) > 86400:
                continue
            with open(ruta, encoding="utf-8") as f:
                vivas |= set(((json.load(f) or {}).get("tareas") or {}).keys())
        except (OSError, ValueError, AttributeError):
            continue
    return progreso, vivas


def ids_de_tarea(ruta, rama):
    """Posibles ids de tarea de un worktree: carpeta, cola de la rama y la carpeta sin su prefijo `OPUS1106-`."""
    nombre = os.path.basename(ruta.rstrip("/"))
    ids = [nombre]
    if rama:
        ids.append(rama.rsplit("/", 1)[-1])
    if "-" in nombre and nombre.split("-", 1)[0].upper().startswith("OPUS"):
        ids.append(nombre.split("-", 1)[1])
    visto, salida = set(), []
    for i in ids:
        if i and i not in visto:
            visto.add(i)
            salida.append(i)
    return salida


def estado_de(progreso, ids):
    """(id, estado) de la primera tarea de `ids` que conste en progreso, o (None, "")."""
    for i in ids:
        v = progreso.get(i)
        if isinstance(v, dict) and v.get("estado"):
            return i, str(v.get("estado"))
    return None, ""


def en_base(repo, referencia, base):
    """¿Todo lo de `referencia` (rama o commit) ya está en `base`? Antepasada, o commits equivalentes por parche."""
    rc, _ = _git(repo, "merge-base", "--is-ancestor", referencia, base)
    if rc == 0:
        return True
    rc, salida = _git(repo, "cherry", base, referencia)
    if rc != 0:
        return False
    lineas = [x for x in salida.splitlines() if x.strip()]
    return bool(lineas) and all(x.startswith("-") for x in lineas)


def ultimo_cambio(ruta, repo):
    """Época del último cambio visto en el worktree sin recorrerlo entero (None si no se puede saber)."""
    marcas = []
    try:
        rc, gitdir = _git(ruta, "rev-parse", "--absolute-git-dir")
        if rc == 0:
            g = gitdir.strip()
            for nombre in ("HEAD", "index", os.path.join("logs", "HEAD")):
                try:
                    marcas.append(os.path.getmtime(os.path.join(g, nombre)))
                except OSError:
                    pass
        marcas.append(os.lstat(ruta).st_mtime)
        for e in os.scandir(ruta):
            if e.name in ("node_modules", ".next", ".git"):
                continue
            try:
                marcas.append(e.stat(follow_symlinks=False).st_mtime)
            except OSError:
                pass
    except OSError:
        return None
    return max(marcas) if marcas else None


def planificar(repo, raices=None, base="main", horas=HORAS_POR_DEFECTO, progreso=None, vivas=None, ahora=None):
    """PURA salvo por lecturas de git: [{ruta, rama, accion: 'quitar'|'conservar'|'prunar', motivo}] por worktree.

    `progreso`/`vivas` se pasan en las pruebas; si no, salen de `progreso.json` y los latidos."""
    ahora = time.time() if ahora is None else ahora
    if progreso is None:
        progreso, vivas_leidas = leer_progreso()
        vivas = vivas_leidas if vivas is None else vivas
    vivas = set(vivas or ())
    raices = [os.path.realpath(r) for r in (raices or raices_por_defecto(repo))]
    plan = []
    if not progreso:
        # SUP0511E: sin progreso no sé qué está vivo; ni una rama «fusionada» vale (una recién creada lo parece).
        for w in listar(repo):
            plan.append(dict(ruta=w["ruta"], rama=w["rama"], accion="conservar",
                             motivo="sin progreso.json legible: no sé qué tareas están vivas"))
        return plan
    rc, _ = _git(repo, "rev-parse", "--verify", "--quiet", base)
    for w in listar(repo):
        ruta, rama = w["ruta"], w["rama"]
        item = dict(ruta=ruta, rama=rama)

        def decidir(accion, motivo):
            item.update(accion=accion, motivo=motivo)
            plan.append(item)

        if w["principal"]:
            decidir("conservar", "es el worktree principal")
            continue
        if w["prunable"] or not os.path.isdir(ruta):
            decidir("prunar", "su carpeta ya no existe: solo queda el registro")
            continue
        real = os.path.realpath(ruta)
        nombre = os.path.basename(real)
        if not any(real.startswith(r + os.sep) and os.path.dirname(real) == r for r in raices):
            decidir("conservar", "no está en una raíz vigilada (%s)" % ", ".join(os.path.basename(r) for r in raices))
            continue
        if nombre.startswith(("_", ".")):
            decidir("conservar", "carpeta reservada a otro director (%s)" % nombre)
            continue
        if w["bloqueado"]:
            decidir("conservar", "está bloqueado (locked)")
            continue
        if rc != 0:
            decidir("conservar", "no existe la rama base «%s»" % base)
            continue
        ids = ids_de_tarea(ruta, rama)
        if any(i in vivas for i in ids):
            decidir("conservar", "su tarea tiene latido de hoy")
            continue
        tid, estado = estado_de(progreso, ids)
        if estado in ESTADOS_VIVOS:
            decidir("conservar", "su tarea %s está %s" % (tid, estado))
            continue
        final = estado in ESTADOS_FINALES
        # La edad va ANTES de preguntar el estado a git (aunque `--no-optional-locks` ya no toque el índice).
        t = ultimo_cambio(ruta, repo)
        if t is None:
            decidir("conservar", "no pude saber cuándo cambió por última vez")
            continue
        edad_h = (ahora - t) / 3600.0
        referencia = rama or w["cabeza"]
        fusionada = bool(referencia) and en_base(repo, referencia, base)
        if not final and not fusionada:
            decidir("conservar", "su tarea no está cerrada (%s) y su rama no está entera en %s"
                    % (estado or "sin registro", base))
            continue
        if not rama and not fusionada:
            decidir("conservar", "HEAD suelto con commits que no están en %s" % base)
            continue
        if edad_h < horas:
            decidir("conservar", "cambió hace %.1f h (plazo %.0f h)" % (edad_h, horas))
            continue
        rc2, st = _git(ruta, "status", "--porcelain", "--untracked-files=all")
        if rc2 != 0:
            decidir("conservar", "no pude leer su estado: se da por sucio")
            continue
        if st.strip():
            decidir("conservar", "tiene trabajo sin guardar (%d archivo(s) con cambios o sin seguimiento)"
                    % len(st.strip().splitlines()))
            continue
        decidir("quitar", ("tarea %s en estado «%s»" % (tid, estado) if final else "rama %s entera en %s" % (rama, base))
                + ", limpio y quieto desde hace %.0f h" % edad_h)
    return plan


def aplicar(repo, plan, registro=None, ahora=None):
    """Ejecuta el plan: `git worktree remove` (sin --force) a cada «quitar» y un `git worktree prune` al final.
    Devuelve {"quitados": [...], "conservados": [...], "errores": [...], "prunados": n}. Nunca borra por otro medio."""
    quitados, conservados, errores = [], [], []
    for it in plan:
        if it["accion"] == "quitar":
            rc, salida = _git(repo, "worktree", "remove", it["ruta"], timeout=180)
            if rc == 0:
                quitados.append(it)
            else:
                it = dict(it, accion="conservar", motivo="git no lo quitó: %s" % salida.strip()[:160])
                errores.append("%s: %s" % (os.path.basename(it["ruta"]), it["motivo"]))
                conservados.append(it)
        elif it["accion"] == "conservar":
            conservados.append(it)
    prunables = sum(1 for it in plan if it["accion"] == "prunar")
    prunados = 0
    if prunables:
        rc, _ = _git(repo, "worktree", "prune")
        prunados = prunables if rc == 0 else 0
    if registro:
        escribir_registro(registro, quitados, conservados, prunados, ahora)
    return {"quitados": quitados, "conservados": conservados, "errores": errores, "prunados": prunados}


def escribir_registro(registro, quitados, conservados, prunados, ahora=None):
    """Una línea JSON por worktree quitado o conservado, para que se sepa qué se hizo y por qué."""
    ahora = time.time() if ahora is None else ahora
    marca = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ahora))
    try:
        os.makedirs(os.path.dirname(registro) or ".", exist_ok=True)
        with open(registro, "a", encoding="utf-8") as f:
            for it in quitados:
                f.write(json.dumps(dict(t=marca, accion="quitado", ruta=it["ruta"], rama=it["rama"], motivo=it["motivo"]),
                                   ensure_ascii=False) + "\n")
            for it in conservados:
                f.write(json.dumps(dict(t=marca, accion="conservado", ruta=it["ruta"], rama=it["rama"],
                                        motivo=it["motivo"]), ensure_ascii=False) + "\n")
            f.write(json.dumps(dict(t=marca, accion="resumen", quitados=len(quitados), conservados=len(conservados),
                                    prunados=prunados), ensure_ascii=False) + "\n")
    except OSError:
        pass  # el registro es informativo: que no se pueda escribir no debe impedir ni deshacer nada


def resumen(plan):
    """Solo cifras: cuántos se quitarían o prunarían y cuántos se conservan, con el motivo principal de cada grupo."""
    quitar = [p for p in plan if p["accion"] == "quitar"]
    prunar = [p for p in plan if p["accion"] == "prunar"]
    motivos = {}
    for p in plan:
        if p["accion"] == "conservar":
            clave = p["motivo"].split("(")[0].split(":")[0]
            clave = "cambió hace" if clave.startswith("cambió hace") else clave
            clave = "su tarea no está cerrada y su rama no está fusionada" if clave.startswith("su tarea no está cerrada") else clave
            clave = "su tarea está viva" if clave.startswith("su tarea ") and "está" in clave and "cerrada" not in clave else clave
            motivos[clave.strip()] = motivos.get(clave.strip(), 0) + 1
    return {"total": len(plan), "quitaria": len(quitar), "prunaria": len(prunar),
            "conservaria": len(plan) - len(quitar) - len(prunar), "motivos_de_conservar": motivos}


def recoger(repo=None, raices=None, base="main", horas=HORAS_POR_DEFECTO, aplicar_ya=False, registro=None, olas=None):
    """Punto de entrada para quien lo llame desde un servicio (autocuración). Simulacro si `aplicar_ya` es False."""
    repo = repo or RAIZ
    progreso, vivas = leer_progreso(olas)
    plan = planificar(repo, raices, base, horas, progreso=progreso, vivas=vivas)
    if not aplicar_ya:
        return {"plan": plan, "resumen": resumen(plan), "aplicado": False}
    r = aplicar(repo, plan, registro=registro if registro is not None else REGISTRO)
    r.update(plan=plan, resumen=resumen(plan), aplicado=True)
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description="Quita los worktrees terminados, limpios y quietos (simulacro por defecto).")
    ap.add_argument("--aplicar", action="store_true", help="quita de verdad (sin esto solo lista)")
    ap.add_argument("--horas", type=float, default=float(os.environ.get("STARSEED_WT_REPOSO_H") or HORAS_POR_DEFECTO))
    ap.add_argument("--base", default="main")
    ap.add_argument("--raiz", default=RAIZ, help="repositorio principal")
    ap.add_argument("--raices", default="", help="carpetas con worktrees, separadas por coma")
    ap.add_argument("--olas", default=OLAS, help="carpeta con progreso.json")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    raices = [r for r in a.raices.split(",") if r] or None
    r = recoger(a.raiz, raices, a.base, a.horas, aplicar_ya=a.aplicar, olas=a.olas)
    if a.json:
        print(json.dumps(r["resumen"], ensure_ascii=False))
        return 0
    s = r["resumen"]
    print("%s: %d worktree(s) registrados; %s %d, prunaría/prunó %d, conservo %d." % (
        "APLICADO" if r["aplicado"] else "SIMULACRO (no se toca nada)", s["total"],
        "quité" if r["aplicado"] else "quitaría", s["quitaria"], s["prunaria"], s["conservaria"]))
    for motivo, n in sorted(s["motivos_de_conservar"].items(), key=lambda x: -x[1]):
        print("  conservo %3d · %s" % (n, motivo))
    if not a.aplicar:
        for p in r["plan"]:
            if p["accion"] == "quitar":
                print("  quitaría %s (%s)" % (os.path.basename(p["ruta"]), p["motivo"]))
    for e in r.get("errores", []):
        print("  ERROR " + e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
