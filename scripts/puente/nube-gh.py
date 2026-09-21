#!/usr/bin/env python3
"""Medio «nube-gh»: el enjambre en GitHub Actions, gratis y sin tope en repos públicos (2026-09-21).

Alex: «se puede más con más medios… algún servicio gratuito para alojar más agentes».
Hugging Face exige PRO para Spaces Docker (HTTP 402, comprobado); GitHub Actions
en este repo PÚBLICO da máquinas de 4 vCPU / 16 GB, hasta 6 h por job y varios
jobs a la vez, sin coste. El workflow `.github/workflows/enjambre-nube.yml` corre
el orquestador sobre una `enjambre/colas/cola-nube-*.json` con 3 trabajadores y
empuja SU rama `nube/<run-id>`; la Mac la trae, y publica con las cuatro puertas.

Uso (en la Mac, con `gh` autenticado como StarSeedSystem):
  nube-gh.py secretos             copia a los secretos del repo las claves de
                                  ~/.starseed/env que usa el enjambre (nombres en
                                  pantalla, nunca valores) — lo corre Alex
  nube-gh.py lanzar [--tope N] [--trabajadores 3] [--minutos 300] [--cola ruta]
                                  reparte N tareas a una cola-nube nueva (o usa
                                  --cola), la publica en main y dispara el workflow
  nube-gh.py estado               últimos runs y sus ramas nube/<run>
  nube-gh.py traer                trae todas las ramas nube/* a main (ff o merge)
                                  y las borra del remoto; luego publicar.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKFLOW = "enjambre-nube.yml"
#: (2026-09-21) NVIDIA_SHARED_KEY estuvo aqui desde el principio y NO EXISTE en ninguna
#: parte: ni en ~/.starseed/env, ni en ~/.hermes/.env, ni en los secretos del repo. Pedir
#: una clave que nadie tiene hacia que la lista de «te toca a ti» mostrara para siempre
#: una tarea imposible para Alex. Fuera: si algun dia aparece, se anade entonces.
SECRETOS = (
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY",
    "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
    "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
)

#: Los dos archivos de entorno de esta maquina. Solo se leen NOMBRES y valores para
#: mandarlos a `gh secret set` por la entrada estandar; nunca se imprime un valor.
#: (2026-09-21) Antes solo se leia ~/.starseed/env, y por eso AIHUBMIX_API_KEY y
#: TOKENROUTER_API_KEY salian como «sin valor» habiendo estado siempre en ~/.hermes/.env.
#: El resultado era un aviso permanente pidiendole a Alex que subiera unas claves que ya
#: tenia, por un archivo que no miramos. Mismo par de archivos que usa jev.py.
ARCHIVOS_DE_ENTORNO = ("~/.starseed/env", "~/.hermes/.env")
VARIABLES = ("STARSEED_PASARELA_GROQ_URL", "STARSEED_PASARELA_GROQ_MODELOS", "STARSEED_PASARELA_GROQ_RPM")


def _env() -> dict:
    salida = dict(os.environ)
    for ruta in ARCHIVOS_DE_ENTORNO:
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                # ~/.hermes/.env escribe `export CLAVE=valor`; ~/.starseed/env no.
                if linea.startswith("export "):
                    linea = linea[len("export "):].strip()
                k, v = linea.split("=", 1)
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                salida.setdefault(k.strip(), v)
        except OSError:
            continue
    return salida


def _sh(args, entrada=None, check=True):
    p = subprocess.run(args, cwd=RAIZ, input=entrada, capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit("falló %s: %s" % (" ".join(args[:3]), (p.stderr or p.stdout)[-300:]))
    return p.stdout.strip()


def secretos() -> None:
    env = _env()
    puestos, faltan = [], []
    for k in SECRETOS:
        v = (env.get(k) or "").strip()
        if not v:
            faltan.append(k); continue
        p = subprocess.run(["gh", "secret", "set", k], cwd=RAIZ, input=v, capture_output=True, text=True)
        (puestos if p.returncode == 0 else faltan).append(k)
    for k in VARIABLES:
        v = (env.get(k) or "").strip()
        if v:
            subprocess.run(["gh", "variable", "set", k, "--body", v], cwd=RAIZ, capture_output=True, text=True)
    print("secretos puestos en GitHub:", ", ".join(puestos) or "ninguno")
    if faltan:
        print("sin valor en ~/.starseed/env (no se ponen):", ", ".join(faltan))


def lanzar(args: list[str]) -> None:
    tope, trabajadores, minutos, cola = "6", "3", "300", None
    it = iter(args)
    for a in it:
        if a == "--tope": tope = next(it)
        elif a == "--trabajadores": trabajadores = next(it)
        elif a == "--minutos": minutos = next(it)
        elif a == "--cola": cola = next(it)
    if not cola:
        antes = set(os.listdir(os.path.join(RAIZ, "enjambre", "colas")))
        out = subprocess.run([sys.executable, os.path.join(RAIZ, "scripts", "puente", "repartir-a-nube.py"), "--tope", tope],
                             cwd=RAIZ, capture_output=True, text=True).stdout
        print(out.strip()[-300:])
        nuevas = sorted(set(os.listdir(os.path.join(RAIZ, "enjambre", "colas"))) - antes)
        if not nuevas:
            sys.exit("el reparto no creó ninguna cola (¿no hay atraso?)")
        cola = "enjambre/colas/" + nuevas[-1]
        _sh(["git", "add", cola, "starseed_memory_root/olas/progreso.json"], check=False)
        _sh(["git", "add", cola])
        _sh(["git", "commit", "-q", "-m", "enjambre: reparto a la nube (GitHub Actions) · %s" % os.path.basename(cola)], check=False)
    # La nube hace checkout de main: la cola tiene que estar publicada.
    # (2026-09-20) Este push decía «solo este commit de cola» y era MENTIRA: empuja HEAD
    # entero, así que se llevaba por delante cualquier commit de código que aún no hubiera
    # pasado las cuatro puertas. Paso hoy: una ruta con un `export` de mas llego a
    # origin/main sin tsc, y la publicacion siguiente fallo con el arbol ya publicado.
    # Ahora se comprueba antes: si hay codigo sin publicar, no se empuja nada.
    _sh(["git", "fetch", "-q", "origin", "main"], check=False)
    pendientes = [
        l for l in _sh(["git", "log", "--name-only", "--format=%H", "origin/main..HEAD"],
                       check=False).splitlines() if l.strip()
    ]
    codigo = [
        l for l in pendientes
        if "/" in l and not l.startswith("enjambre/colas/")
        and not l.startswith("starseed_memory_root/")
    ]
    if codigo:
        sys.exit(
            "hay %d archivo(s) de codigo sin publicar (%s...): pasa primero las cuatro "
            "puertas con `python3 scripts/puente/publicar.py` y vuelve a lanzar.\n"
            "Este push solo puede llevar la cola, no codigo sin comprobar."
            % (len(codigo), ", ".join(sorted(set(codigo))[:3]))
        )
    print("publicando la cola en main (solo la cola: se comprobo que no hay codigo sin publicar):")
    print(_sh(["git", "push", "origin", "HEAD:main"], check=False)[-200:] or "push ok")
    print(_sh(["gh", "workflow", "run", WORKFLOW, "-f", "cola=%s" % cola, "-f", "trabajadores=%s" % trabajadores, "-f", "minutos=%s" % minutos]))
    print("lanzado:", cola, "· trabajadores", trabajadores, "· minutos", minutos)
    print("sigue con: python3 scripts/puente/nube-gh.py estado")


def estado() -> None:
    print(_sh(["gh", "run", "list", "--workflow", WORKFLOW, "--limit", "8"], check=False) or "sin runs")
    ramas = _sh(["git", "ls-remote", "--heads", "origin", "nube/*"], check=False)
    print("ramas nube/* en el remoto:", len([l for l in ramas.splitlines() if l.strip()]))


def traer() -> None:
    _sh(["git", "fetch", "-q", "origin", "+refs/heads/nube/*:refs/remotes/origin/nube/*"], check=False)
    ramas = [l.split()[-1].replace("refs/heads/", "") for l in _sh(["git", "ls-remote", "--heads", "origin", "nube/*"], check=False).splitlines() if l.strip()]
    if not ramas:
        print("nada que traer"); return
    for r in ramas:
        ff = subprocess.run(["git", "merge", "--ff-only", "origin/" + r], cwd=RAIZ, capture_output=True, text=True)
        if ff.returncode != 0:
            m = subprocess.run(["git", "merge", "--no-edit", "origin/" + r], cwd=RAIZ, capture_output=True, text=True)
            if m.returncode != 0:
                print("conflicto en", r, "→ se conserva en el remoto:", m.stdout[-200:]); continue
            print("integrada por merge:", r)
        else:
            print("integrada por ff:", r)
        subprocess.run(["git", "push", "-q", "origin", "--delete", r], cwd=RAIZ, capture_output=True, text=True)
    print("ahora: python3 scripts/puente/publicar.py (cuatro puertas y push desde la Mac)")


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    {"secretos": secretos, "lanzar": lambda: lanzar(sys.argv[2:]), "estado": estado, "traer": traer}.get(orden, lambda: print(__doc__))()
