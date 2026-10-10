#!/usr/bin/env python3
"""Refresca las versiones del catálogo de la Protomolécula.

Solo CONSULTA la API pública de GitHub: nunca descarga ni instala nada.
Sin claves: anónimo, máx. 60 consultas/h, con caché de 6 h.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

TTL = 6 * 3600
CABECERAS = {"User-Agent": "starseed-protomolecula"}
OBJETO_RE = re.compile(
    r"id\s*:\s*[\"']([^\"']+)[\"'][\s\S]*?"
    r"repositorio\s*:\s*[\"']([^\"']+)[\"']"
)
GITHUB_RE = re.compile(r"(?:github\.com[:/])?([\w.-]+)/([\w.-]+?)(?:\.git)?$")


def extraer_herramientas(texto):
    """Extrae {id: owner/repo} del TS del catálogo."""
    herramientas = {}
    for ident, repo in OBJETO_RE.findall(texto):
        m = GITHUB_RE.search(repo.strip())
        if m:
            herramientas[ident] = f"{m.group(1)}/{m.group(2)}"
    return herramientas


def cargar_cache(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        if time.time() - datos.get("cuando", 0) < TTL:
            return datos.get("entradas", {})
    except (OSError, ValueError):
        pass
    return {}


def guardar_cache(ruta, entradas):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"cuando": time.time(), "entradas": entradas}, f)


def pedir_json(url, reintento=True):
    """Consulta JSON; ante límite de la API espera al reinicio y reintenta una vez."""
    try:
        req = urllib.request.Request(url, headers=CABECERAS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.load(resp), None, None
    except urllib.error.HTTPError as e:
        if e.code in (403, 429) and reintento:
            espera = int(e.headers.get("x-ratelimit-reset", 0)) - time.time()
            if espera > 0:
                time.sleep(min(espera, 3700))
            return pedir_json(url, reintento=False)
        return None, f"HTTP {e.code}", e.code
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        return None, str(e), None


def sha_de_activos(activos):
    for a in activos or []:
        digest = a.get("digest") if isinstance(a, dict) else None
        if digest:
            return digest
    return None


def comprobar(repo):
    """Devuelve la entrada de versión para owner/repo."""
    base = "https://api.github.com/repos/" + repo
    datos, error, _ = pedir_json(base + "/releases/latest")
    if datos:
        return {
            "version": datos.get("tag_name") or datos.get("name"),
            "fecha": datos.get("published_at"),
            "licencia": (datos.get("license") or {}).get("spdx_id"),
            "sha": sha_de_activos(datos.get("assets")),
            "estado": "disponible",
        }
    datos2, error2, _ = pedir_json(base + "/tags?per_page=1")
    if datos2:
        return {"version": datos2[0].get("name"), "fecha": None,
                "licencia": None, "sha": None, "estado": "disponible"}
    if error == "HTTP 404" and error2 == "HTTP 404":
        return {"version": None, "fecha": None, "licencia": None, "sha": None,
                "estado": "error", "motivo": "repositorio inexistente"}
    motivo = error2 or error or "sin respuesta"
    return {"version": None, "fecha": None, "licencia": None, "sha": None,
            "estado": "sin-comprobar", "motivo": motivo}


def informe(herramientas):
    print(f"{'herramienta':<22} {'conocida':<14} {'nueva':<14} estado")
    for ident, e in herramientas.items():
        print(f"{ident:<22} {str(e.get('version')):<14} "
              f"{str(e.get('version')):<14} {e.get('estado')}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--catalogo", default=None)
    ap.add_argument("--salida", default=None)
    ap.add_argument("--cache", default=os.path.expanduser(
        "~/.starseed/cache/protomolecula-versiones.json"))
    ap.add_argument("--solo-informe", action="store_true")
    args = ap.parse_args()

    raiz = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    catalogo = args.catalogo or os.path.join(
        raiz, "src/lib/protomolecula/catalogo-herramientas.ts")
    salida = args.salida or os.path.join(
        raiz, "config/protomolecula-versiones.json")

    if not os.path.exists(catalogo):
        print("falta el catálogo de herramientas", file=sys.stderr)
        return 2
    with open(catalogo, encoding="utf-8") as f:
        herramientas = extraer_herramientas(f.read())

    cache = cargar_cache(args.cache)
    resultado = {}
    for ident, repo in herramientas.items():
        resultado[ident] = cache.get(repo) or comprobar(repo)
        cache[repo] = resultado[ident]
    documento = {"actualizado": time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                              time.gmtime()),
                 "herramientas": resultado}
    if args.solo_informe:
        informe(resultado)
    else:
        os.makedirs(os.path.dirname(salida), exist_ok=True)
        with open(salida, "w", encoding="utf-8") as f:
            json.dump(documento, f, ensure_ascii=False, indent=2)
        guardar_cache(args.cache, cache)
        print(f"catálogo de versiones escrito en {salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
