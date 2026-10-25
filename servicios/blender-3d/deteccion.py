#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detección de Blender por neurona (BLD1025B). Contrato: architecture/blender-3d.md §2 y §3. Blender es un programa aparte: nunca se importa `bpy`; se lanza como hijo sin shell y se reutilizan los ayudantes probados de servicios/taller-3d/taller.py."""
import argparse, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "taller-3d"))
import taller as T  # noqa: E402
V, SONDA = 1, Path(__file__).with_name("sonda_blender.py")
GPU_VALIDAS = ("metal", "cuda", "optix", "hip", "oneapi")
FORMATOS = {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"], "salida": ["glb", "png", "exr", "mp4"]}
TOPES = {"ninguno": (0, 0, 0, 0, 0), "ligero": (1280, 720, 64, 120, 2048),
         "estandar": (1920, 1080, 256, 300, 4096), "estudio": (3840, 2160, 1024, 1800, 8192)}
def _entorno(ruta: str, s: T.Sistema) -> dict:
    return {"PATH": f"{Path(ruta).resolve().parent}:/usr/bin:/bin", "LANG": "C.UTF-8",
            **{k: s.entorno[k] for k in ("HOME", "TMPDIR") if s.entorno.get(k)}}
def _ejecutable(s: T.Sistema, ruta: str) -> bool:
    return bool(s.existe(Path(ruta))) and (os.access(ruta, os.X_OK) if Path(ruta).exists() else True)
def buscar_blender(s: T.Sistema) -> str | None:
    """Por orden: las dos variables, el PATH, Mac, Homebrew y /opt/blender*/blender."""
    for nombre in ("STARSEED_BLENDER", "TALLER3D_BLENDER"):
        ruta = (s.entorno.get(nombre) or "").strip()
        if ruta and _ejecutable(s, ruta): return ruta
    candidatos = [s.buscar("blender"), "/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender",
                  "/usr/local/bin/blender", *sorted(s.glob("/opt/blender*/blender"))]
    return next((r for r in candidatos if r and _ejecutable(s, r)), None)
def leer_version(ruta: str, s: T.Sistema) -> dict | None:
    """`blender --version` (10 s): {version, serie, lts, hash}, o None si no arranca o no se entiende."""
    try:
        r = s.ejecutar([ruta, "--version"], capture_output=True, text=True, timeout=10, env=_entorno(ruta, s))
    except (OSError, subprocess.SubprocessError):
        return None
    lineas = (r.stdout or "").splitlines()
    m = re.search(r"Blender\s+(\d+)\.(\d+)\.(\d+)(.*)", lineas[0]) if r.returncode == 0 and lineas else None
    if not m: return None
    h = re.search(r"build hash:\s*([0-9a-fA-F]+)", r.stdout or "")
    return {"version": f"{m.group(1)}.{m.group(2)}.{m.group(3)}", "serie": f"{m.group(1)}.{m.group(2)}",
            "lts": "LTS" in m.group(4).upper(), "hash": h.group(1) if h else None}
def sondear(ruta: str, version: str | None, s: T.Sistema) -> dict | None:
    """Una sonda dentro de Blender (30 s, sin shell): la línea STARSEED_SONDA:… en JSON, o None."""
    orden = [ruta, "-b", "--factory-startup", "--python-exit-code", "3", "-P", str(SONDA)]
    try:
        r = s.ejecutar(orden, capture_output=True, text=True, timeout=30, cwd=str(SONDA.parent), env=_entorno(ruta, s))
    except (OSError, subprocess.SubprocessError):
        return None
    for linea in (r.stdout or "").splitlines():
        if linea.startswith("STARSEED_SONDA:"):
            try: datos = json.loads(linea[len("STARSEED_SONDA:"):])
            except ValueError: return None
            return datos if isinstance(datos, dict) else None
    return None
def perfil_de(caps: dict) -> dict:
    """Perfil y topes por trabajo solo con lo medido (§3.5). Pura: no toca la máquina."""
    caps = caps if isinstance(caps, dict) else {}
    gpu = [g for g in (caps.get("gpu") or []) if g in GPU_VALIDAS]
    vram, libre = caps.get("vramGB"), caps.get("ramLibreGB")
    libre = float(libre) if isinstance(libre, (int, float)) else 0.0; hilos = int(caps.get("hilos") or 1)
    if not caps.get("instalado") or caps.get("arranca") is False: nombre = "ninguno"
    else:
        estudio = (gpu and isinstance(vram, (int, float)) and vram >= 8) or libre >= 16
        nombre = "estudio" if estudio else "estandar" if gpu or (hilos >= 4 and libre >= 6) else "ligero"
    topes = dict(zip(("ancho", "alto", "muestras", "fotogramas", "memoriaMB"), TOPES[nombre]))
    if nombre != "ninguno": topes["memoriaMB"] = int(min(topes["memoriaMB"], libre * 512))
    return {"perfil": nombre, **topes}
def _carpeta(s: T.Sistema) -> Path:
    return Path(s.entorno.get("STARSEED_HOME") or s.entorno.get("HOME") or Path.home()) / ".starseed" / "blender-3d"
def _cache(s: T.Sistema, clave: str, sonda: dict | None = None) -> dict | None:
    try:
        if sonda is None:
            datos = json.loads((_carpeta(s) / "sonda.json").read_text(encoding="utf-8"))
            if isinstance(datos, dict) and datos.get("clave") == clave and isinstance(datos.get("sonda"), dict):
                return datos["sonda"]
            return None
        carpeta = _carpeta(s); carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / "sonda.json"
        ruta.write_text(json.dumps({"clave": clave, "sonda": sonda}, ensure_ascii=False), encoding="utf-8"); os.chmod(ruta, 0o600)
    except (OSError, ValueError): return None
def detectar(s: T.Sistema | None = None) -> dict:
    """La ficha EXACTA de capabilities.blender (§2), sin rutas absolutas ni nombre de usuario."""
    s = s or T.Sistema()
    libre = T.recursos(s).get("memoria_libre_gb")
    ficha = {"v": V, "instalado": False, "version": None, "hash": None, "serie": None, "perfil": "ninguno",
             "motores": [], "gpu": [], "hilos": os.cpu_count() or 1, "ramGB": round(T.ram_total_gb(s) or 0, 1),
             "ramLibreGB": None if libre is None else round(libre, 2), "formatos": FORMATOS,
             "visto": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    ruta = buscar_blender(s)
    version = leer_version(ruta, s) if ruta else None
    if not version: return ficha
    vram = T.vram_nvidia_gb(s)
    clave = f"{version['version']}|{version['hash'] or ''}"
    sonda = _cache(s, clave)
    if sonda is None:
        sonda = sondear(ruta, version["version"], s)
        if sonda is not None: _cache(s, clave, sonda)
    sonda = sonda or {}
    tipos = [str(t).lower() for t in (sonda.get("tipos") or [])]
    disp = [str(d).lower() for d in (sonda.get("dispositivos") or [])]
    usables = disp or (tipos if sonda.get("gpu") else [])
    gpu = [g for g in GPU_VALIDAS if g in tipos and g in usables]
    ficha.update({"instalado": True, "version": version["version"], "hash": version["hash"], "serie": version["serie"],
                  "gpu": gpu, "motores": ["workbench", "cycles-cpu"] + (["cycles-gpu", "eevee"] if gpu else [])})
    ficha["perfil"] = perfil_de({**ficha, "vramGB": vram})["perfil"]
    return ficha
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Detección de Blender por neurona (BLD1025B).")
    ap.add_argument("--json", action="store_true", help="imprime la ficha por la salida estándar")
    ap.add_argument("--guardar", action="store_true", help="la guarda en ~/.starseed/blender-3d/capacidades.json")
    a = ap.parse_args(argv)
    s = T.Sistema(); ficha = detectar(s)
    if a.guardar:
        try:
            _carpeta(s).mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=str(_carpeta(s)), prefix=".capacidades-", suffix=".json")
            with os.fdopen(fd, "w", encoding="utf-8") as f: json.dump(ficha, f, ensure_ascii=False, indent=2)
            os.chmod(tmp, 0o600); os.replace(tmp, _carpeta(s) / "capacidades.json")
            print("Capacidades guardadas en ~/.starseed/blender-3d/capacidades.json.", file=sys.stderr)
        except OSError:
            print("No se pudo guardar la ficha (permisos de la carpeta de estado).", file=sys.stderr); return 1
    if a.json or not a.guardar: print(json.dumps(ficha, ensure_ascii=False, indent=2))
    return 0
if __name__ == "__main__": sys.exit(main())
