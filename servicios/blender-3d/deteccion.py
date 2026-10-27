#!/usr/bin/env python3
"""Detección del medio Blender por neurona (BLD1025B)."""

import json, os, re, subprocess, sys
from pathlib import Path

# ---- helpers from taller 3d ----
_t = os.path.join(os.path.dirname(__file__), "..", "taller-3d")
if _t not in sys.path:
    sys.path.insert(0, _t)
from taller import Sistema, ram_total_gb, vram_nvidia_gb  # noqa: F401


def buscar_blender(s: Sistema) -> str | None:
    """Devuelve la ruta ejecutable de Blender según el orden de prioridad, o None."""
    # 1. STARSEED_BLENDER
    explicit = s.entorno.get("STARSEED_BLENDER", "")
    if explicit and s.existe(Path(explicit)):
        return explicit
    # 2. TALLER3D_BLENDER
    explicit = s.entorno.get("TALLER3D_BLENDER", "")
    if explicit and s.existe(Path(explicit)):
        return explicit
    # 3. blender en PATH
    hallado = s.buscar("blender")
    if hallado:
        return hallado
    # 4. /Applications/Blender.app/Contents/MacOS/Blender
    mac_path = Path("/Applications/Blender.app/Contents/MacOS/Blender")
    if mac_path.exists():
        return str(mac_path)
    # 5. /opt/homebrew/bin/blender
    homebrew = Path("/opt/homebrew/bin/blender")
    if homebrew.exists():
        return str(homebrew)
    # 6. /usr/local/bin/blender
    local = Path("/usr/local/bin/blender")
    if local.exists():
        return str(local)
    # 7. /opt/blender*/blender (any version)
    import glob as _g
    for p in _g.glob("/opt/blender*/blender"):
        if Path(p).exists():
            return p
    return None


def leer_version(ruta: str, s: Sistema) -> dict | None:
    """Ejecuta `blender --version` y devuelve {version, serie, lts, hash} o None."""
    try:
        r = s.ejecutar([ruta, "--version"], capture_output=True, text=True, timeout=10)
    except Exception:
        return None
    out = (r.stdout or "").strip()
    lines = out.splitlines()
    if not lines or not lines[0].startswith("Blender"):
        return None
    first = lines[0].strip()
    m = re.match(r"Blender\s+([\d.]+)\s*(LTS)?", first)
    if not m:
        return None
    version = m.group(1)  # "5.2.0"
    lts = m.group(2) is not None
    serie = version.split(".")[0]  # "5.2"
    hash_val = None
    if len(lines) > 1:
        second = lines[1].strip()
        m2 = re.match(r"build\s+hash:\s+([a-f0-9]+)", second)
        if m2:
            hash_val = m2.group(1)
    if hash_val is None:
        return None
    return {"version": version, "serie": serie, "lts": lts, "hash": hash_val}


def sondear(ruta: str, version: str, s: Sistema) -> dict | None:
    """Lanza Blender con sonda y lee la línea STARSEED_SONDA:... devuelve dict o None."""
    try:
        r = s.ejecutar(
            [ruta, "-b", "--factory-startup", "--python-exit-code", "3", "-P", "sonda_blender.py"],
            capture_output=True, text=True, timeout=30,
        )
    except Exception:
        return None
    for line in (r.stdout or "").splitlines():
        if line.startswith("STARSEED_SONDA:"):
            try:
                return json.loads(line[len("STARSEED_SONDA:"):].strip())
            except json.JSONDecodeError:
                return None
    return None


_PERFILES = {
    "ninguno": (0, 0, 0, 0, 0),
    "ligero": (1280, 720, 64, 120, 2 * 1024),
    "estandar": (1920, 1080, 256, 300, 4 * 1024),
    "estudio": (3840, 2160, 1024, 1800, 8 * 1024),
}


def perfil_de(ram_libre_gb: float) -> dict:
    """Función pura: devuelve perfil y topes {ancho, alto, muestras, fotogramas, memoriaMB}."""
    nombre = "ninguno" if ram_libre_gb < 6 else "estandar" if ram_libre_gb >= 4 else "ligero" if ram_libre_gb >= 2 else "ninguno"
    ancho, alto, muestras, fotogramas, tope_mb = _PERFILES[nombre]
    memoriaMB = min(tope_mb, int(ram_libre_gb * 1024 / 2))  # 50 % de RAM libre
    return {"perfil": nombre, "ancho": ancho, "alto": alto, "muestras": muestras, "fotogramas": fotogramas, "memoriaMB": memoriaMB}


