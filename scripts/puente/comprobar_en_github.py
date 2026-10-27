#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprobar en GitHub Actions lo que trae la nube, para que el tsc no lo paguen la Mac ni el A1 (CAP1026N).

MEDIDO el 2026-10-26: main no avanzó de las 14:19 a las 21:50 (hora de la Mac). Veinticinco tareas que la nube ya
había integrado en sus ramas `nube/<run>` esperaban en `traer_nube` con el mismo motivo: «la Mac no tiene memoria
para un tsc completo» (8 GB, presión en aviso) y, en el A1, «tsc no terminó por la máquina (rc=134)», «tiene 1871 MB
libres (mínimo 5000)» o «el guardián está pasando las puertas». Las colas del propio A1 acababan igual: todas
«fallo · tsc no terminó (sin memoria)». Un runner de GitHub (4 vCPU / 16 GB, gratis en un repo público) pasa ese tsc
en minutos.

Cómo, sin tocar main ni gastar nada:
1. La carpeta de comprobación de `traer_nube` ya tiene `HEAD` = main de la Mac + los commits de la tarea. Se empuja
   ese `HEAD` a una rama propia `comprobar/<base>/<árbol>` (como las `colas/nube-*`: main no se toca).
2. El push dispara `.github/workflows/comprobar-nube.yml` (evento push: corre la versión del workflow que va en
   el propio commit, así que no hace falta que esté en el main de GitHub). Ese job saca lo cambiado de `base..HEAD`
   y pasa lo mismo que la Mac: tsc (8 GB de heap), vitest related y las pruebas del puente.
3. Es ASÍNCRONO: la primera pasada lanza y dice «comprobándose en GitHub» (fallo del medio: ni sucesora ni intento
   gastado); la siguiente lee el veredicto, guardado por (base, árbol) en `~/.starseed/comprobar-github.json`, y
   borra la rama. Un fallo en tsc o en las pruebas es de la tarea; uno en checkout, dependencias o el propio runner
   es del medio y se repite.
