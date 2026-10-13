#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprobar en el A1 de Oracle lo que trae la nube, para que el tsc no lo pague la Mac (TRA1012A).

`traer_nube._puertas` lo llama cuando lo que llega toca TypeScript. Devuelve
`(ok, detalle, del_medio)`: con `del_medio` True la Mac comprueba ella (si su memoria lo permite)
o se reintenta en la próxima pasada; nunca se crea una sucesora por un fallo de la máquina.

Cómo (2026-10-13). La primera versión, escrita por el enjambre, nunca funcionó: trataba `estado()`
como si no fuera una tupla, pedía al A1 un `worktree` sobre un main que el A1 no tiene, sin
`node_modules`, con `python` (no existe en el A1) y se negaba siempre que el A1 tenía una cola.
Ahora:
1. La Mac empaqueta `HEAD` de su carpeta de comprobación (ya cherry-pickeado sobre su main) con un
   paquete git cuyo prerrequisito es el main de la Mac que el A1 YA tiene (`refs/mac/main`, lo
   lleva `oracle_nodo.enviar_main`): pesa lo que pesan los commits nuevos. Nada pasa por GitHub ni
   se empuja nada.
2. Lo deja en `~starseed/comprobar/<id>.bundle` y corre allí `comprobar_a1_remoto.py` (el código
   va por la entrada estándar), que clona aparte, enlaza `node_modules` si el lock coincide, mira la
   memoria libre, toma el turno de lo pesado del A1 y pasa tsc + vitest related + pytest.
3. Lee la última línea `@@RESULTADO {…}` y decide. Todo lo que dice el A1 pasa por `tachar`.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import oracle_nodo  # noqa: E402

REMOTO = os.path.join(DIRECTORIO, "comprobar_a1_remoto.py")
BASE_A1 = "/home/starseed/comprobar"
TOPE_PAQUETE_MB = 60
#: tsc con 4096 MB de heap + lo que no es heap: menos de esto y no se empieza (del medio).
MINIMO_MB = 5000
ESPERA_TURNO_S = 600
SENALES_MEDIO = ("heap out of memory", "FATAL ERROR", "Killed", "ENOMEM", "No space left",
                 "No module named pytest", "Cannot find module 'typescript'", "vitest: not found",
                 "npx: command not found")


def _archivos_ts(cambiados):
    return [c for c in cambiados or () if re.search(r"\.(ts|tsx|mts|cts)$", c)
            or os.path.basename(c) in ("tsconfig.json", "package.json", "package-lock.json")]


def _pruebas_python(cambiados, existe):
    salida = []
    for c in cambiados or ():
        if not (c.startswith("scripts/") and c.endswith(".py")):
            continue
        carpeta, nombre = os.path.split(c)
        cand = c if nombre.startswith("test_") else os.path.join(carpeta, "test_" + nombre)
        if cand not in salida and existe(cand):
            salida.append(cand)
    return salida


def peticion(id_, sha, prerrequisitos, cambiados, existe, tope_s=900):
    """PURA (con `existe` inyectable, relativo a la carpeta). Lo que se le pide al A1."""
    codigo = [c for c in cambiados or () if c.startswith("src/") and re.search(r"\.(ts|tsx)$", c)]
    return {"id": id_, "sha": sha, "prerrequisitos": list(prerrequisitos),
            "ts": bool(_archivos_ts(cambiados)), "codigo": codigo,
            "py": _pruebas_python(cambiados, existe), "tope_s": int(tope_s),
            "minimo_mb": MINIMO_MB, "espera_turno_s": ESPERA_TURNO_S}


def motivo_para_no_ir(estado_a1, cambiados):
    """PURA. '' si se puede comprobar en el A1; si no, el motivo (siempre «del medio»)."""
    if not estado_a1:
        return "A1 no responde"
    if estado_a1.get("fase") == "guardian":
        return "el guardián del A1 está pasando las puertas"
    if any(os.path.basename(c) in ("package.json", "package-lock.json") for c in cambiados or ()):
        return "cambia las dependencias: el node_modules del A1 no sirve para comprobarlo"
    if not str(((estado_a1.get("main_mac") or {}).get("sha")) or ""):
        return "el A1 aún no tiene el main de la Mac"
    return ""


def resultado_de(salida):
    """PURA. El dict de la última línea `@@RESULTADO {…}` (None si no hay)."""
    for linea in reversed(str(salida or "").splitlines()):
        if linea.startswith("@@RESULTADO "):
            try:
                datos = json.loads(linea[len("@@RESULTADO "):])
                return datos if isinstance(datos, dict) else None
            except ValueError:
                return None
    return None


