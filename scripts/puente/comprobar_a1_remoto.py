#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Corre EN el A1 (usuario starseed) y comprueba lo que trae la nube, sin tocar nada del A1.

Lo envía `comprobar_en_a1.py` por ssh (`sudo -u starseed -H python3 - '<json>'`, el código por la
entrada estándar): el A1 no necesita tener esta versión del repositorio para usarlo.

Cómo (2026-10-13, TRA1012A de verdad):
- Un clon `--shared` en `~/comprobar/<id>` (pide prestados los objetos al repo del A1: cero copia)
  al que llega el paquete git que dejó la Mac (`HEAD` ya cherry-pickeado sobre el main de la Mac).
  NUNCA un `worktree` del repo principal: el A1 borra todos sus worktrees al acabar cada cola.
- `node_modules` enlazado del repo principal SOLO si el `package-lock.json` es el mismo que el
  instalado (`node_modules/.huella-lock`); si no, los errores serían del A1, no de la tarea.
- Memoria libre mínima antes de empezar y el TURNO de lo pesado del A1
  (`~/.starseed/cerrojos/pesado.lock`, el mismo que usan sus agentes y `tsc-turno.sh`): se espera
  un rato y, si no llega, se devuelve «del medio» (la Mac lo comprueba ella o en la próxima pasada).
  Nunca se fuerza el turno de otro.
- Todo se borra al acabar, pase lo que pase.

Salida: la ÚLTIMA línea es `@@RESULTADO {json}` con `medio` (motivo si el fallo es de la máquina)
y `pasos` [{paso, rc, s, cola}]. Código de salida 0 siempre que haya resultado."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

RAIZ_A1 = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/starseed-system")
BASE = os.path.expanduser("~/comprobar")
TURNO = os.path.expanduser("~/.starseed/cerrojos/pesado.lock")
#: (2026-10-13, medido) Con 3072 el tsc del repo muere por memoria en el A1 (rc 134 a los 175 s);
#: el guardián del A1 usa 4096 y pasa en ~210 s.
MEMORIA_TSC = "--max-old-space-size=4096"
RE_ID = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
RE_SHA = re.compile(r"^[0-9a-f]{40}$")


def memoria_libre_mb(meminfo):
    """PURA. MemAvailable de /proc/meminfo en MB (0 si no está)."""
    m = re.search(r"^MemAvailable:\s+(\d+)\s*kB", str(meminfo or ""), re.M)
    return int(m.group(1)) // 1024 if m else 0


def validar(cfg):
    """PURA. Motivo por el que la petición no vale ('' si vale). Nada de rutas fuera del repo."""
    if not RE_ID.match(str(cfg.get("id") or "")):
        return "id no válido"
    if not RE_SHA.match(str(cfg.get("sha") or "")):
        return "sha no válido"
    for p in cfg.get("prerrequisitos") or []:
        if not RE_SHA.match(str(p)):
            return "prerrequisito no válido"
    for ruta in list(cfg.get("codigo") or []) + list(cfg.get("py") or []):
        r = str(ruta)
        if r.startswith(("/", "-")) or ".." in r.split("/") or not re.match(r"^[A-Za-z0-9._@()\[\]/+-]+$", r):
            return "ruta no válida: %s" % r[:80]
    return ""


def ordenes(cfg):
    """PURA. [(paso, argv, tope_s)] según lo que cambió: tsc si hubo TS, vitest de lo relacionado
    y las pruebas del puente en Python. Las mismas órdenes que las puertas de la Mac."""
    tope = int(cfg.get("tope_s") or 900)
    salida = []
    if cfg.get("ts"):
        salida.append(("tsc", ["npx", "tsc", "--noEmit", "--skipLibCheck"], max(tope, 900)))
    if cfg.get("codigo"):
        salida.append(("vitest", ["npx", "vitest", "related", "--run", "--maxWorkers=2", "--minWorkers=1",
                                  "--passWithNoTests", *cfg["codigo"]], tope))
    if cfg.get("py"):
        salida.append(("pytest", ["python3", "-m", "pytest", "-q", "-p", "no:cacheprovider", *cfg["py"]], tope))
    return salida


def dueno_vivo(texto_dueno, vivo=None):
    """PURA (con `vivo` inyectable). ¿El dueño del turno («pid epoch») sigue vivo?"""
    try:
        pid = int(str(texto_dueno or "").split()[0])
    except (ValueError, IndexError):
        return False
    if vivo is not None:
        return bool(vivo(pid))
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False


def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def tomar_turno(espera_s, cada_s=5.0):
    """Toma el turno de lo pesado (directorio atómico, formato «pid epoch»). True si lo tiene.
    Un dueño muerto se retira; uno vivo NUNCA se fuerza: pasada la espera, False."""
    os.makedirs(os.path.dirname(TURNO), exist_ok=True)
    fin = time.time() + espera_s
    while True:
        if os.path.isdir(TURNO) and not dueno_vivo(_leer(os.path.join(TURNO, "dueno"))):
            # Recién creado por otro (aún sin `dueno`): no es huérfano, se le da un respiro.
            try:
                edad = time.time() - os.path.getmtime(TURNO)
            except OSError:
                edad = 0
            if edad > 30:
                shutil.rmtree(TURNO, ignore_errors=True)
        try:
            os.mkdir(TURNO)
            with open(os.path.join(TURNO, "dueno"), "w", encoding="utf-8") as f:
                f.write("%d %d" % (os.getpid(), int(time.time())))
            return True
        except FileExistsError:
            pass
        except OSError:
            return False
        if time.time() >= fin:
            return False
        time.sleep(min(cada_s, max(0.1, fin - time.time())))


