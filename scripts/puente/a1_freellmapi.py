#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FreeLLMAPI en el A1 de Oracle, SOLO en local (127.0.0.1:3001). Corre EN el A1 como root.

Lo envía `oracle_nodo.freellmapi()` por ssh (`sudo python3 -`, el código por la entrada estándar).

POR QUÉ (2026-10-13): en la Mac FreeLLMAPI reparte entre los proveedores gratuitos tras un solo
bearer y es uno de los escritores que más trabaja (NVIDIA, Gemini, OpenRouter… con failover). El
A1 no lo tenía: sus agentes solo podían usar los proveedores sueltos y se quedaban «esperando
proveedor» cuando se agotaba uno. Con FreeLLMAPI en el A1, sus agentes tienen el mismo enrutador.

CÓMO (sin exponer nada):
- Misma versión que la Mac (`COMMIT`), en `~starseed/herramientas/freellmapi`, `npm ci` + build del
  servidor (el panel web no se compila: no se sirve).
- Escucha SOLO en 127.0.0.1 (`HOST`): ni la red de Oracle ni internet lo ven.
- Las claves de proveedor NO se escriben en ningún archivo nuevo: el lanzador lee
  `~starseed/.starseed/env` (600, el que ya deja `oracle_nodo.claves()`) y arma la configuración
  en memoria (`FREEAPI_CONFIG_JSON`), igual que `freellmapi-lanzar.sh` de la Mac. Dentro las guarda
  cifradas con su propia `ENCRYPTION_KEY`.
- La clave unificada del A1 es la misma que la de la Mac (`FREELLMAPI_KEY`, llega por la lista
  blanca de `oracle_nodo.claves()`): así el orquestador del A1 usa las mismas variables
  `STARSEED_PASARELA_FREELLMAPI_*` sin que nadie las reescriba.
- Servicio systemd `starseed-freellmapi` (usuario starseed, MemoryMax 1G, se reinicia solo).
Nunca imprime un valor: solo nombres y códigos HTTP."""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import time
import urllib.request

USUARIO = "starseed"
CASA = "/home/starseed"
DIR = CASA + "/herramientas/freellmapi"
LANZADOR = CASA + "/herramientas/freellmapi-lanzar.sh"
REPO = "https://github.com/tashfeenahmed/freellmapi.git"
COMMIT = "47c3a45"
UNIDAD = "/etc/systemd/system/starseed-freellmapi.service"
PUERTO = 3001

LANZADOR_SH = r"""#!/bin/bash
# StarSeed · FreeLLMAPI en el A1, SOLO en 127.0.0.1:3001 (lo escribe scripts/puente/a1_freellmapi.py).
# Las claves de proveedor no se escriben en ningún archivo nuevo: se leen de ~/.starseed/env y se le
# pasan al proceso en FREEAPI_CONFIG_JSON. Su ENCRYPTION_KEY sí vive en su .env (es SU secreto).
set -u
DIR="$HOME/herramientas/freellmapi"
cd "$DIR" || exit 1
set -a; . "$HOME/.starseed/env" 2>/dev/null; set +a
if [ ! -f .env ] || ! grep -q '^ENCRYPTION_KEY=' .env; then
  umask 077
  printf 'ENCRYPTION_KEY=%s\n' "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" > .env
  chmod 600 .env
fi
set -a; . ./.env; set +a
export HOST=127.0.0.1 PORT=3001 NODE_ENV=production
export FREEAPI_CONFIG_JSON="$(python3 - <<'PY'
import json, os
mapa = [("GROQ_API_KEY", "groq"), ("NVIDIA_API_KEY", "nvidia"), ("OPENROUTER_API_KEY", "openrouter"),
        ("HF_TOKEN", "huggingface"), ("XKIRO_API_KEY", "xkiro"), ("GEMINI_API_KEY", "google"),
        ("MISTRAL_API_KEY", "mistral"), ("CEREBRAS_API_KEY", "cerebras"), ("COHERE_API_KEY", "cohere")]
keys = [{"platform": p, "key": os.environ[v], "label": "starseed"} for v, p in mapa if os.environ.get(v)]
print(json.dumps({"keys": keys, "routing": {"strategy": "balanced"}}))
PY
)"
# La clave unificada: la misma que la de la Mac (FREELLMAPI_KEY), para que valgan las mismas
# variables STARSEED_PASARELA_FREELLMAPI_* en las dos máquinas. La base se crea en el primer arranque.
if [ -n "${FREELLMAPI_KEY:-}" ]; then
  if [ ! -f server/data/freeapi.db ]; then
    PORT=3999 timeout 45 node server/dist/index.js >/dev/null 2>&1 || true
  fi
  node -e '
    const D = require("better-sqlite3");
    const db = new D("server/data/freeapi.db");
    const r = db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(process.env.FREELLMAPI_KEY, "unified_api_key");
    console.log("[lanzar] clave unificada " + (r.changes ? "al día" : "SIN fila de ajustes"));
    db.close();
  ' || echo "[lanzar] no pude poner la clave unificada"
