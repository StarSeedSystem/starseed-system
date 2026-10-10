#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mejoras instalables por neurona — el SONDEO real (architecture/mejoras-por-neurona.md §1-§3, §7).

Qué hace, en esta máquina (la neurona donde corre):
  · sondear    — consulta la fuente de versiones de cada sistema del registro
                 (src/lib/mejoras/registro-sistemas.json): releases y commits de GitHub,
                 Hugging Face, PyPI, npm y el catálogo firmado de capas de Astraura.
                 Caché de 6 h en ~/.starseed/mejoras/cache.json (fallos: 10 min); si una
                 fuente cae, se sirve la última versión buena marcada como «caché vieja».
  · huella     — el hardware REAL: RAM, disco libre, núcleos, GPU (modelo y VRAM) y
                 aceleraciones (Metal, CUDA, ROCm, Vulkan). Lo que el navegador no puede ver.
  · instaladas — lo instalado: ~/.starseed/mejoras/instaladas.json (lo escriben los
                 instaladores) más sondeos locales que responden de verdad (Ollama, ComfyUI).
  · estado     — las tres cosas juntas en ~/.starseed/mejoras/estado.json, para Genesis.

Las decisiones (qué cabe, qué se aplica y cuándo) NO están aquí: las toma el núcleo puro de
TypeScript (src/lib/mejoras/), con los datos que este sondeo deja escritos.

Claves: solo por nombre de variable. Si existe GITHUB_TOKEN (o GH_TOKEN) se usa en la
cabecera de GitHub para pasar de 60 a 5000 consultas por hora; nunca se imprime ni se guarda.

Uso:
    python3 scripts/puente/mejoras_neurona.py sondear [--forzar] [--json]
    python3 scripts/puente/mejoras_neurona.py huella [--json]
    python3 scripts/puente/mejoras_neurona.py instaladas [--json]
    python3 scripts/puente/mejoras_neurona.py estado [--forzar]
Pruebas: python3 -m unittest scripts/puente/test_mejoras_neurona.py
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

RAIZ = Path(__file__).resolve().parents[2]
REGISTRO_PATH = RAIZ / "src" / "lib" / "mejoras" / "registro-sistemas.json"
CATALOGO_PATH = RAIZ / "config" / "capas-astraura.json"

TTL_OK_S = 6 * 3600
TTL_FALLO_S = 10 * 60
PLAZO_FUENTE_S = 15
PLAZO_TOTAL_S = 120
PLAZO_LOCAL_S = 2
UA = "starseed-mejoras-neurona"

# (estado HTTP, JSON o None, cabeceras en minúsculas). Estado 0 = sin conexión.
Respuesta = Tuple[int, Any, Dict[str, str]]
Pedir = Callable[[str, Dict[str, str], float], Respuesta]


def dir_mejoras() -> Path:
    return Path(os.environ.get("STARSEED_MEJORAS_DIR") or os.path.expanduser("~/.starseed/mejoras"))


def ahora_iso(t: Optional[float] = None) -> str:
    return datetime.fromtimestamp(t if t is not None else time.time(), tz=timezone.utc).isoformat(timespec="seconds")


# ── Red ──────────────────────────────────────────────────────────────────────────────────

def pedir_http(url: str, cabeceras: Dict[str, str], plazo: float) -> Respuesta:
    """GET JSON. Nunca lanza: un fallo devuelve (estado, None, cabeceras)."""
    req = urllib.request.Request(url, headers=cabeceras)
    try:
        with urllib.request.urlopen(req, timeout=plazo) as r:
            hdrs = {k.lower(): v for k, v in r.headers.items()}
            return r.status, json.loads(r.read().decode("utf-8", "replace")), hdrs
    except urllib.error.HTTPError as e:
        return e.code, None, {k.lower(): v for k, v in (e.headers or {}).items()}
    except Exception:  # sin red, DNS, plazo, JSON roto
        return 0, None, {}


def _token_github() -> Optional[str]:
    for nombre in ("GITHUB_TOKEN", "GH_TOKEN"):
        v = (os.environ.get(nombre) or "").strip()
        if v:
            return v
    return None