def soltar_turno():
    if _leer(os.path.join(TURNO, "dueno")).split()[:1] == [str(os.getpid())]:
        shutil.rmtree(TURNO, ignore_errors=True)


def _git(args, cwd=None, timeout=300):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def _correr(argv, cwd, tope_s):
    env = dict(os.environ, NODE_OPTIONS=MEMORIA_TSC, CI="1", FORCE_COLOR="0")
    casa = os.path.expanduser("~")
    env["PATH"] = ":".join([os.path.join(casa, ".npm-global", "bin"), os.path.join(casa, "bin"), "/usr/local/bin",
                            "/usr/bin", "/bin", env.get("PATH", "")])
    t0 = time.time()
    # `timeout` mata también a los hijos (npx → node); donde no está (macOS, en las pruebas) basta
    # el tope de subprocess.
    envoltura = ["timeout", "-k", "30", str(int(tope_s))] if shutil.which("timeout") else []
    try:
        r = subprocess.run(["nice", "-n", "10", *envoltura, *argv], cwd=cwd, capture_output=True, text=True,
                           env=env, timeout=tope_s + 60)
        return r.returncode, (r.stdout or "") + (r.stderr or ""), time.time() - t0
    except subprocess.TimeoutExpired:
        return 124, "se pasó de %d s sin terminar" % tope_s, time.time() - t0
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e), time.time() - t0


def _huella_lock(ruta):
    try:
        with open(ruta, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:16]
    except OSError:
        return ""


def comprobar(cfg):
    """El trabajo entero. Devuelve el dict del resultado (nunca lanza)."""
    motivo = validar(cfg)
    if motivo:
        return {"medio": "petición no válida: " + motivo, "pasos": []}
    os.makedirs(BASE, exist_ok=True)
    cerrojo = open(os.path.join(BASE, ".cerrojo"), "w")
    try:
        fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return {"medio": "otra comprobación en marcha en el A1", "pasos": []}
    paquete = os.path.join(BASE, cfg["id"] + ".bundle")
    carpeta = os.path.join(BASE, cfg["id"])
    try:
        libre = memoria_libre_mb(_leer("/proc/meminfo"))
        minimo = int(cfg.get("minimo_mb", 4500) or 0)
        if libre < minimo:
            return {"medio": "el A1 tiene %d MB libres (mínimo %d)" % (libre, minimo), "pasos": []}
        shutil.rmtree(carpeta, ignore_errors=True)
        rc, salida = _git(["clone", "-q", "--shared", "--no-checkout", RAIZ_A1, carpeta], timeout=300)
        if rc != 0:
            return {"medio": "no pude clonar: " + salida.strip()[-200:], "pasos": []}
        for i, p in enumerate(cfg.get("prerrequisitos") or []):
            _git(["update-ref", "refs/prerrequisito/%d" % i, p], cwd=carpeta)
        if cfg.get("sin_paquete"):
            # Lo que se comprueba ya está en el main de la Mac que tiene el A1: no viaja nada.
            _git(["update-ref", "refs/heads/traer", cfg["sha"]], cwd=carpeta)
        else:
            rc, salida = _git(["fetch", "-q", paquete, "+HEAD:refs/heads/traer"], cwd=carpeta, timeout=300)
            if rc != 0:
                return {"medio": "el paquete no entra en el A1: " + salida.strip()[-200:], "pasos": []}
        rc, salida = _git(["-c", "advice.detachedHead=false", "checkout", "-q", "--detach", "traer"], cwd=carpeta)
        _, cabeza = _git(["rev-parse", "HEAD"], cwd=carpeta)
        if rc != 0 or cabeza.strip() != cfg["sha"]:
            return {"medio": "no pude preparar la carpeta: " + salida.strip()[-200:], "pasos": []}
        if cfg.get("ts") or cfg.get("codigo"):
            instalada = _leer(os.path.join(RAIZ_A1, "node_modules", ".huella-lock")).strip()
            if not instalada or instalada != _huella_lock(os.path.join(carpeta, "package-lock.json")):
                return {"medio": "las dependencias del A1 son de otro package-lock", "pasos": []}
            os.symlink(os.path.join(RAIZ_A1, "node_modules"), os.path.join(carpeta, "node_modules"))
        pasos = []
        for paso, argv, tope in ordenes(cfg):
            if not tomar_turno(int(cfg.get("espera_turno_s") or 600)):
                return {"medio": "el A1 está compilando (turno ocupado): en la próxima pasada", "pasos": pasos}
            try:
                libre = memoria_libre_mb(_leer("/proc/meminfo"))
                if libre < minimo:
                    return {"medio": "el A1 tiene %d MB libres (mínimo %d)" % (libre, minimo), "pasos": pasos}
                rc, salida, dur = _correr(argv, carpeta, tope)
            finally:
                soltar_turno()
            pasos.append({"paso": paso, "rc": rc, "s": int(dur), "cola": salida[-1500:]})
            if rc not in (0, 5) or (rc == 5 and paso != "pytest"):
                break
        return {"medio": "", "pasos": pasos}
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)
        try:
            os.remove(paquete)
        except OSError:
            pass
        cerrojo.close()


def main(argv):
    try:
        cfg = json.loads(argv[1])
    except (IndexError, ValueError):
        cfg = {}
    try:
        res = comprobar(cfg)
    except Exception as e:  # noqa: BLE001 — nunca sin resultado
        res = {"medio": "%s: %s" % (type(e).__name__, str(e)[:200]), "pasos": []}
    print("@@RESULTADO " + json.dumps(res, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
