#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detección de Blender por neurona (BLD1025B). Contrato: architecture/blender-3d.md §2 y §3."""
import argparse, json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "taller-3d"))
from taller import Sistema, binario, ram_total_gb, recursos, vram_nvidia_gb  # noqa: E402
RUTAS = ("/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender", "/usr/local/bin/blender")
FORMATOS = {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"], "salida": ["glb", "png", "exr", "mp4"]}
TOPES = {"ninguno": (0, 0, 0, 0, 0), "ligero": (1280, 720, 64, 120, 2048),
         "estandar": (1920, 1080, 256, 300, 4096), "estudio": (3840, 2160, 1024, 1800, 8192)}
CAMPOS = ("ancho", "alto", "muestras", "fotogramas", "memoriaMB")
def _carpeta(s):
    return Path(s.entorno.get("HOME") or Path.home()) / ".starseed" / "blender-3d"
def _correr(s, orden, plazo):
    base = {"PATH": s.entorno.get("PATH", "/usr/bin:/bin"), "LANG": s.entorno.get("LANG", "C.UTF-8")}
    base.update({k: s.entorno[k] for k in ("HOME", "TMPDIR") if s.entorno.get(k)})
    try: r = s.ejecutar(orden, capture_output=True, text=True, timeout=plazo, env=base)
    except (OSError, subprocess.SubprocessError): return None
    return r.stdout if r.returncode == 0 else None
def buscar_blender(s):
    propio = s.entorno.get("STARSEED_BLENDER", "")
    if propio:
        return propio if s.existe(Path(propio)) else None
    hallado = binario(s, "TALLER3D_BLENDER", ["blender"], [])
    if hallado:
        return hallado
    for ruta in RUTAS:
        if s.existe(Path(ruta)): return ruta
    return next((r for r in sorted(s.glob("/opt/blender*/blender")) if s.existe(Path(r))), None)
def leer_version(ruta, s):
    out = _correr(s, [ruta, "--version"], 10) or ""
    m = re.search(r"Blender\s+(\d+)\.(\d+)\.(\d+)(\s+LTS)?", out)
    if not m: return None
    h = re.search(r"build hash:\s*([0-9a-f]{7,40})", out)
    return {"version": f"{m.group(1)}.{m.group(2)}.{m.group(3)}", "serie": f"{m.group(1)}.{m.group(2)}",
            "lts": bool(m.group(4)), "hash": h.group(1) if h else None}
def sondear(ruta, version, s):
    guion = Path(__file__).with_name("sonda_blender.py")
    out = _correr(s, [ruta, "-b", "--factory-startup", "--python-exit-code", "3", "-P", str(guion)], 30) or ""
    linea = next((l for l in out.splitlines() if l.startswith("STARSEED_SONDA:")), "")
    try: return json.loads(linea.split(":", 1)[1])
    except (IndexError, ValueError): return None
def _cache(s, version):
    try: d = json.loads(s.leer(str(_carpeta(s) / "sonda.json")))
    except (OSError, ValueError): return None
    return d.get("sonda") if (d.get("version"), d.get("hash")) == (version.get("version"), version.get("hash")) else None
def _guardar_cache(s, version, sonda):
    try:
        carpeta = _carpeta(s)
        carpeta.mkdir(parents=True, exist_ok=True)
        with open(carpeta / "sonda.json", "w", encoding="utf-8") as f: json.dump({"version": version.get("version"), "hash": version.get("hash"), "sonda": sonda}, f, ensure_ascii=False)
        os.chmod(carpeta / "sonda.json", 0o600)
    except OSError:
        pass
def perfil_de(caps):
    if not caps.get("instalado"):
        perfil = "ninguno"
    else:
        gpu, vram = caps.get("gpu") or [], caps.get("vramGB")
        libre, hilos = caps.get("ramLibreGB"), caps.get("hilos") or 0
        perfil = "estudio" if (vram is not None and vram >= 8) or (libre is not None and libre >= 16) \
            else "estandar" if gpu or (hilos >= 4 and libre is not None and libre >= 6) else "ligero"
    topes = dict(zip(CAMPOS, TOPES[perfil]))
    if perfil != "ninguno" and caps.get("ramLibreGB") is not None:
        topes["memoriaMB"] = int(min(topes["memoriaMB"], caps["ramLibreGB"] * 512))
    return {"perfil": perfil, "topes": topes}
def motores_de(gpu, sonda):
    motores = ["workbench", "cycles-cpu"]
    if gpu and (sonda is None or sonda.get("gpu_utilizable")):
        motores.append("cycles-gpu")
        if sonda is None or any("eevee" in str(e).lower() for e in sonda.get("motores", [])):
            motores.append("eevee")
    return motores
def _ficha(instalado, version, gpu, motores, hilos, ram, libre, perfil, visto):
    version = version or {}
    return {"v": 1, "instalado": instalado, "version": version.get("version"), "hash": version.get("hash"),
            "serie": version.get("serie"), "perfil": perfil, "motores": motores, "gpu": gpu, "hilos": hilos,
            "ramGB": round(ram, 1) if ram is not None else 0, "ramLibreGB": round(libre, 2) if libre is not None else 0,
            "formatos": FORMATOS, "visto": visto}
def detectar(s=None):
    s = s or Sistema()
    ram, libre, vram = ram_total_gb(s), recursos(s).get("memoria_libre_gb"), vram_nvidia_gb(s)
    hilos, visto = getattr(s, "hilos", None) or os.cpu_count() or 1, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ruta = buscar_blender(s)
    version = leer_version(ruta, s) if ruta else None
    if not ruta or not version:
        caps = {"instalado": bool(version), "gpu": [], "ramLibreGB": libre, "hilos": hilos}
        return _ficha(bool(ruta), version, [], [], hilos, ram, libre, perfil_de(caps)["perfil"], visto)
    sonda = _cache(s, version)
    if sonda is None:
        sonda = sondear(ruta, version, s)
        if sonda is not None:
            _guardar_cache(s, version, sonda)
    gpu = (["cuda"] if vram is not None else []) + (["metal"] if s.plataforma == "Darwin" and s.maquina in ("arm64", "aarch64") else [])
    for t in (sonda or {}).get("gpu", []):
        if str(t).lower() in ("cuda", "optix", "hip", "oneapi", "metal") and str(t).lower() not in gpu:
            gpu.append(str(t).lower())
    caps = {"instalado": True, "gpu": gpu, "vramGB": vram, "ramLibreGB": libre, "hilos": hilos}
    return _ficha(True, version, gpu, motores_de(gpu, sonda), hilos, ram, libre, perfil_de(caps)["perfil"], visto)
def main(argv=None):
    ap = argparse.ArgumentParser(description="Detector de Blender por neurona (BLD1025B).")
    ap.add_argument("--json", action="store_true", help="imprime la ficha en JSON")
    ap.add_argument("--guardar", action="store_true", help="la escribe en ~/.starseed/blender-3d/capacidades.json")
    a = ap.parse_args(argv)
    ficha = detectar()
    if a.guardar:
        try:
            ruta = _carpeta(Sistema()) / "capacidades.json"
            ruta.parent.mkdir(parents=True, exist_ok=True)
            tmp = ruta.with_suffix(".tmp")
            tmp.write_text(json.dumps(ficha, ensure_ascii=False, indent=2), encoding="utf-8")
            os.chmod(tmp, 0o600)
            os.replace(tmp, ruta)
        except OSError as e:
            print(f"No se pudo guardar la ficha: {e}", file=sys.stderr)
    print(json.dumps(ficha, ensure_ascii=False, indent=2))
    return 0
if __name__ == "__main__":
    sys.exit(main())
