#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detección de Blender por neurona (BLD1025B). Contrato: architecture/blender-3d.md §2 y §3.
Mira dónde está Blender, qué versión es y qué puede hacer de verdad; de ahí sale un perfil
autoadaptable (ninguno, ligero, estandar, estudio) con sus topes. Solo biblioteca estándar:
Blender se lanza como hijo, con lista de argumentos y sin shell. Uso: deteccion.py [--json] [--guardar]
"""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402
GIB = 1024 ** 3
SONDA = Path(__file__).with_name("sonda_blender.py")
VARIABLES = ("STARSEED_BLENDER", "TALLER3D_BLENDER")
RUTAS = (Path("/Applications/Blender.app/Contents/MacOS/Blender"), Path("/opt/homebrew/bin/blender"), Path("/usr/local/bin/blender"))
TOPE_PERFIL = {"ninguno": (0, 0, 0, 0, 0), "ligero": (1280, 720, 64, 120, 2048), "estandar": (1920, 1080, 256, 300, 4096), "estudio": (3840, 2160, 1024, 1800, 8192)}
FORMATOS = {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"], "salida": ["glb", "png", "exr", "mp4"]}
def _salida(s: T.Sistema, orden: List[str], plazo: float) -> Optional[str]:
    """stdout de un hijo sin shell y con entorno mínimo (sin KEY, TOKEN ni SECRET)."""
    e = {k: s.entorno[k] for k in ("HOME", "TMPDIR", "LANG") if s.entorno.get(k)}; e["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin"
    try: r = s.ejecutar(orden, capture_output=True, text=True, timeout=plazo, env=e)
    except (OSError, subprocess.SubprocessError): return None
    return r.stdout if r.returncode == 0 else None
def buscar_blender(s: T.Sistema) -> Optional[str]:
    """Por orden: STARSEED_BLENDER, TALLER3D_BLENDER, PATH, Mac, Homebrew, /usr/local y /opt."""
    for v in VARIABLES:
        r = T.binario(s, v, [], [])
        if r and s.existe(Path(r)): return r
    r = T.binario(s, "", ["blender"], list(RUTAS))
    if r and s.existe(Path(r)): return r
    return next((p for p in s.glob("/opt/blender*/blender") if s.existe(Path(p))), None)
def leer_version(ruta: str, s: T.Sistema) -> Optional[Dict[str, Any]]:
    """`blender --version` (10 s): {version, serie, lts, hash}; None si no hay o no se entiende."""
    salida = _salida(s, [str(ruta), "--version"], 10)
    if not salida: return None
    primera = salida.splitlines()[0].strip(); m = re.match(r"^Blender\s+(\d+)\.(\d+)\.(\d+)(.*)$", primera)
    if not m: return None
    h = re.search(r"build hash:\s*([0-9a-f]{7,64})", salida, re.I)
    return {"version": "%s.%s.%s" % m.groups()[:3], "serie": "%s.%s" % m.groups()[:2], "lts": bool(re.search(r"\bLTS\b", primera, re.I)), "hash": h.group(1) if h else ""}
def _cache(s: T.Sistema) -> Path:
    return Path(s.entorno.get("HOME") or Path.home()) / ".starseed" / "blender-3d"
def sondear(ruta: str, version: Any, s: T.Sistema) -> Optional[Dict[str, Any]]:
    """Una sonda DENTRO de Blender (30 s), cacheada por (version, hash) y con permisos 600."""
    v = version if isinstance(version, dict) else {"version": version}
    clave = "%s|%s" % (v.get("version") or "", v.get("hash") or ""); ruta_cache = _cache(s) / "sonda.json"
    try: actual = json.loads(ruta_cache.read_text(encoding="utf-8"))
    except (OSError, ValueError): actual = {}
    if isinstance(actual, dict) and isinstance(actual.get(clave), dict): return actual[clave]
    orden = [str(ruta), "-b", "--factory-startup", "--python-exit-code", "3", "-P", str(SONDA)]
    datos = None
    for linea in (_salida(s, orden, 30) or "").splitlines():
        if linea.startswith("STARSEED_SONDA:"):
            try: datos = json.loads(linea[len("STARSEED_SONDA:"):])
            except ValueError: datos = None
            break
    if not isinstance(datos, dict) or datos.get("error"): return None
    try:
        ruta_cache.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not isinstance(actual, dict): actual = {}
        actual[clave] = datos; tmp = ruta_cache.with_name("sonda.json.tmp")
        tmp.write_text(json.dumps(actual, ensure_ascii=False), encoding="utf-8"); os.chmod(tmp, 0o600); os.replace(tmp, ruta_cache)
    except OSError: pass
    return datos
def ram_libre_gb(s: T.Sistema) -> Optional[float]:
    """RAM disponible ahora (la parte barata del perfil); None si el sistema no lo dice."""
    if s.plataforma == "Darwin":
        vm = s.salida(["vm_stat"]) or ""; p = re.search(r"page size of (\d+) bytes", vm)
        n = sum(int(x) for x in re.findall(r"Pages (?:free|inactive|speculative):\s*(\d+)", vm))
        return round(n * int(p.group(1)) / GIB, 2) if p else None
    try: m = re.search(r"MemAvailable:\s+(\d+)\s+kB", s.leer("/proc/meminfo"))
    except OSError: return None
    return round(int(m.group(1)) * 1024 / GIB, 2) if m else None
def perfil_de(caps: Dict[str, Any]) -> Dict[str, Any]:
    """Perfil puro según §3: estudio, estandar, ligero o ninguno, y sus topes con el recorte de RAM."""
    gpu, libre, vram, hilos = caps.get("gpu") or [], caps.get("ramLibreGB"), caps.get("vramGB"), caps.get("hilos") or 0; instalado = caps.get("instalado", bool(caps.get("version") or caps.get("gpu") or caps.get("motores") or libre is not None))
    if not instalado: nombre = "ninguno"
    elif (vram is not None and vram >= 8) or (libre is not None and libre >= 16): nombre = "estudio"
    elif gpu or (hilos >= 4 and (libre or 0) >= 6): nombre = "estandar"
    else: nombre = "ligero"
    ancho, alto, muestras, fotos, tope = TOPE_PERFIL[nombre]
    memoria = min(tope, int((libre or 0) * 1024 / 2))
    topes = {"ancho": ancho, "alto": alto, "muestras": muestras, "fotogramas": fotos, "memoriaMB": memoria}
    return {"perfil": nombre, "topes": topes, **topes}
def detectar(s: Optional[T.Sistema] = None) -> Dict[str, Any]:
    """Ficha `capabilities.blender` (§2), sin rutas absolutas ni nombre de usuario."""
    s = s or T.Sistema(); ruta = buscar_blender(s); ver = leer_version(ruta, s) if ruta else None
    vram, ram, libre = T.vram_nvidia_gb(s), T.ram_total_gb(s), ram_libre_gb(s)
    hilos = int(getattr(s, "hilos", None) or os.cpu_count() or 1); sonda = sondear(ruta, ver, s) if ver else None
    gpu, motores = [], []
    if ver:
        for t in (sonda or {}).get("tipos") or []:
            n = str(t).lower()
            if n in ("cuda", "optix", "hip", "oneapi", "metal") and n not in gpu: gpu.append(n)
        if s.plataforma == "Darwin" and s.maquina in ("arm64", "aarch64") and "metal" not in gpu: gpu.append("metal")
        if vram is not None and "cuda" not in gpu and not (sonda and sonda.get("gpu") is False): gpu.append("cuda")
        crudos = (sonda or {}).get("motores") if isinstance((sonda or {}).get("motores"), list) else []
        motores = [m for m in crudos if m in ("workbench", "cycles-cpu", "cycles-gpu", "eevee") and (m != "eevee" or gpu)]
        if not motores: motores = ["workbench", "cycles-cpu"] + (["cycles-gpu", "eevee"] if gpu else [])
    perfil = perfil_de({"instalado": bool(ver), "gpu": gpu, "vramGB": vram, "ramLibreGB": libre, "hilos": hilos})["perfil"]
    visto = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {"v": 1, "instalado": bool(ver), "version": (ver or {}).get("version"), "hash": (ver or {}).get("hash"), "serie": (ver or {}).get("serie"), "perfil": perfil, "motores": motores, "gpu": gpu, "hilos": hilos, "ramGB": None if ram is None else round(ram, 1), "ramLibreGB": None if libre is None else round(libre, 1), "formatos": FORMATOS, "visto": visto}
def guardar_capacidades(caps: Dict[str, Any], s: Optional[T.Sistema] = None) -> bool:
    """Escritura atómica en ~/.starseed/blender-3d/capacidades.json; False si no se puede."""
    ruta = _cache(s or T.Sistema()) / "capacidades.json"
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True, mode=0o700); tmp = ruta.with_name("capacidades.json.tmp")
        tmp.write_text(json.dumps(caps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"); os.chmod(tmp, 0o600); os.replace(tmp, ruta)
    except OSError: return False
    return True
def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Detecta Blender y su perfil en esta neurona")
    p.add_argument("--json", action="store_true", help="imprime la ficha"); p.add_argument("--guardar", action="store_true", help="la guarda en ~/.starseed/blender-3d/capacidades.json")
    a = p.parse_args(argv); caps = detectar()
    if a.guardar: guardar_capacidades(caps)
    if a.json or not a.guardar: print(json.dumps(caps, ensure_ascii=False, indent=2))
    return 0
if __name__ == "__main__":
    sys.exit(main())
