"""Detección de Blender por neurona (BLD1025B). Contrato: architecture/blender-3d.md §2 y §3.
Reutiliza los ayudantes del taller (taller.py) sin modificarlos; hijo sin shell (§7.2)."""
import json, os, re, subprocess, sys, tempfile, time  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any, Dict, List, Optional  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
from taller import Sistema, ram_total_gb, recursos, vram_nvidia_gb  # noqa: E402

SONDA = Path(__file__).resolve().parent / "sonda_blender.py"
ENTRADA = ["glb", "gltf", "obj", "stl", "ply", "fbx", "svg", "hdr", "exr"]
TOPE = {"ligero": {"ancho": 1280, "alto": 720, "muestras": 64, "fotogramas": 120, "memoriaMB": 2048},
        "estandar": {"ancho": 1920, "alto": 1080, "muestras": 256, "fotogramas": 300, "memoriaMB": 4096},
        "estudio": {"ancho": 3840, "alto": 2160, "muestras": 1024, "fotogramas": 1800, "memoriaMB": 8192}}

def buscar_blender(s: Sistema) -> Optional[str]:
    """Dónde está Blender, por este orden, y solo ejecutables que existen (contrato §3.1)."""
    for var in ("STARSEED_BLENDER", "TALLER3D_BLENDER"):  # solo NOMBRES de variable, nunca claves
        v = s.entorno.get(var, "")
        if v and s.existe(Path(v)): return v
    libres = ["/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender", "/usr/local/bin/blender"]
    return s.buscar("blender") or next((r for r in libres + sorted(s.glob("/opt/blender*/blender")) if s.existe(Path(r))), None)