Devuelve `(ok, detalle, del_medio)` como `comprobar_en_a1`, o None si aquí no aplica (sin repo en `cwd`,
desactivado con STARSEED_COMPROBAR_GITHUB=0): entonces `traer_nube` sigue como antes (A1, luego la Mac).
Nunca imprime claves: el job no tiene ninguna.
"""
from __future__ import annotations

import json
import os
import subprocess
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
ESTADO = os.path.expanduser("~/.starseed/comprobar-github.json")
PREFIJO = "comprobar/"
#: La frase que dice «se está comprobando»: traer_nube la cuenta como fallo del medio y no prueba en otro sitio.
ESPERANDO = "comprobándose en GitHub"
#: Comprobaciones a la vez (más los 4 jobs del enjambre quedan lejos de los 20 del plan gratuito).
MAX_EN_VUELO = 6
#: Un run que no termina en esto se da por perdido y se repite.
CADUCA_S = 50 * 60
#: Lo guardado se olvida a los 3 días (main ya habrá cambiado).
OLVIDO_S = 3 * 24 * 3600
#: Pasos del job cuyo fallo es de la TAREA; cualquier otro (checkout, dependencias…) es del medio.
PASOS_DE_LA_TAREA = ("tsc", "pruebas TS", "pruebas del puente")
#: (CAP1026P) Cada cuánto mira la puerta tsc del orquestador si GitHub ya tiene veredicto.
SONDEO_S = 30
#: (CAP1026P) Sin run en GitHub pasado esto desde el push, la puerta del orquestador deja de esperar.
SIN_RUN_S = 180


# ── lógica pura ──

def rama_para(base_sha, arbol):
    """PURA. `comprobar/<base completa>/<árbol corto>`: el job lee la base del nombre para saber qué cambió."""
    return "%s%s/%s" % (PREFIJO, base_sha, arbol[:16])


def clave_de(base_sha, arbol):
    return "%s:%s" % (str(base_sha)[:12], arbol)


def veredicto(run, jobs):
    """PURA. (estado, paso) de un run de comprobar-nube: estado ∈ en_curso · ok · fallo · medio.

    `run`: {"status", "conclusion"}; `jobs`: [{"steps": [{"name", "conclusion"}]}]."""
    if str((run or {}).get("status")) != "completed":
        return "en_curso", ""
    concl = str((run or {}).get("conclusion") or "")
    if concl == "success":
        return "ok", ""
    fallidos = [s.get("name") for j in jobs or [] for s in (j.get("steps") or []) if s.get("conclusion") == "failure"]
    paso = fallidos[0] if fallidos else ""
    if concl == "failure" and paso in PASOS_DE_LA_TAREA:
        return "fallo", paso
    return "medio", paso or concl


def podar(estado, ahora):
    """PURA. Sin lo que pasó de OLVIDO_S (los veredictos) ni de CADUCA_S (lo que nunca terminó)."""
    salida = {}
    for k, e in (estado or {}).items():
        if not isinstance(e, dict):
            continue
        edad = ahora - float(e.get("t") or 0)
        if e.get("estado") == "en_curso" and edad > CADUCA_S:
            continue
        if edad > OLVIDO_S:
            continue
        salida[k] = e
    return salida


def en_vuelo(estado):
    return sum(1 for e in (estado or {}).values() if isinstance(e, dict) and e.get("estado") == "en_curso")


# ── máquina ──

def _git(cwd, args, timeout=180):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def _gh(args, timeout=60):
    try:
        r = subprocess.run(["gh", *args], cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or ""), (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "", "%s: %s" % (type(e).__name__, e)


def _leer():
    try:
        with open(ESTADO, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _guardar(datos):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    tmp = ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ESTADO)


def _run_de_rama(rama):
    """El run (más nuevo) del push a `rama`, o None."""
    rc, out, _ = _gh(["api", "repos/{owner}/{repo}/actions/runs?event=push&per_page=5&branch=%s" % rama,
                      "--jq", "[.workflow_runs[] | {id, status, conclusion, name}]"])
    if rc != 0:
        return None
    try:
        runs = [r for r in json.loads(out or "[]") if str(r.get("name")) == "comprobar-nube"]
    except ValueError:
        return None
    return runs[0] if runs else None


def _jobs(run_id):
    rc, out, _ = _gh(["api", "repos/{owner}/{repo}/actions/runs/%s/jobs" % run_id,
                      "--jq", "[.jobs[] | {steps: [.steps[]? | {name, conclusion}]}]"])
    try:
        return json.loads(out or "[]") if rc == 0 else []
    except ValueError:
        return []


def _detalle_fallo(run_id):
    rc, out, _ = _gh(["run", "view", str(run_id), "--log-failed"], timeout=90)
    lineas = [l.split("\t")[-1] for l in (out or "").splitlines() if l.strip()]
    return "\n".join(lineas[-25:])[-700:] if rc == 0 else ""


def _borrar_rama(rama):
    _git(RAIZ, ["push", "-q", "origin", "--delete", rama], timeout=120)


def paso_tsc(jobs):
    """PURA (CAP1026P). Cómo acabó el paso «tsc» de un job, aunque el run siga: "success" | "failure" |
    "skipped" (no había TypeScript que comprobar) | "" (aún no acabó o no se sabe)."""
    for j in jobs or []:
        for st in j.get("steps") or []:
            if st.get("name") == "tsc" and st.get("conclusion") in ("success", "failure", "skipped"):
                return st["conclusion"]
    return ""


def _entrada(base_sha, cwd):
    rc, arbol = _git(cwd, ["rev-parse", "HEAD^{tree}"], timeout=30)
    if rc != 0:
        return None
    return podar(_leer(), time.time()).get(clave_de(str(base_sha).strip(), arbol.strip()))


def esperar_tsc(base_sha, cambiados, cwd, esperar_s, dormir=time.sleep, reloj=time.time):
    """(2026-10-27, CAP1026P) La puerta tsc del ORQUESTADOR de la Mac en GitHub. Ella no puede «volver en la
    próxima pasada» como traer_nube: lanza la comprobación y espera su veredicto, mirando el paso tsc del job
    aunque el run siga (las pruebas las pasa luego su propia puerta). (ok, detalle) o None si no aplica, no se
    pudo lanzar, el runner falló o pasó `esperar_s`: entonces el orquestador sigue como antes (A1, luego la Mac).

    MEDIDO el 26-10: main de la Mac sin una sola integración del enjambre desde las 12:03; las tareas pasaban
    20-30 min en «tsc» y el tsc de la Mac moría por memoria («puerta tsc: Mac (… A1: otra comprobación en
    marcha en el A1)»)."""
    inicio = reloj()
    fin = inicio + max(0, esperar_s)
    while True:
        r = comprobar(base_sha, [], cambiados, cwd=cwd)
        if r is None:
            return None
        ok, detalle, del_medio = r
        if not del_medio:
            if ok:
                return True, detalle
            e = _entrada(base_sha, cwd) or {}
            if e.get("paso") and e.get("paso") != "tsc":
                return True, "tsc en verde en GitHub (run %s); «%s» en rojo: eso lo ve la puerta de pruebas" % (
                    e.get("run"), e.get("paso"))
            return False, detalle
        if ESPERANDO not in str(detalle) or "ya hay" in str(detalle) or "del medio" in str(detalle):
            return None
        e = _entrada(base_sha, cwd) or {}
        if not e.get("run") and reloj() - inicio > SIN_RUN_S:
            return None  # GitHub no ha creado el run: mejor el A1 o la Mac que esperar a ciegas
        if e.get("run"):
            paso = paso_tsc(_jobs(e["run"]))
            if paso in ("success", "skipped"):
                return True, "tsc %s en GitHub (run %s); el resto del job sigue" % (
                    "en verde" if paso == "success" else "sin TypeScript que comprobar", e["run"])
        if reloj() >= fin:
            return None
        dormir(SONDEO_S)


def comprobar(base_sha, shas, cambiados, timeout=None, cwd=None, ahora=None):  # noqa: ARG001 — firma de comprobar_en_a1
    if os.environ.get("STARSEED_COMPROBAR_GITHUB", "1") == "0" or not cwd or not os.path.isdir(cwd):
        return None
    rc, arbol = _git(cwd, ["rev-parse", "HEAD^{tree}"], timeout=30)
    rc2, cabeza = _git(cwd, ["rev-parse", "HEAD"], timeout=30)
    if rc != 0 or rc2 != 0 or not str(base_sha or "").strip():
        return None
    # Solo para las carpetas de comprobación del repo de verdad: su `origin` es el de GitHub de la raíz. Un repo de
    # prueba (otro origin o ninguno) no empuja nada ni pregunta a GitHub.
    rc3, origen = _git(cwd, ["remote", "get-url", "origin"], timeout=30)
    rc4, origen_raiz = _git(RAIZ, ["remote", "get-url", "origin"], timeout=30)
    if rc3 != 0 or rc4 != 0 or origen.strip() != origen_raiz.strip() or "github.com" not in origen:
        return None
    arbol, cabeza, base_sha = arbol.strip(), cabeza.strip(), str(base_sha).strip()
    ahora = time.time() if ahora is None else ahora
    estado = podar(_leer(), ahora)
    clave = clave_de(base_sha, arbol)
    e = estado.get(clave)
    if e and e.get("estado") in ("ok", "fallo"):
        if e["estado"] == "ok":
            return True, "tsc y pruebas relacionadas en verde en GitHub (run %s)" % e.get("run"), False
        return False, "en GitHub (run %s) falla «%s»: %s" % (e.get("run"), e.get("paso"), e.get("detalle") or ""), False
    if e and e.get("estado") == "en_curso":
        run = _run_de_rama(e["rama"]) if not e.get("run") else {"id": e["run"]}
        if run and run.get("id"):
            rc, out, _ = _gh(["api", "repos/{owner}/{repo}/actions/runs/%s" % run["id"], "--jq", "{status, conclusion}"])
            try:
                datos = json.loads(out) if rc == 0 else {}
            except ValueError:
                datos = {}
            est, paso = veredicto(datos, _jobs(run["id"]) if datos.get("status") == "completed" else [])
            e["run"] = run["id"]
            if est in ("ok", "fallo"):
                e.update(estado=est, paso=paso, detalle=_detalle_fallo(run["id"]) if est == "fallo" else "", t=ahora)
                estado[clave] = e
                _guardar(estado)
                _borrar_rama(e["rama"])
                return comprobar(base_sha, shas, cambiados, timeout, cwd, ahora)
            if est == "medio":
                estado.pop(clave, None)
                _guardar(estado)
                _borrar_rama(e["rama"])
                return False, "%s: el run %s acabó «%s» (del medio): se repite en la próxima pasada" % (
                    ESPERANDO, run["id"], paso), True
        estado[clave] = e
        _guardar(estado)
        return False, "%s (run %s, %d min): en la próxima pasada" % (
            ESPERANDO, e.get("run") or "?", (ahora - float(e.get("t") or ahora)) // 60), True
    if en_vuelo(estado) >= MAX_EN_VUELO:
        return False, "%s: ya hay %d comprobaciones en marcha; esta, en la próxima pasada" % (
            ESPERANDO, en_vuelo(estado)), True
    rama = rama_para(base_sha, arbol)
    rc, salida = _git(cwd, ["push", "-q", "--force", "origin", "%s:refs/heads/%s" % (cabeza, rama)], timeout=300)
    if rc != 0:
        return False, "GitHub: no pude subir la rama de comprobación (%s)" % salida.strip()[-160:], True
    run = None
    for _ in range(8):
        time.sleep(5)
        run = _run_de_rama(rama)
        if run:
            break
    estado[clave] = {"estado": "en_curso", "rama": rama, "run": (run or {}).get("id"), "t": ahora,
                     "cabeza": cabeza[:12]}
    _guardar(estado)
    return False, "%s (run %s): lanzada, el veredicto en la próxima pasada" % (ESPERANDO, (run or {}).get("id") or "?"), True