def cabeceras_para(url: str) -> Dict[str, str]:
    c = {"User-Agent": UA, "Accept": "application/json"}
    if url.startswith("https://api.github.com/"):
        c["Accept"] = "application/vnd.github+json"
        tok = _token_github()
        if tok:
            c["Authorization"] = "Bearer " + tok
    return c


# ── Registro y fuentes ───────────────────────────────────────────────────────────────────

def leer_json(ruta: Path, defecto: Any) -> Any:
    try:
        with ruta.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def escribir_json(ruta: Path, datos: Any) -> None:
    """Escritura atómica (temporal + rename): un corte no deja el archivo a medias."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    tmp.replace(ruta)


def cargar_registro(ruta: Path = REGISTRO_PATH) -> List[Dict]:
    d = leer_json(ruta, {})
    return [s for s in (d.get("sistemas") or []) if isinstance(s, dict) and s.get("id") and isinstance(s.get("fuente"), dict)]


def cargar_catalogo(ruta: Path = CATALOGO_PATH) -> Dict[str, Dict]:
    d = leer_json(ruta, {})
    return {c["id"]: c for c in (d.get("capas") or []) if isinstance(c, dict) and c.get("id")}


_RE_HF = re.compile(r"^https?://huggingface\.co/([^/\s]+/[^/\s?#]+)")


def url_de(fuente: Dict, catalogo: Dict[str, Dict]) -> Optional[str]:
    tipo = fuente.get("tipo")
    ref = str(fuente.get("ref") or "").strip()
    if not ref:
        return None
    if tipo == "github-release":
        return f"https://api.github.com/repos/{ref}/releases/latest"
    if tipo == "github-commit":
        return f"https://api.github.com/repos/{ref}/commits?per_page=1"
    if tipo == "huggingface":
        return f"https://huggingface.co/api/models/{ref}?blobs=true"
    if tipo == "pypi":
        return f"https://pypi.org/pypi/{ref}/json"
    if tipo == "npm":
        return f"https://registry.npmjs.org/{ref}/latest"
    if tipo == "catalogo-capas":
        m = _RE_HF.match(str((catalogo.get(ref) or {}).get("fuente_oficial") or ""))
        return f"https://huggingface.co/api/models/{m.group(1)}?blobs=true" if m else None
    return None


def leer_version(tipo: str, js: Any) -> Optional[Dict]:
    """{version, fecha, verificable} desde la respuesta de cada fuente, o None si no se lee."""
    try:
        if tipo == "github-release" and isinstance(js, dict) and js.get("tag_name"):
            assets = js.get("assets") or []
            verif = any(str(a.get("digest") or "").startswith("sha256:") for a in assets if isinstance(a, dict))
            return {"version": str(js["tag_name"]), "fecha": js.get("published_at"), "verificable": verif}
        if tipo == "github-commit" and isinstance(js, list) and js and isinstance(js[0], dict) and js[0].get("sha"):
            fecha = ((js[0].get("commit") or {}).get("committer") or {}).get("date")
            # Un commit de git fija su contenido por hash: se puede verificar al clonar.
            return {"version": str(js[0]["sha"])[:7], "fecha": fecha, "verificable": True}
        if tipo in ("huggingface", "catalogo-capas") and isinstance(js, dict) and js.get("sha"):
            sib = js.get("siblings") or []
            verif = any(isinstance((s or {}).get("lfs"), dict) and re.fullmatch(r"[0-9a-f]{64}", str(s["lfs"].get("sha256") or "")) for s in sib if isinstance(s, dict))
            return {"version": str(js["sha"])[:7], "fecha": js.get("lastModified"), "verificable": bool(verif)}
        if tipo == "pypi" and isinstance(js, dict) and (js.get("info") or {}).get("version"):
            urls = js.get("urls") or []
            fecha = next((u.get("upload_time_iso_8601") for u in urls if isinstance(u, dict) and u.get("upload_time_iso_8601")), None)
            verif = any(((u or {}).get("digests") or {}).get("sha256") for u in urls if isinstance(u, dict))
            return {"version": str(js["info"]["version"]), "fecha": fecha, "verificable": bool(verif)}
        if tipo == "npm" and isinstance(js, dict) and js.get("version"):
            dist = js.get("dist") or {}
            return {"version": str(js["version"]), "fecha": None, "verificable": bool(dist.get("integrity") or dist.get("shasum"))}
    except Exception:
        return None
    return None


def motivo_error(estado: int, cabeceras: Dict[str, str], url: str) -> str:
    if estado == 0:
        return "sin conexión con la fuente"
    if url.startswith("https://api.github.com/") and estado in (403, 429) and cabeceras.get("x-ratelimit-remaining") == "0":
        return "límite de GitHub sin clave (60 consultas/hora): define GITHUB_TOKEN en el entorno"
    # 403 sin ninguna cabecera de GitHub: no contestó GitHub sino un proxy o cortafuegos de esta
    # red (medido el 2026-10-10 en el contenedor de la nube). Desde la Mac u Oracle sí llega.
    if url.startswith("https://api.github.com/") and estado == 403 and not any(k.startswith("x-github") or k.startswith("x-ratelimit") for k in cabeceras):
        return "GitHub bloqueado en esta red (403 de un proxy, no de GitHub): el sondeo de otra neurona sí llega"
    if estado == 404:
        return "la fuente no existe o no publica versiones (404)"
    if estado == 401:
        return "acceso condicionado: hay que aceptar los términos del modelo (401)"
    if estado == 200:
        return "la respuesta no trae versión legible"
    return f"la fuente respondió HTTP {estado}"


def consultar(sistema: Dict, catalogo: Dict[str, Dict], cache: Dict[str, Dict], ahora: float, pedir: Pedir,
              forzar: bool = False, github_cortado: Optional[List[str]] = None) -> Dict:
    """Versión remota de un sistema, con caché. Muta `cache`. Nunca lanza."""
    fuente = sistema.get("fuente") or {}
    tipo = str(fuente.get("tipo") or "")
    url = url_de(fuente, catalogo)
    if not url:
        return {"version": None, "fecha": None, "verificable": False, "error": "la fuente no tiene una URL que consultar"}
    ent = cache.get(url) if isinstance(cache.get(url), dict) else None
    if ent and not forzar:
        ttl = TTL_OK_S if ent.get("ok") else TTL_FALLO_S
        if ahora - float(ent.get("t") or 0) < ttl:
            return _desde_entrada(ent)
    if github_cortado and url.startswith("https://api.github.com/"):
        return _fallo(cache, url, ahora, github_cortado[0], ent, guardar=False)
    estado, js, hdrs = pedir(url, cabeceras_para(url), PLAZO_FUENTE_S)
    leida = leer_version(tipo, js) if estado == 200 else None
    if leida:
        cache[url] = {"t": ahora, "ok": True, "datos": leida}
        return {**leida, "error": None}
    err = motivo_error(estado, hdrs, url)
    if github_cortado is not None and "límite de GitHub" in err:
        github_cortado.append(err)
    return _fallo(cache, url, ahora, err, ent)


def _desde_entrada(ent: Dict) -> Dict:
    if ent.get("ok"):
        return {**ent["datos"], "error": None}
    ant = ent.get("anterior")
    if isinstance(ant, dict):
        return {**ant, "error": ent.get("error"), "cache_vieja": True}
    return {"version": None, "fecha": None, "verificable": False, "error": ent.get("error")}


def _fallo(cache: Dict, url: str, ahora: float, err: str, ent: Optional[Dict], guardar: bool = True) -> Dict:
    anterior = (ent or {}).get("datos") if (ent or {}).get("ok") else (ent or {}).get("anterior")
    if guardar:
        cache[url] = {"t": ahora, "ok": False, "error": err, **({"anterior": anterior} if isinstance(anterior, dict) else {})}
    if isinstance(anterior, dict):
        return {**anterior, "error": err, "cache_vieja": True}
    return {"version": None, "fecha": None, "verificable": False, "error": err}


def sondear(registro: List[Dict], catalogo: Dict[str, Dict], pedir: Optional[Pedir] = None, forzar: bool = False,
            ahora: Optional[float] = None, reloj: Callable[[], float] = time.monotonic) -> Dict:
    """Consulta todas las fuentes (con la caché en disco) y devuelve {generado, fuentes}."""
    pedir = pedir or pedir_http
    t = time.time() if ahora is None else ahora
    ruta_cache = dir_mejoras() / "cache.json"
    cache = leer_json(ruta_cache, {})
    cache = cache if isinstance(cache, dict) else {}
    cortado: List[str] = []
    inicio = reloj()
    fuentes: Dict[str, Dict] = {}
    for s in registro:
        if reloj() - inicio > PLAZO_TOTAL_S:
            fuentes[s["id"]] = {"version": None, "fecha": None, "verificable": False, "error": "sin tiempo en este sondeo; se reintenta en el siguiente"}
            continue
        fuentes[s["id"]] = consultar(s, catalogo, cache, t, pedir, forzar, cortado)
    escribir_json(ruta_cache, cache)
    return {"generado": ahora_iso(t), "fuentes": fuentes}


# ── Huella de la máquina ──────────────────────────────────────────────────────────────────

Ejecutar = Callable[[List[str]], Optional[str]]


def ejecutar(cmd: List[str]) -> Optional[str]:
    if not shutil.which(cmd[0]):
        return None
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return r.stdout if r.returncode == 0 else None
    except Exception:
        return None


def normalizar_nombre_maquina(nombre: str) -> str:
    """La MISMA normalización que src/lib/neurons/maquina-tipos.ts (para casar con la neurona)."""
    s = (nombre or "").strip().lower()
    s = re.sub(r"\.(local|lan|home|localdomain)$", "", s)
    return re.sub(r"\s+", "-", s)


def huella_maquina_hash(nombre: str) -> Optional[str]:
    n = normalizar_nombre_maquina(nombre)
    return hashlib.sha256(f"starseed-maquina:{n}".encode("utf-8")).hexdigest()[:16] if n else None


def _ram_linux(leer: Callable[[str], Optional[str]]) -> Optional[int]:
    txt = leer("/proc/meminfo") or ""
    m = re.search(r"^MemTotal:\s+(\d+)\s+kB", txt, re.M)
    return int(m.group(1)) // 1024 if m else None


def _leer_texto(ruta: str) -> Optional[str]:
    try:
        return Path(ruta).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None


def huella(run: Ejecutar = ejecutar, sistema: Optional[str] = None, maquina_cpu: Optional[str] = None,
           leer: Callable[[str], Optional[str]] = _leer_texto, hogar: Optional[str] = None,
           nombre_host: Optional[str] = None) -> Dict:
    so = (sistema or platform.system()).lower()
    arq = (maquina_cpu or platform.machine()).lower()
    out: Dict[str, Any] = {"sistema": "desconocido", "ram_mb": None, "disco_libre_mb": None, "nucleos": os.cpu_count(),
                           "gpu": {"familia": "desconocida", "modelo": None, "vram_mb": None}, "aceleraciones": ["cpu"],
                           "arquitectura": arq, "maquina": huella_maquina_hash(nombre_host if nombre_host is not None else socket.gethostname())}
    try:
        out["disco_libre_mb"] = shutil.disk_usage(hogar or os.path.expanduser("~")).free // (1024 * 1024)
    except Exception:
        pass
    if so == "darwin":
        out["sistema"] = "macos"
        mem = (run(["sysctl", "-n", "hw.memsize"]) or "").strip()
        out["ram_mb"] = int(mem) // (1024 * 1024) if mem.isdigit() else None
        marca = (run(["sysctl", "-n", "machdep.cpu.brand_string"]) or "").strip()
        if arq in ("arm64", "aarch64"):
            out["gpu"] = {"familia": "apple", "modelo": marca or None, "vram_mb": None}  # memoria unificada
        out["aceleraciones"].append("metal")  # todo Mac con macOS actual tiene Metal
    elif so == "linux":
        out["sistema"] = "android" if os.environ.get("ANDROID_ROOT") else "linux"
        out["ram_mb"] = _ram_linux(leer)
    elif so == "windows":
        out["sistema"] = "windows"
    smi = run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
    if smi and smi.strip():
        nombre, _, vram = smi.strip().splitlines()[0].partition(",")
        out["gpu"] = {"familia": "nvidia", "modelo": nombre.strip() or None, "vram_mb": int(vram.strip()) if vram.strip().isdigit() else None}
        out["aceleraciones"].append("cuda")
    if out["sistema"] == "linux" and (Path("/opt/rocm").exists() or run(["rocminfo"])):
        out["aceleraciones"].append("rocm")
    if run(["vulkaninfo", "--summary"]):
        out["aceleraciones"].append("vulkan")
    return out


# ── Lo instalado ─────────────────────────────────────────────────────────────────────────

SONDEOS_LOCALES = (
    ("ollama", "http://127.0.0.1:11434/api/version", lambda j: j.get("version")),
    ("comfyui", "http://127.0.0.1:8188/system_stats", lambda j: (j.get("system") or {}).get("comfyui_version")),
)


def instaladas(pedir: Optional[Pedir] = None) -> Dict[str, Dict]:
    """Lo que declaran los instaladores + lo que responde de verdad en esta máquina (manda lo medido)."""
    pedir = pedir or pedir_http
    crudo = leer_json(dir_mejoras() / "instaladas.json", {})
    out: Dict[str, Dict] = {}
    for sid, v in (crudo.items() if isinstance(crudo, dict) else []):
        if isinstance(v, dict) and isinstance(v.get("version"), str) and v["version"].strip():
            out[str(sid)] = {**{k: v[k] for k in ("version", "medio", "sha256", "desde") if isinstance(v.get(k), str)}, "origen": "registro"}
    for sid, url, sacar in SONDEOS_LOCALES:
        estado, js, _ = pedir(url, {"User-Agent": UA}, PLAZO_LOCAL_S)
        try:
            ver = sacar(js) if estado == 200 and isinstance(js, dict) else None
        except Exception:
            ver = None
        if isinstance(ver, str) and ver.strip():
            out[sid] = {"version": ver.strip(), "medio": "servidor", "origen": "sondeo-local"}
    return out


def estado(forzar: bool = False, pedir: Optional[Pedir] = None) -> Dict:
    registro = cargar_registro()
    datos = {
        "esquema": 1,
        "generado": ahora_iso(),
        "huella": huella(),
        "instaladas": instaladas(pedir),
        "remotas": sondear(registro, cargar_catalogo(), pedir, forzar)["fuentes"],
    }
    escribir_json(dir_mejoras() / "estado.json", datos)
    return datos


# ── CLI ──────────────────────────────────────────────────────────────────────────────────

def _resumen_remotas(registro: List[Dict], fuentes: Dict[str, Dict]) -> str:
    filas = []
    for s in registro:
        f = fuentes.get(s["id"]) or {}
        ver = f.get("version") or "—"
        marca = " (caché vieja)" if f.get("cache_vieja") else ""
        err = f"  ⚠ {f['error']}" if f.get("error") else ""
        filas.append(f"  {s['id']:<26} {ver:<16}{marca}{err}")
    ok = sum(1 for f in fuentes.values() if f.get("version"))
    return f"Fuentes con versión: {ok}/{len(fuentes)}\n" + "\n".join(filas)


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Mejoras instalables por neurona: sondeo de versiones, huella e instaladas.")
    ap.add_argument("orden", choices=["sondear", "huella", "instaladas", "estado"])
    ap.add_argument("--forzar", action="store_true", help="ignorar la caché de 6 h")
    ap.add_argument("--json", action="store_true", help="salida JSON")
    a = ap.parse_args(argv)
    if a.orden == "sondear":
        reg = cargar_registro()
        r = sondear(reg, cargar_catalogo(), forzar=a.forzar)
        print(json.dumps(r, ensure_ascii=False, indent=2) if a.json else _resumen_remotas(reg, r["fuentes"]))
    elif a.orden == "huella":
        h = huella()
        print(json.dumps(h, ensure_ascii=False, indent=2) if a.json else
              f"{h['sistema']} · {h['ram_mb']} MB RAM · {h['disco_libre_mb']} MB libres · {h['nucleos']} núcleos · "
              f"GPU {h['gpu']['familia']} {h['gpu']['modelo'] or ''} · {', '.join(h['aceleraciones'])}")
    elif a.orden == "instaladas":
        i = instaladas()
        print(json.dumps(i, ensure_ascii=False, indent=2) if a.json else
              ("\n".join(f"  {k:<26} {v['version']}  ({v['origen']})" for k, v in i.items()) or "Nada registrado ni respondiendo en esta máquina."))
    else:
        d = estado(forzar=a.forzar)
        print(f"Estado escrito en {dir_mejoras() / 'estado.json'}")
        print(_resumen_remotas(cargar_registro(), d["remotas"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
