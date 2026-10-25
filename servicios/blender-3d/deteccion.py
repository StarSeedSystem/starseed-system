#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detección de Blender por neurona (BLD1025B). Contrato: architecture/blender-3d.md §2 y §3."""
import argparse, json, os, re, subprocess, sys, time
from pathlib import Path
from typing import Any, Dict, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "taller-3d"))
import taller as T  # noqa: E402

SONDA = Path(__file__).resolve().parent / "sonda_blender.py"
RUTAS = [Path("/Applications/Blender.app/Contents/MacOS/Blender"), Path("/opt/homebrew/bin/blender"), Path("/usr/local/bin/blender")]
FORMATOS = {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"], "salida": ["glb", "png", "exr", "mp4"]}
TOPES = {"ninguno": (0, 0, 0, 0, 0), "ligero": (1280, 720, 64, 120, 2048), "estandar": (1920, 1080, 256, 300, 4096), "estudio": (3840, 2160, 1024, 1800, 8192)}
GPUS = {"metal": "metal", "cuda": "cuda", "optix": "optix", "hip": "hip", "oneapi": "oneapi", "apple": "metal"}
def buscar_blender(s: T.Sistema) -> Optional[str]:
    """STARSEED_BLENDER → TALLER3D_BLENDER → PATH → rutas conocidas → /opt/blender*."""
    for variable in ("STARSEED_BLENDER", "TALLER3D_BLENDER"):
        valor = s.entorno.get(variable, "")
        if valor: return valor if s.existe(Path(valor)) else None
    hallado = T.binario(s, "TALLER3D_BLENDER", ["blender"], RUTAS)
    return hallado if hallado and s.existe(Path(hallado)) else next((r for r in s.glob("/opt/blender*/blender") if s.existe(Path(r))), None)

def _entorno(s: T.Sistema) -> Dict[str, str]:
    """Entorno mínimo: nada que contenga claves, tokens, secretos ni proxies."""
    base = {"PATH": s.entorno.get("PATH", "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"),
            "LANG": s.entorno.get("LANG", "es_ES.UTF-8"), "HOME": s.entorno.get("HOME", str(Path.home()))}
    return {**base, **({"TMPDIR": s.entorno["TMPDIR"]} if s.entorno.get("TMPDIR") else {})}

def leer_version(ruta: str, s: T.Sistema) -> Optional[Dict[str, Any]]:
    """`blender --version` (10 s, sin shell): {version, serie, lts, hash} o None."""
    try:
        r = s.ejecutar([ruta, "--version"], capture_output=True, text=True, timeout=10, env=_entorno(s))
    except (OSError, subprocess.SubprocessError): return None
    texto, m = r.stdout or "", re.search(r"^Blender\s+(\d+)\.(\d+)(?:\.(\d+))?(?:\s+LTS)?", r.stdout or "", re.MULTILINE)
    if r.returncode != 0 or not m: return None
    h = re.search(r"build hash:\s*([0-9a-fA-F]+)", texto)
    return {"version": f"{m.group(1)}.{m.group(2)}.{m.group(3) or 0}", "serie": f"{m.group(1)}.{m.group(2)}", "lts": "LTS" in m.group(0), "hash": h.group(1) if h else ""}

def _carpeta(s: T.Sistema) -> Path: return Path(s.entorno.get("STARSEED_BLENDER_DIR") or (Path.home() / ".starseed" / "blender-3d"))

def _cache(s: T.Sistema, version: str, hash_: str, caja: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Lee o guarda `sonda.json` con clave (version, hash); sin caché se sigue igual."""
    ruta = _carpeta(s) / "sonda.json"
    if caja is None:
        try: d = json.loads(ruta.read_text(encoding="utf-8"))
        except (OSError, ValueError): return None
        return d.get("sonda") if d.get("version") == version and d.get("hash") == hash_ and isinstance(d.get("sonda"), dict) else None
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(json.dumps({"version": version, "hash": hash_, "sonda": caja}, ensure_ascii=False), encoding="utf-8")
        os.chmod(ruta, 0o600)
    except OSError:
        pass
    return caja

def sondear(ruta: str, version: str, s: T.Sistema) -> Optional[Dict[str, Any]]:
    """Una sola sonda (`-P sonda_blender.py`, 30 s); lee la línea STARSEED_SONDA: + JSON."""
    try:
        r = s.ejecutar([ruta, "-b", "--factory-startup", "--python-exit-code", "3", "-P", str(SONDA)], capture_output=True, text=True, timeout=30, env=_entorno(s))
    except (OSError, subprocess.SubprocessError): return None
    for linea in (r.stdout or "").splitlines():
        if linea.startswith("STARSEED_SONDA:"):
            try: caja = json.loads(linea[len("STARSEED_SONDA:"):])
            except ValueError: continue
            return caja if isinstance(caja, dict) else None
    return None

def perfil_de(caps: Dict[str, Any]) -> Dict[str, Any]:
    """Perfil y topes por trabajo (§3). Pura: solo mira los datos que recibe."""
    libre, vram = caps.get("ramLibreGB") or 0, caps.get("vramGB") or 0
    if not caps.get("instalado"): nombre = "ninguno"
    elif vram >= 8 or libre >= 16: nombre = "estudio"
    elif caps.get("gpu") or ((caps.get("hilos") or 0) >= 4 and libre >= 6): nombre = "estandar"
    else: nombre = "ligero"
    ancho, alto, muestras, fotogramas, tope = TOPES[nombre]
    return {"perfil": nombre, "ancho": ancho, "alto": alto, "muestras": muestras, "fotogramas": fotogramas,
            "memoriaMB": min(tope, int(libre * 512)) if nombre != "ninguno" else 0}

def detectar(s: Optional[T.Sistema] = None) -> Dict[str, Any]:
    """La ficha `capabilities.blender` del §2, sin rutas absolutas ni nombre de usuario."""
    s = s or T.Sistema()
    ruta = buscar_blender(s)
    info = leer_version(ruta, s) if ruta else None
    ram, libre, vram = T.ram_total_gb(s), (T.recursos(s) or {}).get("memoria_libre_gb"), T.vram_nvidia_gb(s)
    caja = _cache(s, info["version"], info["hash"]) if info else None
    if info and caja is None:
        caja = sondear(ruta, info["version"], s)
        if caja is not None:
            _cache(s, info["version"], info["hash"], caja)
    gpu, motores = [], ["workbench", "cycles-cpu"] if info else []
    if caja:
        ids = {str(m).upper() for m in caja.get("motores", [])}
        gpu = list(dict.fromkeys(GPUS[str(d).lower()] for d in caja.get("dispositivos", []) if str(d).lower() in GPUS))
        motores = (["workbench"] if any("WORKBENCH" in m for m in ids) else []) + (["cycles-cpu"] if any("CYCLES" in m for m in ids) else [])
        if caja.get("gpu") and "cycles-cpu" in motores: motores.append("cycles-gpu")
        if caja.get("gpu") and any("EEVEE" in m for m in ids): motores.append("eevee")
    calculo = {"instalado": bool(info), "gpu": gpu, "vramGB": vram, "ramLibreGB": libre, "hilos": os.cpu_count() or 1}
    return {"v": 1, "instalado": bool(info), "version": info["version"] if info else None,
            "hash": info["hash"] if info else None, "serie": info["serie"] if info else None,
            "perfil": perfil_de(calculo)["perfil"], "motores": motores, "gpu": gpu, "hilos": calculo["hilos"],
            "ramGB": round(ram, 1) if ram is not None else None, "ramLibreGB": round(libre, 2) if libre is not None else None,
            "formatos": dict(FORMATOS), "visto": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser(description="Detector de Blender por neurona (BLD1025B).")
    ap.add_argument("--json", action="store_true", help="imprime la ficha"); ap.add_argument("--guardar", action="store_true", help="la guarda en ~/.starseed/blender-3d/capacidades.json")
    a, s = ap.parse_args(argv), T.Sistema()
    caps = detectar(s)
    if a.guardar:
        try:
            _carpeta(s).mkdir(parents=True, exist_ok=True)
            tmp = _carpeta(s) / ".capacidades.tmp"; tmp.write_text(json.dumps(caps, ensure_ascii=False, indent=2), encoding="utf-8")
            os.chmod(tmp, 0o600); os.replace(tmp, _carpeta(s) / "capacidades.json")
        except OSError:
            print("No se pudo guardar la ficha.", file=sys.stderr)
    if a.json or not a.guardar: print(json.dumps(caps, ensure_ascii=False, indent=2))
    return 0
if __name__ == "__main__":
    sys.exit(main())
