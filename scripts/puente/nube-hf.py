#!/usr/bin/env python3
"""Medio «nube-hf»: el enjambre en un Space de Hugging Face (2026-09-21).

Alex: «se puede más con más medios… algún servicio gratuito como espacios de
Hugging Face». Un Space Docker en el plan gratuito (CPU basic: 2 vCPU · 16 GB)
corre `deploy/hf-space/` como un medio más del enjambre: 2 agentes que escriben
con las pasarelas gratuitas, pasan tsc/vitest e integran en SU main; sus commits
vuelven a la Mac como `git bundle` por HTTPS y la Mac los publica con las cuatro
puertas. La nube nunca hace push a main.

Uso (en la Mac; HF_TOKEN con permiso de escritura en ~/.starseed/env):
  nube-hf.py crear [nombre]   crea el Space privado y sube deploy/hf-space/*
  nube-hf.py subir            vuelve a subir los archivos (tras cambiarlos)
  nube-hf.py secretos         copia al Space las claves de ~/.starseed/env que
                              el enjambre usa (solo nombres en pantalla) — lo
                              corre Alex: son sus claves y es su decisión
  nube-hf.py estado           runtime del Space + /estado del enjambre
  nube-hf.py traer            baja el bundle y lo integra en main (ff) — luego publicar.py
  nube-hf.py despertar        un GET a la raíz (evita el sueño por inactividad)
  nube-hf.py cola [--tope N]  reparte tareas a la nube (llama a repartir-a-nube.py)
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARPETA = os.path.join(RAIZ, "deploy", "hf-space")
ARCHIVOS = ("Dockerfile", "entrypoint.sh", "servidor.py", "opencode.json")
ESTADO = os.path.expanduser("~/.starseed/nube-hf.json")
SECRETOS = (
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY", "NVIDIA_SHARED_KEY",
    "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
    "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY", "STARSEED_LANZADOR_SECRETO",
)
VARIABLES = ("STARSEED_PASARELA_GROQ_URL", "STARSEED_PASARELA_GROQ_MODELOS", "STARSEED_PASARELA_GROQ_RPM")
API = "https://huggingface.co/api"


def _env() -> dict:
    """Variables de ~/.starseed/env (sin exportarlas ni imprimirlas)."""
    salida = dict(os.environ)
    ruta = os.path.expanduser("~/.starseed/env")
    try:
        for linea in open(ruta, encoding="utf-8"):
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            salida.setdefault(k.strip(), v)
    except OSError:
        pass
    return salida


def _token(env: dict) -> str:
    t = (env.get("HF_TOKEN") or "").strip()
    if not t:
        sys.exit("falta HF_TOKEN en ~/.starseed/env (con permiso de escritura: hf.co/settings/tokens)")
    return t


def _hf(metodo: str, ruta: str, token: str, cuerpo=None, ndjson: str | None = None, timeout=60):
    datos = None
    cab = {"Authorization": "Bearer " + token}
    if ndjson is not None:
        datos = ndjson.encode("utf-8")
        cab["Content-Type"] = "application/x-ndjson"
    elif cuerpo is not None:
        datos = json.dumps(cuerpo).encode("utf-8")
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(API + ruta, data=datos, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            texto = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(texto) if texto.strip().startswith(("{", "[")) else texto)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def _guardar(d: dict) -> None:
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    previo = {}
    try:
        previo = json.load(open(ESTADO, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    previo.update(d)
    json.dump(previo, open(ESTADO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def _leer() -> dict:
    try:
        return json.load(open(ESTADO, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _repo(env: dict, nombre: str | None = None) -> str:
    est = _leer()
    if est.get("repo") and not nombre:
        return est["repo"]
    st, yo = _hf("GET", "/whoami-v2", _token(env))
    if st != 200 or not isinstance(yo, dict):
        sys.exit("HF no reconoce el token (%s): %s" % (st, yo))
    return "%s/%s" % (yo["name"], nombre or "starseed-enjambre")


def url_space(repo: str) -> str:
    return "https://%s.hf.space" % repo.replace("/", "-").replace(".", "-").replace("_", "-").lower()


def crear(nombre: str | None) -> None:
    env = _env(); token = _token(env)
    repo = _repo(env, nombre)
    st, r = _hf("POST", "/repos/create", token, {"type": "space", "name": repo.split("/", 1)[1], "private": True, "sdk": "docker"})
    if st in (200, 201):
        print("Space creado:", repo)
    elif st == 409:
        print("Space ya existía:", repo)
    else:
        sys.exit("no se pudo crear el Space (%s): %s" % (st, r))
    _guardar({"repo": repo, "url": url_space(repo), "creado": time.strftime("%Y-%m-%dT%H:%M:%S")})
    subir()


def subir() -> None:
    env = _env(); token = _token(env); repo = _repo(env)
    lineas = [json.dumps({"key": "header", "value": {"summary": "enjambre nube-hf · %s" % time.strftime("%Y-%m-%d %H:%M"), "description": ""}})]
    for n in ARCHIVOS:
        ruta = os.path.join(CARPETA, n)
        contenido = base64.b64encode(open(ruta, "rb").read()).decode("ascii")
        lineas.append(json.dumps({"key": "file", "value": {"content": contenido, "path": n, "encoding": "base64"}}))
    st, r = _hf("POST", "/spaces/%s/commit/main" % repo, token, ndjson="\n".join(lineas) + "\n", timeout=120)
    if st not in (200, 201):
        sys.exit("subida fallida (%s): %s" % (st, r))
    print("subidos %d archivos a %s → %s" % (len(ARCHIVOS), repo, url_space(repo)))


def secretos() -> None:
    env = _env(); token = _token(env); repo = _repo(env)
    puestos, faltan = [], []
    for k in SECRETOS:
        v = (env.get(k) or "").strip()
        if not v:
            faltan.append(k); continue
        st, r = _hf("POST", "/spaces/%s/secrets" % repo, token, {"key": k, "value": v})
        (puestos if st in (200, 201) else faltan).append(k)
    for k in VARIABLES:
        v = (env.get(k) or "").strip()
        if v:
            _hf("POST", "/spaces/%s/variables" % repo, token, {"key": k, "value": v})
    if not env.get("STARSEED_NUBE_TOKEN"):
        print("aviso: sin STARSEED_NUBE_TOKEN; el Space usará STARSEED_LANZADOR_SECRETO como token de /bundle")
    print("secretos puestos:", ", ".join(puestos) or "ninguno")
    if faltan:
        print("sin valor en ~/.starseed/env (no se ponen):", ", ".join(faltan))
    _guardar({"secretos": puestos, "secretos_t": time.strftime("%Y-%m-%dT%H:%M:%S")})


def estado() -> None:
    env = _env(); token = _token(env); repo = _repo(env)
    st, r = _hf("GET", "/spaces/%s/runtime" % repo, token)
    print("runtime:", (r.get("stage") if isinstance(r, dict) else r), "· hardware:", (r.get("hardware", {}).get("current") if isinstance(r, dict) else "?"))
    try:
        with urllib.request.urlopen(url_space(repo) + "/estado", timeout=20) as x:
            e = json.load(x)
        print("enjambre: orquestador %s · %d agentes · %d commits por entregar" % ("vivo" if e.get("orquestador_vivo") else "parado", e.get("agentes", 0), len(e.get("commits_por_entregar") or [])))
        for c in (e.get("commits_por_entregar") or [])[:10]:
            print("   ", c)
    except Exception as ex:  # noqa: BLE001
        print("el Space aún no responde en", url_space(repo), "·", type(ex).__name__)


def despertar() -> None:
    env = _env(); repo = _repo(env)
    try:
        with urllib.request.urlopen(url_space(repo) + "/", timeout=30) as x:
            print(x.read().decode("utf-8", "replace").strip())
    except Exception as ex:  # noqa: BLE001
        print("sin respuesta:", type(ex).__name__)


def traer() -> None:
    env = _env(); repo = _repo(env)
    token = (env.get("STARSEED_NUBE_TOKEN") or env.get("STARSEED_LANZADOR_SECRETO") or "").strip()
    req = urllib.request.Request(url_space(repo) + "/bundle", headers={"X-Starseed-Token": token})
    with urllib.request.urlopen(req, timeout=120) as x:
        datos = x.read()
    if datos.startswith(b"{"):
        print("nada por entregar" if b"vacio" in datos else datos.decode("utf-8", "replace")[:200]); return
    destino = os.path.join(RAIZ, ".transfer"); os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, "nube-hf-%s.bundle" % time.strftime("%Y%m%d-%H%M%S"))
    open(ruta, "wb").write(datos)
    rama = "nube-hf"
    subprocess.run(["git", "fetch", "-q", ruta, "+main:" + rama], cwd=RAIZ, check=True)
    ff = subprocess.run(["git", "merge", "--ff-only", rama], cwd=RAIZ, capture_output=True, text=True)
    if ff.returncode != 0:
        m = subprocess.run(["git", "merge", "--no-edit", rama], cwd=RAIZ, capture_output=True, text=True)
        print("integrado por merge" if m.returncode == 0 else "conflicto: " + m.stdout[-300:])
    else:
        print("integrado por ff:", ff.stdout.strip()[:120])
    print("ahora: python3 scripts/puente/publicar.py (cuatro puertas y push desde la Mac)")


def cola(args: list[str]) -> None:
    subprocess.run([sys.executable, os.path.join(RAIZ, "scripts", "puente", "repartir-a-nube.py"), *args], cwd=RAIZ, check=False)


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    {"crear": lambda: crear(sys.argv[2] if len(sys.argv) > 2 else None), "subir": subir, "secretos": secretos,
     "estado": estado, "traer": traer, "despertar": despertar, "cola": lambda: cola(sys.argv[2:])}.get(orden, lambda: print(__doc__))()
