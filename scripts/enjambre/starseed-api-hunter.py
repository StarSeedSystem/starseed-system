#!/usr/bin/env python3
"""StarSeed API Hunter — Busca y valida APIs LLM gratuitas automáticamente.

Escanea fuentes públicas (free-llm-api-hub, awesome-free-inference, etc.),
prueba endpoints, y actualiza el catálogo local de proveedores vivos.

Se ejecuta como trabajo periódico (cada 6 horas) o bajo demanda.
"""

import json
import os
import re
import time
import urllib.request
import urllib.error
import ssl
import subprocess
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
CATALOGO = RAIZ / "starseed_memory_root/fuentes/apis-llm-descubiertas.json"
LOG = RAIZ / "starseed_memory_root/logs/api-hunter.log"

# Fuentes de investigación (raw README markdown o JSON)
FUENTES = [
    {
        "nombre": "free-llm-api-hub",
        "url": "https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/collections/openai-compatible.md",
        "tipo": "markdown",
    },
    {
        "nombre": "awesome-free-inference",
        "url": "https://raw.githubusercontent.com/bradAGI/awesome-free-inference/main/README.md",
        "tipo": "markdown",
    },
    {
        "nombre": "free-llm-api",
        "url": "https://raw.githubusercontent.com/xyzs996/free-llm-api/main/README.md",
        "tipo": "markdown",
    },
    {
        "nombre": "FreeLLMAPI-models",
        "url": "https://freellmapi.co/models",
        "tipo": "html",
    },
]

# Patrones de extracción (regex para markdown)
PATRONES = [
    # Tabla markdown: | Provider | Auth | URL |
    r'\|\s*([^|]+?)\s*\|\s*(?:[^*]*?)\*\*(https?://[^|\s]+)\*\*',
    # Link con texto
    r'\[([^\]]+?)\]\((https?://[^)]+)\)',
    # URL directa
    r'(https?://[^\s\)]+/v\d+(?:/[^\s\)]*)?)',
]


def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def cargar_env():
    """Carga variables desde archivos .env"""
    env_paths = [
        os.path.expanduser("~/.hermes/.env"),
        os.path.expanduser("~/.starseed/env"),
    ]
    for path in env_paths:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key.replace("_", "").isalnum():
                    os.environ.setdefault(key, value)


def fetch_url(url):
    """Descarga contenido URL"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "hermes-agent"})
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        return None


def extraer_endpoints(texto):
    """Extrae endpoints candidatos de un texto"""
    endpoints = set()
    for patron in PATRONES:
        matches = re.findall(patron, texto)
        for m in matches:
            if isinstance(m, tuple) and len(m) > 1:
                url = m[1]
            elif isinstance(m, str):
                url = m
            else:
                continue
            # Normalizar
            url = url.rstrip("/")
            if "/v1" in url or "/v4" in url:
                # Asegurar que tenga /chat/completions
                if "/chat/completions" not in url:
                    url = url + "/chat/completions"
                endpoints.add(url)
    return list(endpoints)


def probar_endpoint(url, api_key=None):
    """Prueba un endpoint. Retorna (status, latencia_ms) o (0, 0)"""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    
    payload = json.dumps({
        "model": "auto",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5,
    }).encode()

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    inicio = time.time()
    try:
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            status = resp.read(100)
            return resp.status, int((time.time() - inicio) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, int((time.time() - inicio) * 1000)
    except Exception:
        return 0, 0


def cargar_catalogo():
    """Carga catálogo existente"""
    if CATALOGO.exists():
        with open(CATALOGO) as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                pass
    return {"proveedores": [], "actualizado": None}


def guardar_catalogo(cat):
    """Guarda catálogo"""
    CATALOGO.parent.mkdir(parents=True, exist_ok=True)
    cat["actualizado"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(CATALOGO, "w") as f:
        json.dump(cat, f, indent=2, ensure_ascii=False)


def escanear_fuente(fuente):
    """Escanea una fuente y retorna endpoints vivos"""
    log(f"Escaneando {fuente['nombre']}...")
    texto = fetch_url(fuente["url"])
    if not texto:
        log(f"  No se pudo descargar {fuente['url']}")
        return []

    endpoints = extraer_endpoints(texto)
    vivos = []
    
    for ep in endpoints[:20]:  # Limitar para no saturar
        status, lat = probar_endpoint(ep)
        if status == 200:
            vivos.append({
                "url": ep,
                "latencia_ms": lat,
                "fuente": fuente["nombre"],
            })
            log(f"  ✅ {ep} ({lat}ms)")
        elif status in (401, 403):
            log(f"  🔒 {ep} (requiere auth, status {status})")
        else:
            log(f"  ❌ {ep} (HTTP {status})")

    return vivos


def main():
    cargar_env()
    cat = cargar_catalogo()
    todos_vivos = []

    for fuente in FUENTES:
        try:
            vivos = escanear_fuente(fuente)
            todos_vivos.extend(vivos)
        except Exception as e:
            log(f"Error en {fuente['nombre']}: {e}")

    # Actualizar catálogo
    existentes = {p["url"] for p in cat["proveedores"]}
    nuevos = 0
    for v in todos_vivos:
        if v["url"] not in existentes:
            cat["proveedores"].append({
                "url": v["url"],
                "estado": "vivo",
                "latencia_ms": v["latencia_ms"],
                "fuente": v["fuente"],
                "descubierto": time.strftime("%Y-%m-%d"),
            })
            existentes.add(v["url"])
            nuevos += 1

    guardar_catalogo(cat)
    log(f"Escaneo completo: {len(todos_vivos)} vivos, {nuevos} nuevos")
    print(f"\n✅ Catálogo actualizado: {len(cat['proveedores'])} proveedores, {nuevos} nuevos")


if __name__ == "__main__":
    main()