def veredicto(res):
    """PURA. (ok, detalle, del_medio) a partir del resultado del A1."""
    if not isinstance(res, dict):
        return False, "el A1 no devolvió resultado", True
    if res.get("medio"):
        return False, "A1: " + str(res["medio"]), True
    pasos = res.get("pasos") or []
    if not pasos:
        return True, "en el A1 no había nada que comprobar", False
    for p in pasos:
        rc, cola, nombre = p.get("rc"), str(p.get("cola") or ""), p.get("paso")
        if rc == 0 or (rc == 5 and nombre == "pytest"):
            continue
        if rc in (124, 137) or any(s in cola for s in SENALES_MEDIO):
            return False, "A1: %s no terminó por la máquina (rc=%s): %s" % (nombre, rc, cola[-300:]), True
        return False, "en el A1: %s: %s" % (nombre, cola[-600:]), False
    s = sum(int(p.get("s") or 0) for p in pasos)
    return True, "%s en verde en el A1 (%d s)" % (" + ".join(p["paso"] for p in pasos), s), False


def _git_en(cwd, args, timeout=300):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def comprobar(base_sha, shas, cambiados, timeout=900, cwd=None):
    """(ok, detalle, del_medio). `cwd` es la carpeta de comprobación de traer_nube con `HEAD` ya
    cherry-pickeado; sin ella no hay nada que mandar."""
    cambiados = [cambiados] if isinstance(cambiados, str) else list(cambiados or [])
    if not cwd or not os.path.isdir(cwd):
        return False, "A1: sin carpeta de comprobación", True
    try:
        estado_a1 = oracle_nodo.estado(guardar=False)[0]
    except Exception:  # noqa: BLE001 — sin A1 se comprueba en la Mac
        estado_a1 = {}
    motivo = motivo_para_no_ir(estado_a1, cambiados)
    if motivo:
        return False, "A1: " + motivo, True
    rc, cabeza = _git_en(cwd, ["rev-parse", "HEAD"])
    cabeza = cabeza.strip()
    prerreq = str(estado_a1["main_mac"]["sha"])
    if rc != 0 or _git_en(cwd, ["cat-file", "-e", prerreq + "^{commit}"])[0] != 0:
        return False, "A1: la Mac no tiene el main que tiene el A1", True
    id_ = "traer-%s-%d" % (cabeza[:10], int(time.time()))
    # Si el A1 ya lo tiene (HEAD dentro de su main de la Mac), no viaja nada: git se niega a hacer
    # un paquete vacío.
    sin_paquete = _git_en(cwd, ["merge-base", "--is-ancestor", cabeza, prerreq])[0] == 0
    if not sin_paquete:
        with tempfile.TemporaryDirectory(prefix="starseed-a1-") as tmp:
            paquete = os.path.join(tmp, "traer.bundle")
            rc, salida = _git_en(cwd, ["bundle", "create", "-q", paquete, "HEAD", "^" + prerreq])
            if rc != 0 or not os.path.exists(paquete):
                return False, "A1: no pude empaquetar: " + salida.strip()[-200:], True
            if os.path.getsize(paquete) > TOPE_PAQUETE_MB * 1048576:
                return False, "A1: el paquete pesa más de %d MB" % TOPE_PAQUETE_MB, True
            with open(paquete, "rb") as f:
                datos = f.read()
        destino = "%s/%s.bundle" % (BASE_A1, id_)
        rc, salida = oracle_nodo._ssh_bytes("sudo -u starseed -H sh -c 'mkdir -p %s && cat > %s.tmp && mv -f %s.tmp %s'"
                                            % (BASE_A1, destino, destino, destino), datos, timeout=300)
        if rc != 0:
            return False, "A1: no pude dejar el paquete: " + salida.strip()[-200:], True
    pet = peticion(id_, cabeza, [prerreq], cambiados, lambda r: os.path.exists(os.path.join(cwd, r)), timeout)
    pet["sin_paquete"] = sin_paquete
    try:
        with open(REMOTO, encoding="utf-8") as f:
            codigo = f.read()
    except OSError:
        return False, "A1: falta comprobar_a1_remoto.py", True
    # Tope: la espera del turno + cada paso + margen. Si se pasa, el A1 sigue y limpia él solo.
    tope = ESPERA_TURNO_S * 3 + max(timeout, 900) * 3 + 300
    rc, salida = oracle_nodo.ssh("sudo -u starseed -H python3 - %s" % shlex.quote(json.dumps(pet)),
                                 entrada=codigo, timeout=tope)
    res = resultado_de(salida)
    if res is None:
        return False, "A1: sin resultado (rc=%s): %s" % (rc, oracle_nodo.tachar(salida).strip()[-200:]), True
    ok, detalle, del_medio = veredicto(res)
    return ok, oracle_nodo.tachar(detalle), del_medio


if __name__ == "__main__":
    # Prueba a mano: python3 scripts/puente/comprobar_en_a1.py <carpeta> [archivo …]
    carpeta = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    print(comprobar("", [], sys.argv[2:] or ["src/lib/utils.ts"], cwd=carpeta))