def _ram_libre_gb(s: Sistema) -> float:
    """RAM libre en GB usando vm_stat (macOS) o /proc/meminfo (Linux)."""
    if s.plataforma == "Darwin":
        out = s.salida(["vm_stat"]) or ""
        m = re.search(r"free:\s+(\d+)", out)
        if m:
            return int(m.group(1)) * 4096 / (1024 ** 3)
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemAvailable:"):
                        return int(line.split(":")[1].split()[0]) * 1024 / (1024 ** 3)
        except Exception:
            pass
        return 0.0
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split(":")[1].split()[0]) * 1024 / (1024 ** 3)
    except Exception:
        pass
    return 0.0


def has_gpu(s: Sistema) -> bool:
    """True if NVIDIA GPU or Apple Metal available."""
    if getattr(s, "gpu", False):
        return True
    if s.plataforma == "Darwin" and s.maquina in ("arm64", "aarch64"):
        return True
    out = s.salida(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"])
    if out:
        vals = re.findall(r"\d+", out)
        return bool(vals)
    return False


def _motores_y_gpu(s: Sistema) -> tuple:
    """Devuelve (motores, gpu) según la plataforma."""
    if s.plataforma == "Darwin":
        return ["workbench", "cycles-cpu"], ["metal"]
    return ["workbench", "cycles-cpu"], ["cuda", "optix"]


def _hilos(s: Sistema) -> int:
    out = s.salida(["nproc"]) or "1"
    return int(out.strip())


def _visto() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def detectar(s: Sistema | None = None) -> dict:
    """Devuelve exactamente capabilities.blender del §2."""
    if s is None:
        s = Sistema()
    blender = buscar_blender(s)
    instalado = blender is not None
    if not instalado:
        return {
            "v": 1, "instalado": False, "version": "", "hash": "", "serie": "",
            "perfil": "ninguno", "motores": [], "gpu": [],
            "hilos": 0, "ramGB": 0, "ramLibreGB": 0,
            "formatos": {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"],
                         "salida": ["glb", "png", "exr", "mp4"]},
            "visto": "",
        }
    ver = leer_version(blender, s)
    if ver is None:
        return {
            "v": 1, "instalado": True, "version": "", "hash": "", "serie": "",
            "perfil": "ninguno", "motores": [], "gpu": [],
            "hilos": 0, "ramGB": 0, "ramLibreGB": 0,
            "formatos": {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"],
                         "salida": ["glb", "png", "exr", "mp4"]},
            "visto": "",
        }
    version, serie, hash_val = ver["version"], ver["serie"], ver["hash"]
    ram_total = ram_total_gb(s) or 0
    ram_libre = _ram_libre_gb(s)
    perfil = perfil_de(ram_libre)
    perf_name = perfil["perfil"]
    motores, gpu = _motores_y_gpu(s)
    hilos_count = _hilos(s)
    return {
        "v": 1, "instalado": True, "version": version, "hash": hash_val, "serie": serie,
        "perfil": perf_name, "motores": motores, "gpu": gpu,
        "hilos": hilos_count, "ramGB": ram_total, "ramLibreGB": ram_libre,
        "formatos": {"entrada": ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"],
                     "salida": ["glb", "png", "exr", "mp4"]},
        "visto": _visto(),
    }


def main() -> None:
    import argparse, json
    parser = argparse.ArgumentParser(description="Detección de Blender por neurona")
    parser.add_argument("--json", action="store_true", help="imprime el resultado en JSON")
    parser.add_argument("--guardar", action="store_true", help="escribe capacidades.json atomically")
    args = parser.parse_args()
    s = Sistema()
    resultado = detectar(s)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    if args.guardar:
        out_path = Path.home() / ".starseed" / "blender-3d" / "capacidades.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(str(tmp), str(out_path))


if __name__ == "__main__":
    main()