fi
n=$(python3 -c 'import json,os;print(len(json.loads(os.environ["FREEAPI_CONFIG_JSON"])["keys"]))')
echo "[$(date -u +%FT%TZ)] freellmapi arranca en 127.0.0.1:3001 con $n claves de proveedor"
exec node server/dist/index.js
"""

UNIDAD_TXT = """[Unit]
Description=StarSeed · FreeLLMAPI solo en local (127.0.0.1:3001)
After=network-online.target
Wants=network-online.target

[Service]
User=starseed
Group=starseed
WorkingDirectory=/home/starseed/herramientas/freellmapi
Environment=HOME=/home/starseed
Environment=PATH=/home/starseed/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/bash /home/starseed/herramientas/freellmapi-lanzar.sh
Restart=always
RestartSec=30
Nice=5
MemoryMax=1G
StandardOutput=append:/var/log/starseed/freellmapi.log
StandardError=append:/var/log/starseed/freellmapi.log

[Install]
WantedBy=multi-user.target
"""


def paso(texto):
    print("[a1-freellmapi] " + texto, flush=True)


def como_starseed(orden, cwd=None, timeout=3600):
    r = subprocess.run(["runuser", "-u", USUARIO, "--", "env", "HOME=" + CASA, "bash", "-lc", orden], cwd=cwd,
                       capture_output=True, text=True, timeout=timeout)
    return r.returncode, ((r.stdout or "") + (r.stderr or ""))[-600:]


def escribir(ruta, texto, modo, dueno=True):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as f:
        f.write(texto)
    os.chmod(ruta + ".tmp", modo)
    if dueno:
        subprocess.run(["chown", "%s:%s" % (USUARIO, USUARIO), ruta + ".tmp"])
    os.replace(ruta + ".tmp", ruta)


def huella(ruta):
    try:
        with open(ruta, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:16]
    except OSError:
        return ""


def main():
    os.makedirs(CASA + "/herramientas", exist_ok=True)
    subprocess.run(["chown", "%s:%s" % (USUARIO, USUARIO), CASA + "/herramientas"])
    if not os.path.isdir(DIR + "/.git"):
        rc, s = como_starseed("git clone -q %s %s" % (REPO, DIR), timeout=600)
        paso("clonado" if rc == 0 else "no pude clonar: " + s)
        if rc != 0:
            return 1
    rc, s = como_starseed("git fetch -q origin && git -c advice.detachedHead=false checkout -q %s" % COMMIT, cwd=DIR, timeout=600)
    if rc != 0:
        paso("no pude ir a %s: %s" % (COMMIT, s))
        return 1
    paso("versión %s (la de la Mac)" % COMMIT)
    marca = DIR + "/node_modules/.huella-lock"
    if huella(DIR + "/package-lock.json") != (open(marca).read().strip() if os.path.exists(marca) else ""):
        t0 = time.time()
        rc, s = como_starseed("nice -n 10 npm ci --no-audit --no-fund --loglevel=error", cwd=DIR, timeout=3000)
        if rc != 0:
            paso("npm ci falló: " + s)
            return 1
        escribir(marca, huella(DIR + "/package-lock.json"), 0o644)
        paso("dependencias instaladas en %d s" % (time.time() - t0))
    if not os.path.exists(DIR + "/server/dist/index.js") or os.path.getmtime(DIR + "/server/dist/index.js") < os.path.getmtime(marca):
        t0 = time.time()
        rc, s = como_starseed("nice -n 10 npm run build:server", cwd=DIR, timeout=1800)
        if rc != 0:
            paso("build del servidor falló: " + s)
            return 1
        paso("servidor compilado en %d s" % (time.time() - t0))
    escribir(LANZADOR, LANZADOR_SH, 0o700)
    os.makedirs("/var/log/starseed", exist_ok=True)
    escribir(UNIDAD, UNIDAD_TXT, 0o644, dueno=False)
    subprocess.run(["systemctl", "daemon-reload"])
    subprocess.run(["systemctl", "enable", "-q", "starseed-freellmapi"])
    subprocess.run(["systemctl", "restart", "starseed-freellmapi"])
    paso("servicio starseed-freellmapi (re)arrancado")
    codigo = None
    for _ in range(40):
        time.sleep(3)
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/v1/models" % PUERTO, timeout=5) as r:
                codigo = r.status
        except urllib.error.HTTPError as e:
            codigo = e.code
        except Exception:  # noqa: BLE001 — aún arrancando
            continue
        break
    paso("responde en 127.0.0.1:%d con HTTP %s (401 = pide la clave unificada: bien)" % (PUERTO, codigo))
    escucha = subprocess.run(["ss", "-ltnH", "sport = :%d" % PUERTO], capture_output=True, text=True).stdout
    publico = [l for l in escucha.splitlines() if "127.0.0.1:%d" % PUERTO not in l]
    paso("escucha solo en local" if escucha and not publico else "OJO: escucha fuera de 127.0.0.1")
    return 0 if codigo and not publico else 1


if __name__ == "__main__":
    sys.exit(main())