def _salida(s: Sistema, orden: List[str], plazo: float) -> Optional[str]:
    env = {**{"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "LANG": "C.UTF-8"}, **{k: os.environ[k] for k in ("HOME", "TMPDIR") if os.environ.get(k)}}
    try: r = s.ejecutar(orden, capture_output=True, text=True, timeout=plazo, env=env)
    except (OSError, subprocess.SubprocessError): return None
    return r.stdout if r.returncode == 0 else None

def leer_version(ruta: str, s: Sistema) -> Optional[Dict[str, Any]]:
    """`blender --version` (plazo 10 s) → {version, serie, lts, hash}; None si sale rara (§3.2)."""
    out = _salida(s, [str(ruta), "--version"], 10) or ""
    m, h = re.search(r"^Blender (\d+)\.(\d+)\.(\d+)(\s+LTS)?", out, re.M), re.search(r"build hash: (\w+)", out)
    if not m: return None
    return {"version": f"{m[1]}.{m[2]}.{m[3]}", "serie": f"{m[1]}.{m[2]}", "lts": bool(m[4]), "hash": h.group(1) if h else None}

def sondear(ruta: str, s: Sistema) -> Optional[Dict[str, Any]]:
    """Una sonda (plazo 30 s): lee UNA línea «STARSEED_SONDA: <json>» (§3.3)."""
    orden = [str(ruta), "-b", "--factory-startup", "--python-exit-code", "3", "-P", str(SONDA)]
    for linea in (_salida(s, orden, 30) or "").splitlines():
        if not linea.startswith("STARSEED_SONDA:"): continue
        try: d = json.loads(linea[len("STARSEED_SONDA:"):])
        except ValueError: return None
        return d if isinstance(d, dict) else None
    return None

def atomica(ruta: Path, texto: str) -> Optional[Path]:
    """Escritura atómica con permisos 600; si no se puede escribir, None y se sigue."""
    provisional = None
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        fd, provisional = tempfile.mkstemp(dir=ruta.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f: f.write(texto)
        os.chmod(provisional, 0o600)
        os.replace(provisional, ruta)
        return ruta
    except OSError:
        if provisional:
            try: os.unlink(provisional)
            except OSError: pass
        return None

def perfil_de(caps: Dict[str, Any]) -> Dict[str, Any]:
    """PURA (§3.5): {perfil, topes}; memoriaMB = min(tope del perfil, 50 % de la RAM libre)."""
    gpu, vram = bool(caps.get("gpu")), int(caps.get("vramGB") or 0)
    libre = float(caps.get("ramLibreGB") or 0)
    if gpu and (vram >= 8 or libre >= 16): perfil = "estudio"  # GPU de 8 GB o más, o 16 GB libres
    elif gpu or (int(caps.get("hilos") or 0) >= 4 and libre >= 6): perfil = "estandar"
    else: perfil = "ligero"  # sin GPU utilizable, o poca RAM libre (el A1, esta caja)
    base = TOPE[perfil]
    return {"perfil": perfil, "topes": {**base, "memoriaMB": min(base["memoriaMB"], int(libre * 1024 / 2))}}

def ficha(s: Sistema, instalado: bool, ver: Optional[Dict[str, Any]], perfil: str,
          motores: List[str], gpu: List[str], salida: List[str]) -> Dict[str, Any]:
    """La forma EXACTA de capabilities.blender (§2): sin rutas absolutas ni nombre de usuario."""
    return {"v": 1, "instalado": instalado, "version": ver["version"] if ver else None,
            "hash": ver["hash"] if ver else None, "serie": ver["serie"] if ver else None,
            "perfil": perfil, "motores": motores, "gpu": gpu, "hilos": os.cpu_count() or 1,
            "ramGB": round(ram_total_gb(s) or 0, 1), "ramLibreGB": recursos(s).get("memoria_libre_gb"),
            "formatos": {"entrada": list(ENTRADA), "salida": salida},
            "visto": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

def _leer_cache(ruta: Path, clave: List[str]) -> Optional[Dict[str, Any]]:
    try: d = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError): return None
    ok = isinstance(d, dict) and d.get("clave") == clave and isinstance(d.get("sonda"), dict)
    return d["sonda"] if ok else None

def detectar(s: Optional[Sistema] = None) -> Dict[str, Any]:
    """Todo junto: ruta → versión → sonda (caché por (version, hash)) → perfil → ficha del §2."""
    s = s or Sistema()
    vram, ruta = vram_nvidia_gb(s), buscar_blender(s)
    ver = leer_version(ruta, s) if ruta else None
    if not (ruta and ver): return ficha(s, False, None, "ninguno", [], [], [])
    cache = Path(s.entorno.get("STARSEED_RAIZ") or (Path.home() / ".starseed")) / "blender-3d" / "sonda.json"
    clave, sonda = [ver["version"], ver["hash"]], _leer_cache(cache, [ver["version"], ver["hash"]]) or sondear(ruta, s)
    if sonda:
        gpu, motores = [str(t) for t in sonda.get("gpu", [])], [str(m) for m in sonda.get("motores", [])]
        salida = ["glb", "png", "exr"] + (["mp4"] if sonda.get("ffmpeg") else [])
        atomica(cache, json.dumps({"clave": clave, "sonda": sonda}, ensure_ascii=False))
    else:  # sin sonda: solo lo MEDIDO seguro (§1.4); nada se inventa
        gpu, motores = [], ["workbench", "cycles-cpu"] + (["cycles-gpu"] if vram else [])
        salida = ["glb", "png"]
    p = perfil_de({"gpu": gpu, "vramGB": vram, "hilos": os.cpu_count() or 1, "ramLibreGB": recursos(s).get("memoria_libre_gb")})
    return ficha(s, True, ver, p["perfil"], motores, gpu, salida)

def main() -> int:
    """CLI: siempre imprime la ficha; con --guardar, atómica en ~/.starseed/blender-3d/capacidades.json (§3)."""
    s = Sistema()
    f = detectar(s)
    print(json.dumps(f, ensure_ascii=False, indent=2))
    if "--guardar" in sys.argv[1:]:
        ruta = atomica(_carpeta(s) / "capacidades.json", json.dumps(f, ensure_ascii=False, indent=2))
        print(f"Escrita en {ruta}." if ruta else "No se pudo escribir capacidades.json.", file=sys.stderr)
    return 0

def _carpeta(s: Sistema) -> Path:
    return Path(s.entorno.get("STARSEED_RAIZ") or (Path.home() / ".starseed")) / "blender-3d"

if __name__ == "__main__":
    sys.exit(main())
