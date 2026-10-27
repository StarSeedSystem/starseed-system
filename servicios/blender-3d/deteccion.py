#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detección de Blender por neurona (BLD1025B); contrato architecture/blender-3d.md §2 y §3.
Blender es un programa APARTE: proceso hijo, lista de argumentos, sin shell. Solo biblioteca estándar."""
import argparse, json, os, re, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "taller-3d"))
import taller as T  # noqa: E402

RUTAS_BLENDER = ("/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender", "/usr/local/bin/blender")
EXT_ENTRADA = ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"]
EXT_SALIDA = ["glb", "png", "exr", "mp4"]
TOPES = {"ninguno": (0, 0, 0, 0, 0), "ligero": (1280, 720, 64, 120, 2048), "estandar": (1920, 1080, 256, 300, 4096),
         "estudio": (3840, 2160, 1024, 1800, 8192)}
TIPOS_GPU = {"CUDA": "cuda", "OPTIX": "optix", "HIP": "hip", "ONEAPI": "oneapi", "METAL": "metal"}

def entorno_minimo(s):
    return {"PATH": s.entorno.get("PATH", "/usr/bin:/bin:/usr/sbin:/sbin"), "HOME": s.entorno.get("HOME", str(Path.home())),
            "TMPDIR": s.entorno.get("TMPDIR", tempfile.gettempdir()), "LANG": s.entorno.get("LANG", "C.UTF-8")}

def _correr(s, orden, timeout):
    try: return s.ejecutar(orden, capture_output=True, text=True, timeout=timeout, env=entorno_minimo(s), shell=False)
    except (OSError, subprocess.SubprocessError): return None

def buscar_blender(s):
    for variable in ("STARSEED_BLENDER", "TALLER3D_BLENDER"):
        valor = s.entorno.get(variable, "")
        if valor and s.existe(Path(valor)): return valor
    hallado = s.buscar("blender")
    if hallado and s.existe(Path(hallado)): return hallado
    for ruta in RUTAS_BLENDER:
        if s.existe(Path(ruta)): return ruta
    return next((r for r in s.glob("/opt/blender*/blender") if s.existe(Path(r))), None)

def leer_version(ruta, s):
    r = _correr(s, [ruta, "--version"], 10)
    if not r or r.returncode != 0: return None
    texto = (r.stdout or "") + "\n" + (r.stderr or "")
    m = re.search(r"^Blender\s+(\d+)\.(\d+)\.(\d+)(\s+LTS)?\s*$", texto, re.M)
    if not m: return None
    h = re.search(r"build hash:\s*([0-9a-fA-F]+)", texto)
    return {"version": ".".join(m.group(1, 2, 3)), "serie": f"{m.group(1)}.{m.group(2)}",
            "lts": bool(m.group(4)), "hash": h.group(1).lower() if h else None}

def carpeta_de(s): return Path(s.raiz).parent / "blender-3d"

def _escribir_atomico(ruta, datos):
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(ruta.parent), delete=False) as f:
            json.dump(datos, f, ensure_ascii=False, indent=2, sort_keys=True)
            tmp = Path(f.name)
        os.chmod(tmp, 0o600); os.replace(tmp, ruta)
        return True
    except OSError: return False

def _cache(s, clave="", caps=None):
    try:
        datos = json.loads(s.leer(str(carpeta_de(s) / "sonda.json")))
        datos = datos if isinstance(datos, dict) else {}
    except (OSError, ValueError): datos = {}
    if caps is None: return datos.get(clave)
    datos[clave] = caps; _escribir_atomico(carpeta_de(s) / "sonda.json", datos)

def sondear(ruta, version, s):
    clave = f"{version.get('version')}|{version.get('hash') or ''}"
    guardado = _cache(s, clave)
    if guardado is not None: return guardado
    guion = Path(__file__).resolve().with_name("sonda_blender.py")
    r = _correr(s, [ruta, "-b", "--factory-startup", "--python-exit-code", "3", "-P", str(guion)], 30)
    if not r or r.returncode != 0: return None
    linea = next((l for l in (r.stdout or "").splitlines() if l.startswith("STARSEED_SONDA:")), None)
    try: caps = json.loads(linea.split(":", 1)[1]) if linea else None
    except ValueError: return None
    if isinstance(caps, dict): _cache(s, clave, caps); return caps
    return None

def perfil_de(caps):
    gpu, libre = caps.get("gpu") or [], caps.get("ramLibreGB") or 0
    vram, hilos = caps.get("vramGB") or 0, caps.get("hilos") or 0
    if not caps.get("instalado") or not caps.get("arranca"): nombre = "ninguno"
    elif (gpu and vram >= 8) or libre >= 16: nombre = "estudio"
    elif gpu or (hilos >= 4 and libre >= 6): nombre = "estandar"
    else: nombre = "ligero"
    ancho, alto, muestras, fotogramas, tope = TOPES[nombre]
    memoria = tope if caps.get("ramLibreGB") is None else min(tope, int(libre * 512))
    return {"perfil": nombre, "topes": {"ancho": ancho, "alto": alto, "muestras": muestras,
                                        "fotogramas": fotogramas, "memoriaMB": memoria}}

def detectar(s=None):
    """Ficha `capabilities.blender` del §2, sin rutas absolutas ni nombre de usuario."""
    s = s or T.Sistema()
    ram, libre, vram = T.ram_total_gb(s), T.recursos(s).get("memoria_libre_gb"), T.vram_nvidia_gb(s)
    ruta = buscar_blender(s)
    info = leer_version(ruta, s) if ruta else None
    caps = sondear(ruta, info, s) if info else None
    instalado, arranca = bool(ruta and info), bool(info and caps)
    base = {"instalado": instalado, "arranca": arranca, "gpu": (caps or {}).get("gpu", []),
            "hilos": os.cpu_count() or 1, "ramGB": round(ram, 1) if ram else 0.0,
            "ramLibreGB": libre, "vramGB": vram}
    perfil = perfil_de(base)
    return {"v": 1, "instalado": instalado, "version": info["version"] if info else None,
            "hash": info["hash"] if info else None, "serie": info["serie"] if info else None,
            "perfil": perfil["perfil"], "motores": list((caps or {}).get("motores", [])) if arranca else [],
            "gpu": base["gpu"], "hilos": base["hilos"], "ramGB": base["ramGB"], "ramLibreGB": libre,
            "formatos": {"entrada": EXT_ENTRADA, "salida": EXT_SALIDA},
            "visto": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}

def main(argv=None):
    p = argparse.ArgumentParser(description="Detecta Blender y su perfil en esta neurona.")
    p.add_argument("--json", action="store_true", help="imprime la ficha JSON")
    p.add_argument("--guardar", action="store_true", help="la guarda en ~/.starseed/blender-3d/capacidades.json")
    args = p.parse_args(argv); s = T.Sistema(); ficha = detectar(s)
    if args.guardar: _escribir_atomico(carpeta_de(s) / "capacidades.json", ficha)
    if args.json: print(json.dumps(ficha, ensure_ascii=False, indent=2, sort_keys=True))
    return 0

if __name__ == "__main__": raise SystemExit(main())
