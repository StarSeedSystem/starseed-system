# -*- coding: utf-8 -*-
"""n8n Community en un Space de Hugging Face (ola 1005B, tarea PRD1005Tb).

El Space es Docker y PRIVADO: las peticiones llevan HF_TOKEN. El disco gratuito
no persiste, así que los flujos viven en este repo (`deploy/n8n-hf/flujos/*.json`)
y `arranque.sh` los importa y activa por la CLI en cada arranque.

Uso (HF_TOKEN en ~/.starseed/env con permiso de escritura):
  n8n_hf.py estado             runtime del Space configurado en N8N_HF_SPACE
  n8n_hf.py despertar          salud del Space, con tope de 60 s
  n8n_hf.py desplegar [--seco] sube deploy/n8n-hf/ al Space; en --seco solo lista

Nunca imprime claves: como mucho, el host del Space.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARPETA = os.path.join(RAIZ, "deploy", "n8n-hf")
ARCHIVOS_FIJOS = ("Dockerfile", "arranque.sh", "README.md")
CARPETA_FLUJOS = "flujos"


def leer_env(entorno: dict | None = None) -> dict:
    """Variables del entorno más ~/.starseed/env (sin imprimir valores)."""
    salida = dict(entorno if entorno is not None else os.environ)
    ruta = salida.get("STARSEED_ENV", os.path.expanduser("~/.starseed/env"))
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


def space_de(env: dict) -> str:
    repo = (env.get("N8N_HF_SPACE") or "").strip()
    if not repo or "/" not in repo:
        raise SystemExit("falta N8N_HF_SPACE (usuario/nombre) en el entorno o en ~/.starseed/env")
    return repo


def token_de(env: dict) -> str:
    t = (env.get("HF_TOKEN") or "").strip()
    if not t:
        raise SystemExit("falta HF_TOKEN en el entorno o en ~/.starseed/env")
    return t


def url_space(repo: str) -> str:
    return "https://%s.hf.space" % repo.replace("/", "-").replace(".", "-").replace("_", "-").lower()


def archivos_a_subir(carpeta: str = CARPETA) -> list[str]:
    """Rutas relativas de lo que se sube: fijos + todos los JSON de flujos/."""
    rutas = [n for n in ARCHIVOS_FIJOS if os.path.isfile(os.path.join(carpeta, n))]
    dir_flujos = os.path.join(carpeta, CARPETA_FLUJOS)
    if os.path.isdir(dir_flujos):
        for n in sorted(os.listdir(dir_flujos)):
            if n.endswith(".json") and os.path.isfile(os.path.join(dir_flujos, n)):
                rutas.append("%s/%s" % (CARPETA_FLUJOS, n))
    return rutas


def construir_ndjson(rutas: list[str], carpeta: str = CARPETA) -> str:
    lineas = [json.dumps({"key": "header", "value": {
        "summary": "n8n producción n8n-hf · %s" % time.strftime("%Y-%m-%d %H:%M"),
        "description": ""}})]
    for rel in rutas:
        datos = open(os.path.join(carpeta, rel), "rb").read()
        lineas.append(json.dumps({"key": "file", "value": {
            "path": rel, "encoding": "base64",
            "content": base64.b64encode(datos).decode("ascii")}}))
    return "\n".join(lineas) + "\n"


class ClienteHF:
    """Envoltorio mínimo de la API de Hugging Face (urllib, sin dependencias)."""

    def __init__(self, peticionar):
        self._enviar = peticionar

    @staticmethod
    def real(token: str) -> "ClienteHF":
        import urllib.error
        import urllib.request
        api = "https://huggingface.co/api"

        def enviar(metodo: str, ruta: str, cuerpo=None, ndjson=None, timeout=60):
            datos = None
            cab = {"Authorization": "Bearer " + token}
            if ndjson is not None:
                datos = ndjson.encode("utf-8")
                cab["Content-Type"] = "application/x-ndjson"
            elif cuerpo is not None:
                datos = json.dumps(cuerpo).encode("utf-8")
                cab["Content-Type"] = "application/json"
            req = urllib.request.Request(api + ruta, data=datos, headers=cab, method=metodo)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    texto = r.read().decode("utf-8", "replace")
                    es_json = texto.strip().startswith(("{", "["))
                    return r.status, (json.loads(texto) if es_json else texto)
            except urllib.error.HTTPError as e:
                return e.code, e.read().decode("utf-8", "replace")[:400]

        return ClienteHF(enviar)

    def runtime(self, repo: str):
        return self._enviar("GET", "/spaces/%s/runtime" % repo)

    def commit(self, repo: str, ndjson: str):
        return self._enviar("POST", "/spaces/%s/commit/main" % repo, ndjson=ndjson, timeout=120)


def plan_despliegue(carpeta: str = CARPETA) -> dict:
    """Qué subiría `desplegar` (puro: no toca red)."""
    rutas = archivos_a_subir(carpeta)
    return {"archivos": rutas, "total": len(rutas),
            "bytes": sum(os.path.getsize(os.path.join(carpeta, r)) for r in rutas)}


def desplegar(seco: bool = False, cliente=None, env: dict | None = None,
              carpeta: str = CARPETA, imprimir=print) -> dict:
    env = leer_env(env)
    repo = space_de(env)
    plan = plan_despliegue(carpeta)
    if not plan["total"]:
        raise SystemExit("no hay nada que subir en %s" % os.path.relpath(carpeta, RAIZ))
    if seco:
        imprimir("--seco: subiría a %s:" % repo)
        for r in plan["archivos"]:
            imprimir("  %s (%d B)" % (r, os.path.getsize(os.path.join(carpeta, r))))
        return plan
    cliente = cliente or ClienteHF.real(token_de(env))
    st, r = cliente.commit(repo, construir_ndjson(plan["archivos"], carpeta))
    if st not in (200, 201):
        raise SystemExit("subida fallida (%s): %s" % (st, r))
    imprimir("subidos %d archivos a %s → %s" % (plan["total"], repo, url_space(repo)))
    return plan


def estado(cliente=None, env: dict | None = None, imprimir=print) -> dict:
    env = leer_env(env)
    repo = space_de(env)
    cliente = cliente or ClienteHF.real(token_de(env))
    st, r = cliente.runtime(repo)
    etapa = r.get("stage") if isinstance(r, dict) else r
    if st != 200:
        raise SystemExit("HF no responde (%s): %s" % (st, r))
    imprimir("runtime: %s · space %s" % (etapa, repo))
    return {"repo": repo, "stage": etapa, "url": url_space(repo)}


def despertar(env: dict | None = None, tope_s: int = 60, abrir=None,
              dormir=time.sleep, reloj=time.monotonic, imprimir=print) -> bool:
    """Salud del Space con HF_TOKEN (es privado); devuelve True si responde antes del tope."""
    env = leer_env(env)
    repo = space_de(env)
    url = url_space(repo)
    imprimir("salud: %s (host, sin clave)" % url.split("/", 3)[2])

    def abrir_real(u: str, t: int) -> int:
        import urllib.request
        req = urllib.request.Request(u, headers={"Authorization": "Bearer " + token_de(env)})
        with urllib.request.urlopen(req, timeout=t) as x:
            return x.status

    abrir = abrir or abrir_real
    fin = reloj() + tope_s
    while True:
        restante = max(1, int(fin - reloj()))
        try:
            if abrir(url, min(restante, 20)) < 500:
                imprimir("despierto")
                return True
        except Exception as ex:  # noqa: BLE001 — nunca se imprime la URL completa con cabeceras
            if reloj() >= fin:
                imprimir("no despierta en %d s (%s)" % (tope_s, type(ex).__name__))
                return False
        if reloj() >= fin:
            imprimir("no despierta en %d s" % tope_s)
            return False
        dormir(min(5, max(1, int(fin - reloj()))))


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    if orden == "estado":
        estado()
    elif orden == "despertar":
        sys.exit(0 if despertar() else 1)
    elif orden == "desplegar":
        desplegar(seco="--seco" in sys.argv[2:])
    else:
        print(__doc__)
