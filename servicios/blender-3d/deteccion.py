#!/usr/bin/env python3
"""Detección de Blender por neurona (contrato `architecture/blender-3d.md` §2 y §3).

`sonda_blender.py` corre DENTRO de Blender e imprime `STARSEED_SONDA:` + JSON canónico con
"gpu", "dispositivos", "motores" y "ffmpeg". `perfil_de` devuelve el perfil y los topes planos.
Sin rutas absolutas ni usuario; proceso hijo por lista de argumentos, SIN shell, sin `bpy`.
"""
import json, os, re, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402

PREFIJO, GPUS = "STARSEED_SONDA:", ("metal", "cuda", "optix", "hip", "oneapi")
VERSION_RE = re.compile(r"Blender\s+(\d+)\.(\d+)(?:\.(\d+))?")
HASH_RE = re.compile(r"build hash:\s*([0-9a-fA-F]+)")
FIJAS = [Path(p) for p in ("/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender", "/usr/local/bin/blender")]
TOPES = {"ninguno": (0, 0, 0, 0, 0), "ligero": (1280, 720, 64, 120, 2048), "estandar": (1920, 1080, 256, 300, 4096), "estudio": (3840, 2160, 1024, 1800, 8192)}
CLAVES = ("ancho", "alto", "muestras", "fotogramas", "memoriaMB")
FORMATOS = {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"], "salida": ["glb", "png", "exr", "mp4"]}
def _salida(s, orden, plazo):
    entorno = {k: s.entorno[k] for k in ("PATH", "HOME", "TMPDIR", "LANG") if k in s.entorno}
    try:
        r = s.ejecutar(orden, capture_output=True, text=True, timeout=plazo, env=entorno)
        return r.stdout if getattr(r, "returncode", 0) == 0 else None
    except Exception:
        try: return s.salida(orden, timeout=plazo)
        except Exception: return None

def _num(valor, defecto=0.0):
    return float(valor) if isinstance(valor, (int, float)) and not isinstance(valor, bool) else defecto
def _gpus(caps):
    g = caps.get("gpu") if isinstance(caps.get("gpu"), (list, dict, str)) else []
    g = [k for k, v in g.items() if v] if isinstance(g, dict) else [g] if isinstance(g, str) else g
    return sorted({str(x).lower() for x in g} & set(GPUS))
def buscar_blender(s):
    for variable, nombres in (("STARSEED_BLENDER", []), ("TALLER3D_BLENDER", ["blender"])):
        ruta = T.binario(s, variable, nombres, FIJAS if nombres else [])
        if ruta:
            return ruta
    return next((h for h in s.glob("/opt/blender*/blender") if s.existe(Path(h))), None)
def leer_version(ruta, s):
    salida = _salida(s, [ruta, "--version"], 10) or ""
    m, h = VERSION_RE.search(salida), HASH_RE.search(salida)
    if not m:
        return None
    return {"version": ".".join(x for x in m.groups() if x), "serie": "%s.%s" % m.group(1, 2),
            "lts": "LTS" in salida, "hash": h.group(1) if h else None}
def sondear(ruta, version, s):
    orden = [ruta, "-b", "--factory-startup", "--python-exit-code", "3", "-P",
             str(Path(__file__).resolve().parent / "sonda_blender.py")]
    lineas = [l for l in (_salida(s, orden, 30) or "").splitlines() if l.startswith(PREFIJO)]
    try: dato = json.loads(lineas[0][len(PREFIJO):]) if lineas else None
    except ValueError: return None
    return dato if isinstance(dato, dict) else None
def perfil_de(caps):
    libre, gpu = _num(caps.get("ramLibreGB")), _gpus(caps)
    if caps.get("instalado") is False or caps.get("arranca") is False: nombre = "ninguno"
    elif libre >= 16 or (gpu and _num(caps.get("vramGB"), -1) >= 8): nombre = "estudio"
    elif gpu or (_num(caps.get("hilos")) >= 4 and libre >= 6 and _num(caps.get("ramGB")) >= 16): nombre = "estandar"
    else: nombre = "ligero"
    valores = list(TOPES[nombre]); valores[4] = int(min(valores[4], libre * 512))
    return dict(zip(CLAVES, valores)) | {"perfil": nombre}

def _medido(s, sonda, hilos, ram, libre):
    gpu, vram = _gpus(sonda or {}), T.vram_nvidia_gb(s)
    if vram is not None: gpu = sorted(set(gpu) | {"cuda"})
    elif s.plataforma == "Darwin" and s.maquina in ("arm64", "aarch64"): gpu = sorted(set(gpu) | {"metal"})
    motores = ["workbench", "cycles-cpu"] + (["cycles-gpu", "eevee"] if gpu else [])
    return {"instalado": True, "gpu": gpu, "vramGB": vram, "hilos": hilos, "ramGB": ram,
            "ramLibreGB": libre, "motores": motores}

def _raiz(s):
    return Path(s.entorno.get("STARSEED_BLENDER_RAIZ") or Path(s.entorno.get("HOME") or Path.home()) / ".starseed" / "blender-3d")

def _escribir(ruta, datos, modo=0o600):
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        tmp = ruta.with_name(ruta.name + ".tmp")
        tmp.write_text(json.dumps(datos, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        os.chmod(tmp, modo); os.replace(tmp, ruta); return True
    except OSError:
        return False

def _cache(s, clave, dato=None):
    ruta = _raiz(s) / "sonda.json"
    try: guardado = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError): guardado = {}
    if not isinstance(guardado, dict): guardado = {}
    if dato is None: return guardado.get(clave) if isinstance(guardado.get(clave), dict) else None
    guardado[clave] = dato; _escribir(ruta, guardado)
    return dato
def detectar(s=None):
    s = s or T.Sistema()
    ruta, hilos = buscar_blender(s), os.cpu_count() or 1
    try: ram, libre = T.ram_total_gb(s), T.recursos(s).get("memoria_libre_gb")
    except Exception: ram, libre = None, None
    ficha = {"v": 1, "instalado": False, "version": None, "hash": None, "serie": None,
             "perfil": "ninguno", "motores": [], "gpu": [], "hilos": hilos,
             "ramGB": round(ram or 0, 1), "ramLibreGB": round(libre or 0, 2),
             "formatos": FORMATOS, "visto": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    version = leer_version(ruta, s) if ruta else None
    if not version: return ficha
    ficha.update(instalado=True, version=version["version"], hash=version["hash"], serie=version["serie"])
    clave = f"{version['version']}|{version['hash']}"
    sonda = _cache(s, clave)
    if sonda is None and (sonda := sondear(ruta, version["version"], s)) is not None:
        _cache(s, clave, sonda)
    caps = _medido(s, sonda, hilos, ram, libre)
    ficha.update(perfil=perfil_de(caps)["perfil"], motores=caps["motores"], gpu=caps["gpu"])
    return ficha
def main(argv=None):
    ficha = detectar()
    print(json.dumps(ficha, ensure_ascii=False, indent=2, sort_keys=True))
    if "--guardar" in (sys.argv[1:] if argv is None else argv):
        _escribir(_raiz(T.Sistema()) / "capacidades.json", ficha)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
