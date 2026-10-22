#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Taller 3D local de una neurona (AV1011F). Contrato: architecture/astraura-avatares-3d.md §4, §11 y §11.1.

Servicio HTTP SOLO en 127.0.0.1, con token leído de un archivo de entorno (nunca impreso). Solo biblioteca
estándar. Hace tres etapas del plan de `planificar` (src/lib/avatares/adn/canalizacion.ts):

- generar  · scripts de image-to-3dlab (AssetFurnace) instalados en ~/.starseed/taller-3d/image-to-3dlab
- remallar · Instant Meshes por línea de órdenes, o QuadriFlow / vóxeles de Blender sin ventana
- riggear  · UniRig, solo con CUDA

«Basta de ilusiones»: lo que no está instalado se dice con su motivo; nada se simula. La descarga de pesos
(13–14 GB) NUNCA es automática: `descargar-pesos --motor X --si`, y antes comprueba ≥ 3 veces ese espacio libre.

Uso:  python3 taller.py token | capacidades | servir [--puerto N] | descargar-pesos --motor ID [--si]
Rutas: GET /salud · GET /capacidades · POST /trabajos · GET /trabajos/{id} · GET /trabajos/{id}/resultado
"""
import argparse, base64, glob as _glob, hashlib, hmac, json, os, platform, queue, re, secrets, shutil
import subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

VERSION = 1
HOST = "127.0.0.1"
PUERTO = 8797
GIB = 1024 ** 3
# Los mismos nombres que REQUISITOS_3D de src/lib/avatares/adn/motores.ts (los tres últimos no son de este servicio).
REQUISITOS_3D = ("navegador", "cpu", "blender", "apple-silicon-32gb", "cuda-8gb", "cuda-16gb", "clave-externa", "espacio-hf")
ETAPAS_DEL_TALLER = ("generar", "remallar", "riggear")  # detallar no tiene motor listo; animar va en el navegador
PESADAS = ("generar", "riggear")
MIN_LIBRE_PESADA_GB = 6.0
MIN_LIBRE_REMALLAR_GB = 1.0
PESOS_GB = 14.0          # lo que pide image-to-3dlab por motor (13–14 GB; TRELLIS.2 ~15)
FACTOR_DISCO = 3         # la Mac ya se quedó sin disco: se exige el triple libre
MAX_ENTRADA_BYTES = 64 * 1024 * 1024
TOPE_S = {"generar": 2 * 3600, "remallar": 20 * 60, "riggear": 3600}
EXT_IMAGEN = (".png", ".jpg", ".jpeg", ".webp")
EXT_MALLA = (".glb", ".obj", ".ply", ".fbx")
RE_ID = re.compile(r"^[0-9a-f]{32}$")


def raiz_por_defecto() -> Path:
    return Path(os.environ.get("TALLER3D_RAIZ") or (Path.home() / ".starseed" / "taller-3d"))


class Sistema:
    """Todo lo que toca la máquina, inyectable para las pruebas (subprocesos simulados)."""

    def __init__(self, raiz: Optional[Path] = None, ejecutar: Callable[..., Any] = subprocess.run,
                 buscar: Callable[[str], Optional[str]] = shutil.which, plataforma: str = "", maquina: str = "",
                 entorno: Optional[Dict[str, str]] = None, leer: Optional[Callable[[str], str]] = None,
                 glob: Callable[[str], List[str]] = _glob.glob, disco_libre: Optional[Callable[[str], int]] = None):
        self.raiz = Path(raiz) if raiz else raiz_por_defecto()
        self.ejecutar, self.buscar, self.glob = ejecutar, buscar, glob
        self.plataforma = plataforma or platform.system()
        self.maquina = (maquina or platform.machine()).lower()
        self.entorno = os.environ if entorno is None else entorno
        self.leer = leer or (lambda r: Path(r).read_text(encoding="utf-8", errors="replace"))
        self.disco_libre = disco_libre or (lambda r: shutil.disk_usage(r).free)

    def salida(self, orden: List[str], timeout: float = 10) -> Optional[str]:
        """stdout de una orden corta, o None si no existe o falla."""
        try:
            r = self.ejecutar(orden, capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError):
            return None
        return r.stdout if r.returncode == 0 else None

    def existe(self, ruta: Path) -> bool:
        return Path(ruta).exists()

    @property
    def lab(self) -> Path:
        return self.raiz / "image-to-3dlab"

    @property
    def unirig(self) -> Path:
        return self.raiz / "UniRig"


# ───────────────────────────── capacidades ─────────────────────────────

def ram_total_gb(s: Sistema) -> Optional[float]:
    if s.plataforma == "Darwin":
        out = s.salida(["sysctl", "-n", "hw.memsize"])
        return int(out.strip()) / GIB if out and out.strip().isdigit() else None
    try:
        m = re.search(r"MemTotal:\s+(\d+)\s+kB", s.leer("/proc/meminfo"))
    except OSError:
        return None
    return int(m.group(1)) * 1024 / GIB if m else None


def vram_nvidia_gb(s: Sistema) -> Optional[int]:
    """Memoria de la mayor GPU NVIDIA según nvidia-smi (GB redondeados: 16376 MiB son 16 GB), o None."""
    out = s.salida(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"])
    valores = [int(x) for x in re.findall(r"\d+", out or "")]
    return round(max(valores) / 1024) if valores else None


def binario(s: Sistema, variable: str, nombres: List[str], rutas: List[Path]) -> Optional[str]:
    explicito = s.entorno.get(variable, "")
    if explicito:
        return explicito if s.existe(Path(explicito)) else None
    for n in nombres:
        hallado = s.buscar(n)
        if hallado:
            return hallado
    return next((str(r) for r in rutas if s.existe(r)), None)


def blender_de(s: Sistema) -> Optional[str]:
    return binario(s, "TALLER3D_BLENDER", ["blender"], [Path("/Applications/Blender.app/Contents/MacOS/Blender")])


def instant_meshes_de(s: Sistema) -> Optional[str]:
    d = s.raiz / "instant-meshes"
    return binario(s, "TALLER3D_INSTANT_MESHES", ["InstantMeshes", "Instant Meshes"],
                   [d / "Instant Meshes", d / "InstantMeshes", d / "Instant Meshes.app" / "Contents" / "MacOS" / "Instant Meshes"])


def es_a1(s: Sistema, vram: Optional[int]) -> bool:
    """La A1 (Oracle, ARM sin GPU): por variable o por ser Linux ARM sin NVIDIA. Allí solo se remalla (§4)."""
    if s.entorno.get("TALLER3D_NODO", "").lower() == "a1":
        return True
    return s.plataforma == "Linux" and s.maquina in ("aarch64", "arm64") and vram is None


def _python_lab(s: Sistema, venv: str) -> Path:
    return s.lab / venv / ".venv" / "bin" / "python" if venv else s.lab / ".venv" / "bin" / "python"


def ordenes_generar(s: Sistema, cuda: bool) -> Dict[str, Tuple[Path, Path, List[str]]]:
    """Por motor: (python, script, argumentos extra). Órdenes tal como las da el README de image-to-3dlab."""
    return {
        "pixal3d": (_python_lab(s, ""), s.lab / "scripts" / "pixal3d_generate.py", ["--seed", "42"]),
        "hunyuan3d-mlx": (_python_lab(s, "hunyuan_mlx/shape"), s.lab / "scripts" / "hunyuan_mlx_xiong_generate.py", ["--model", "2.0"]),
        "trellis2": (_python_lab(s, "vendor/trellis-cuda" if cuda else "vendor/trellis-space-mac"),
                     s.lab / "scripts" / ("trellis_cuda_generate.py" if cuda else "trellis_space_generate.py"), []),
    }


def motores_del_taller(s: Sistema, req: List[str], vram: Optional[int], blender: Optional[str],
                       im: Optional[str], a1: bool) -> Dict[str, Dict[str, Any]]:
    """Cada motor que este servicio sabe ejecutar: ¿listo AQUÍ? y, si no, por qué (en palabras)."""
    mac32, cuda8, cuda16 = "apple-silicon-32gb" in req, "cuda-8gb" in req, "cuda-16gb" in req
    out: Dict[str, Dict[str, Any]] = {}

    def poner(mid: str, motivo: Optional[str]) -> None:
        out[mid] = {"listo": motivo is None, "motivo": motivo}

    hay_lab = s.existe(s.lab / "scripts")
    for mid, (py, script, _) in ordenes_generar(s, cuda8).items():
        hierro = {"pixal3d": cuda8, "hunyuan3d-mlx": mac32, "trellis2": mac32 or cuda16}[mid]
        if a1:
            poner(mid, "En la A1 solo se remalla (sin GPU).")
        elif not hierro:
            poner(mid, {"pixal3d": "Necesita una NVIDIA de 8 GB o más.", "hunyuan3d-mlx": "Necesita una Mac Apple Silicon de 32 GB o más.",
                        "trellis2": "Necesita una Mac Apple Silicon de 32 GB o una NVIDIA de 16 GB."}[mid])
        elif not hay_lab:
            poner(mid, f"image-to-3dlab no está instalado en {s.lab} (ver servicios/taller-3d/README.md).")
        elif not s.existe(script) or not s.existe(py):
            poner(mid, f"Falta {script.name} o su entorno de Python en image-to-3dlab: prepáralo desde su «Setup & Status».")
        else:
            poner(mid, None)
    poner("stable-fast-3d", "El README de image-to-3dlab no documenta su orden de generar por línea de órdenes; úsalo desde su estudio (./lab).")
    poner("instant-meshes", None if im else "Instant Meshes no está instalado (ver README del taller).")
    for mid in ("quadriflow-blender", "blender-voxel"):
        poner(mid, None if blender else "Blender no está instalado.")
    if a1:
        poner("unirig", "En la A1 solo se remalla (sin GPU).")
    elif not cuda8:
        poner("unirig", "UniRig necesita CUDA (NVIDIA de 8 GB o más).")
    elif not s.existe(s.unirig / "launch" / "inference" / "generate_skeleton.sh"):
        poner("unirig", f"UniRig no está clonado en {s.unirig}.")
    else:
        poner("unirig", None)
    return out


def detectar(s: Sistema) -> Dict[str, Any]:
    """Capacidades con los nombres de REQUISITOS_3D, el hierro (forma de `Hierro`) y los motores listos."""
    ram, vram = ram_total_gb(s), vram_nvidia_gb(s)
    apple = s.plataforma == "Darwin" and s.maquina == "arm64"
    blender, im, a1 = blender_de(s), instant_meshes_de(s), es_a1(s, vram)
    req = ["cpu"]  # como capacidadesDe: la CPU siempre; si falta Instant Meshes lo dice su motor
    if blender:
        req.append("blender")
    if apple and (ram or 0) >= 32:
        req.append("apple-silicon-32gb")
    if vram is not None and vram >= 8:
        req.append("cuda-8gb")
    if vram is not None and vram >= 16:
        req.append("cuda-16gb")
    hierro = {"gpu": "nvidia" if vram is not None else "apple" if apple else "ninguna", "ramGB": round(ram or 0, 1),
              "vramGB": vram, "blender": bool(blender), "permiteEspacioHf": False, "claveExterna": False}
    return {"version": VERSION, "requisitos": req, "hierro": hierro, "a1": a1,
            "motores": motores_del_taller(s, req, vram, blender, im, a1)}


# ───────────────────────────── gobernador ─────────────────────────────

def recursos(s: Sistema) -> Dict[str, Any]:
    """Memoria libre (GB), presión (1 normal · 2 aviso · 4 crítica; None = no se sabe) y si va con batería."""
    libre: Optional[float] = None
    presion: Optional[int] = None
    bateria: Optional[bool] = None
    if s.plataforma == "Darwin":
        vm = s.salida(["vm_stat"]) or ""
        pagina = re.search(r"page size of (\d+) bytes", vm)
        paginas = sum(int(n) for n in re.findall(r"Pages (?:free|inactive|speculative):\s+(\d+)", vm))
        libre = paginas * int(pagina.group(1)) / GIB if pagina else None
        p = (s.salida(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"]) or "").strip()
        presion = int(p) if p.isdigit() else None
        batt = s.salida(["pmset", "-g", "batt"])
        bateria = None if batt is None else "Battery Power" in batt
    else:
        try:
            m = re.search(r"MemAvailable:\s+(\d+)\s+kB", s.leer("/proc/meminfo"))
            libre = int(m.group(1)) * 1024 / GIB if m else None
        except OSError:
            pass
        try:
            m = re.search(r"some avg10=([\d.]+)", s.leer("/proc/pressure/memory"))
            presion = None if not m else 4 if float(m.group(1)) >= 40 else 2 if float(m.group(1)) >= 10 else 1
        except OSError:
            pass
        estados = []
        for r in s.glob("/sys/class/power_supply/*/status"):
            try:
                estados.append(s.leer(r).strip())
            except OSError:
                pass
        bateria = ("Discharging" in estados) if estados else None
    return {"memoria_libre_gb": None if libre is None else round(libre, 2), "presion": presion, "bateria": bateria}


def gobernador(etapas: List[str], rec: Dict[str, Any], a1: bool) -> Optional[str]:
    """None si el trabajo cabe ahora; si no, el motivo en palabras."""
    if a1 and any(e != "remallar" for e in etapas):
        return "En la A1 solo se remalla: generar y riggear van a una neurona con GPU."
    libre, presion = rec.get("memoria_libre_gb"), rec.get("presion")
    if any(e in PESADAS for e in etapas):
        if rec.get("bateria"):
            return "La neurona va con batería: los trabajos pesados esperan a que esté enchufada."
        if presion is not None and presion >= 2:
            return f"La memoria está bajo presión (nivel {presion}): los trabajos pesados esperan."
        if libre is None:
            return "No se pudo medir la memoria libre: un trabajo pesado no se arranca a ciegas."
        if libre < MIN_LIBRE_PESADA_GB:
            return f"Solo quedan {libre:.1f} GB de memoria libre; un trabajo pesado pide {MIN_LIBRE_PESADA_GB:.0f} GB."
    if presion is not None and presion >= 4:
        return "La memoria está en presión crítica: ni siquiera se remalla ahora."
    if libre is not None and libre < MIN_LIBRE_REMALLAR_GB:
        return f"Solo quedan {libre:.1f} GB de memoria libre; remallar pide {MIN_LIBRE_REMALLAR_GB:.0f} GB."
    return None


# ───────────────────────────── etapas ─────────────────────────────

# Un solo guion de Blender para todo lo que se hace sin ventana: convertir, QuadriFlow y vóxeles.
GUION_BLENDER = r"""
import bpy, sys, math
a = sys.argv[sys.argv.index("--") + 1:]
modo, entrada, salida, caras = a[0], a[1], a[2], int(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = entrada.lower().rsplit(".", 1)[-1]
{"glb": lambda: bpy.ops.import_scene.gltf(filepath=entrada), "obj": lambda: bpy.ops.wm.obj_import(filepath=entrada),
 "ply": lambda: bpy.ops.wm.ply_import(filepath=entrada), "fbx": lambda: bpy.ops.import_scene.fbx(filepath=entrada)}[ext]()
mallas = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not mallas:
    raise SystemExit("la entrada no trae ninguna malla")
for o in bpy.context.scene.objects:
    o.select_set(o.type == "MESH")
bpy.context.view_layer.objects.active = mallas[0]
if len(mallas) > 1:
    bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
if modo == "quadriflow":
    bpy.ops.object.quadriflow_remesh(target_faces=caras)
elif modo == "voxel":
    lado = max(o.dimensions) or 1.0
    o.data.remesh_voxel_size = lado / max(32, int(math.sqrt(max(caras, 6) / 6)))
    bpy.ops.object.voxel_remesh()
if salida.lower().endswith(".obj"):
    bpy.ops.wm.obj_export(filepath=salida, export_selected_objects=False)
else:
    bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB")
"""


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(1 << 20), b""):
            h.update(trozo)
    return h.hexdigest()


class FalloEtapa(Exception):
    pass


def _correr(s: Sistema, orden: List[str], etapa: str, cwd: Optional[Path] = None) -> None:
    try:
        r = s.ejecutar(orden, capture_output=True, text=True, timeout=TOPE_S[etapa], cwd=str(cwd) if cwd else None)
    except subprocess.TimeoutExpired:
        raise FalloEtapa(f"{etapa}: tiempo agotado ({TOPE_S[etapa] // 60} min).")
    except OSError as e:
        raise FalloEtapa(f"{etapa}: no se pudo ejecutar {Path(orden[0]).name} ({e.strerror or e}).")
    if r.returncode != 0:
        cola = ((r.stderr or "") + (r.stdout or "")).strip().splitlines()[-3:]
        raise FalloEtapa(f"{etapa}: {Path(orden[0]).name} terminó con código {r.returncode}" + (f": {' / '.join(cola)}" if cola else "."))


def _blender(s: Sistema, modo: str, entrada: Path, salida: Path, caras: int, etapa: str) -> None:
    b = blender_de(s)
    if not b:
        raise FalloEtapa(f"{etapa}: Blender no está instalado.")
    _correr(s, [b, "-b", "--factory-startup", "--python-expr", GUION_BLENDER, "--", modo, str(entrada), str(salida), str(caras)], etapa)


def etapa_generar(s: Sistema, motor: str, entrada: Path, carpeta: Path) -> Path:
    if entrada.suffix.lower() not in EXT_IMAGEN:
        raise FalloEtapa("generar: la entrada tiene que ser una imagen (PNG con transparencia, JPEG o WebP).")
    cuda = (vram_nvidia_gb(s) or 0) >= 8
    orden = ordenes_generar(s, cuda).get(motor)
    if not orden:
        raise FalloEtapa(f"generar: este taller no sabe ejecutar «{motor}».")
    py, script, extra = orden
    salida = carpeta / "generar.glb"
    _correr(s, [str(py), str(script), str(entrada), str(salida), *extra], "generar", cwd=s.lab)
    return salida


def etapa_remallar(s: Sistema, motor: str, entrada: Path, carpeta: Path, caras: int) -> Path:
    if entrada.suffix.lower() not in EXT_MALLA:
        raise FalloEtapa("remallar: la entrada tiene que ser una malla (GLB, OBJ, PLY o FBX).")
    if motor in ("quadriflow-blender", "blender-voxel"):
        salida = carpeta / "remallar.glb"
        _blender(s, "quadriflow" if motor == "quadriflow-blender" else "voxel", entrada, salida, caras, "remallar")
        return salida
    if motor != "instant-meshes":
        raise FalloEtapa(f"remallar: este taller no sabe ejecutar «{motor}».")
    im = instant_meshes_de(s)
    if not im:
        raise FalloEtapa("remallar: Instant Meshes no está instalado.")
    fuente = entrada
    if entrada.suffix.lower() not in (".obj", ".ply"):  # Instant Meshes solo lee y escribe OBJ/PLY
        fuente = carpeta / "remallar-entrada.obj"
        _blender(s, "convertir", entrada, fuente, caras, "remallar")
    obj = carpeta / "remallar.obj"
    _correr(s, [im, str(fuente), "-o", str(obj), "-f", str(caras), "-d"], "remallar")
    if not blender_de(s):
        return obj  # sin Blender no hay conversión: el resultado se queda en OBJ y se dice su formato
    glb = carpeta / "remallar.glb"
    _blender(s, "convertir", obj, glb, caras, "remallar")
    return glb


def etapa_riggear(s: Sistema, motor: str, entrada: Path, carpeta: Path) -> Path:
    if motor != "unirig":
        raise FalloEtapa(f"riggear: este taller no sabe ejecutar «{motor}».")
    if (vram_nvidia_gb(s) or 0) < 8:
        raise FalloEtapa("riggear: UniRig necesita CUDA (NVIDIA de 8 GB o más).")
    if entrada.suffix.lower() not in (".glb", ".obj", ".fbx"):
        raise FalloEtapa("riggear: UniRig acepta GLB, OBJ o FBX.")
    lanzar = s.unirig / "launch" / "inference"
    esq, piel, salida = carpeta / "riggear-esqueleto.fbx", carpeta / "riggear-piel.fbx", carpeta / "riggear.glb"
    _correr(s, ["bash", str(lanzar / "generate_skeleton.sh"), "--input", str(entrada), "--output", str(esq)], "riggear", cwd=s.unirig)
    _correr(s, ["bash", str(lanzar / "generate_skin.sh"), "--input", str(esq), "--output", str(piel)], "riggear", cwd=s.unirig)
    _correr(s, ["bash", str(lanzar / "merge.sh"), "--source", str(piel), "--target", str(entrada), "--output", str(salida)], "riggear", cwd=s.unirig)
    return salida


def escribir_procedencia(salida: Path, etapa: str, motor: Dict[str, Any], entrada: Path, ajustes: Dict[str, Any]) -> Dict[str, Any]:
    """`<archivo>.provenance.json` (como image-to-3dlab). Si el motor dejó el suyo, va dentro como «origen»."""
    origen = None
    for candidato in (salida.with_suffix(".provenance.json"), Path(str(salida) + ".provenance.json")):
        if candidato.exists():
            try:
                origen = json.loads(candidato.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                origen = {"aviso": f"{candidato.name} no es JSON válido"}
            break
    p: Dict[str, Any] = {"version": 1, "etapa": etapa, "herramienta": str(motor.get("id", "")),
                         "licencia": str(motor.get("licencia", "")), "uso": str(motor.get("uso", "")),
                         "entrada_sha256": sha256(entrada), "salida_sha256": sha256(salida), "ajustes": ajustes,
                         "fecha": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if motor.get("atribucion"):
        p["atribucion"] = str(motor["atribucion"])
    if motor.get("regionesExcluidas"):
        p["regionesExcluidas"] = [str(r) for r in motor["regionesExcluidas"]]
    if origen is not None:
        p["origen"] = origen
    Path(str(salida) + ".provenance.json").write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


# ───────────────────────────── trabajos ─────────────────────────────

def etapas_del_plan(plan: Any) -> List[Dict[str, Any]]:
    """Los pasos del plan que hace este taller, en orden: etapa con motor elegido y no saltada."""
    pasos = plan.get("pasos") if isinstance(plan, dict) else None
    if not isinstance(pasos, list):
        return []
    return [p for p in pasos if isinstance(p, dict) and p.get("etapa") in ETAPAS_DEL_TALLER and not p.get("saltada")
            and isinstance(p.get("motor"), dict) and isinstance(p["motor"].get("id"), str)]


def nombre_seguro(nombre: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(str(nombre)).name).strip(".-") or "entrada"
    return base[-80:]


class Taller:
    """Recibe trabajos, los valida contra lo que hay de verdad y el gobernador, y los hace de uno en uno."""

    def __init__(self, s: Sistema, sincrono: bool = False):
        self.s, self.sincrono = s, sincrono
        self.trabajos: Dict[str, Dict[str, Any]] = {}
        self.cerrojo = threading.Lock()
        self.cola: "queue.Queue[str]" = queue.Queue()
        self.carpeta = s.raiz / "trabajos"
        if not sincrono:
            threading.Thread(target=self._bucle, daemon=True).start()

    def crear(self, cuerpo: Any) -> Tuple[int, Dict[str, Any]]:
        if not isinstance(cuerpo, dict):
            return 400, {"motivo": "El cuerpo tiene que ser un objeto JSON con «plan» y «entrada»."}
        pasos = etapas_del_plan(cuerpo.get("plan"))
        if not pasos:
            return 422, {"motivo": "El plan no trae ninguna etapa que haga este taller (generar, remallar o riggear con motor elegido)."}
        caps = detectar(self.s)
        for p in pasos:
            m = caps["motores"].get(p["motor"]["id"])
            if not m:
                return 422, {"motivo": f"{p['etapa']}: este taller no ejecuta «{p['motor']['id']}»."}
            if not m["listo"]:
                return 422, {"motivo": f"{p['etapa']}: {m['motivo']}"}
        no = gobernador([p["etapa"] for p in pasos], recursos(self.s), caps["a1"])
        if no:
            return 503, {"motivo": no}
        entrada = cuerpo.get("entrada")
        if not isinstance(entrada, dict) or not isinstance(entrada.get("base64"), str):
            return 400, {"motivo": "Falta «entrada» con «nombre» y «base64»."}
        nombre = nombre_seguro(entrada.get("nombre", "entrada"))
        validas = EXT_IMAGEN if pasos[0]["etapa"] == "generar" else EXT_MALLA
        if Path(nombre).suffix.lower() not in validas:
            return 422, {"motivo": f"La entrada de «{pasos[0]['etapa']}» tiene que ser {', '.join(validas)}."}
        try:
            datos = base64.b64decode(entrada["base64"], validate=True)
        except ValueError:
            return 400, {"motivo": "«entrada.base64» no es base64 válido."}
        if not datos or len(datos) > MAX_ENTRADA_BYTES:
            return 413, {"motivo": f"La entrada tiene que pesar entre 1 byte y {MAX_ENTRADA_BYTES // (1024 * 1024)} MB."}
        opt = cuerpo.get("optimizacion") if isinstance(cuerpo.get("optimizacion"), dict) else {}
        rem = opt.get("remallado") if isinstance(opt.get("remallado"), dict) else {}
        caras = rem.get("caras") if isinstance(rem.get("caras"), int) and 100 <= rem.get("caras") <= 2_000_000 else 25_000
        tid = uuid.uuid4().hex
        carpeta = self.carpeta / tid
        carpeta.mkdir(parents=True, exist_ok=True)
        (carpeta / nombre).write_bytes(datos)
        t = {"id": tid, "estado": "en-cola", "etapas": [p["etapa"] for p in pasos], "etapa": None, "progreso": 0,
             "motivo": None, "resultado": None, "procedencia": [], "creado": time.time(), "actualizado": time.time(),
             "_pasos": pasos, "_entrada": nombre, "_caras": caras}
        with self.cerrojo:
            self.trabajos[tid] = t
        self._guardar(t)
        if self.sincrono:
            self._ejecutar(tid)
        else:
            self.cola.put(tid)
        return 202, self.publico(tid)

    def publico(self, tid: str) -> Dict[str, Any]:
        with self.cerrojo:
            t = self.trabajos.get(tid)
            return {k: v for k, v in t.items() if not k.startswith("_")} if t else {}

    def archivo_resultado(self, tid: str) -> Optional[Path]:
        with self.cerrojo:
            t = self.trabajos.get(tid)
        if not t or t["estado"] != "lista" or not t["resultado"]:
            return None
        return self.carpeta / tid / t["resultado"]["archivo"]

    def _poner(self, tid: str, **cambios: Any) -> None:
        with self.cerrojo:
            t = self.trabajos[tid]
            t.update(cambios, actualizado=time.time())
        self._guardar(t)

    def _guardar(self, t: Dict[str, Any]) -> None:
        ruta = self.carpeta / t["id"] / "estado.json"
        try:
            ruta.write_text(json.dumps({k: v for k, v in t.items() if not k.startswith("_")}, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass  # el estado vive en memoria; el archivo es solo para revisar después

    def _bucle(self) -> None:
        while True:
            self._ejecutar(self.cola.get())

    def _ejecutar(self, tid: str) -> None:
        t = self.trabajos[tid]
        carpeta, actual = self.carpeta / tid, self.carpeta / tid / t["_entrada"]
        procedencia: List[Dict[str, Any]] = []
        try:
            for i, p in enumerate(t["_pasos"]):
                no = gobernador([p["etapa"]], recursos(self.s), detectar(self.s)["a1"])  # pudo cambiar mientras esperaba
                if no:
                    raise FalloEtapa(no)
                self._poner(tid, estado="trabajando", etapa=p["etapa"], progreso=round(100 * i / len(t["_pasos"])))
                mid = p["motor"]["id"]
                if p["etapa"] == "generar":
                    salida, ajustes = etapa_generar(self.s, mid, actual, carpeta), {}
                elif p["etapa"] == "remallar":
                    salida, ajustes = etapa_remallar(self.s, mid, actual, carpeta, t["_caras"]), {"caras": t["_caras"]}
                else:
                    salida, ajustes = etapa_riggear(self.s, mid, actual, carpeta), {}
                if not salida.exists() or salida.stat().st_size == 0:
                    raise FalloEtapa(f"{p['etapa']}: {mid} terminó sin dejar archivo.")
                procedencia.append(escribir_procedencia(salida, p["etapa"], p["motor"], actual, ajustes))
                actual = salida
            self._poner(tid, estado="lista", etapa=None, progreso=100, procedencia=procedencia,
                        resultado={"archivo": actual.name, "formato": actual.suffix.lstrip(".").lower(),
                                   "bytes": actual.stat().st_size, "sha256": sha256(actual)})
        except FalloEtapa as e:
            self._poner(tid, estado="fallida", motivo=str(e), procedencia=procedencia)
        except Exception as e:  # noqa: BLE001 — un fallo inesperado se dice, no tumba el servicio
            self._poner(tid, estado="fallida", motivo=f"Error inesperado del taller: {type(e).__name__}.", procedencia=procedencia)


# ───────────────────────────── token y HTTP ─────────────────────────────

def archivo_entorno(s: Sistema) -> Path:
    return Path(s.entorno.get("TALLER3D_ENV") or (s.raiz / "env"))


def leer_token(ruta: Path) -> Tuple[Optional[str], Optional[str]]:
    """(token, None) o (None, motivo). El token NUNCA se imprime ni se registra."""
    if not ruta.exists():
        return None, f"Falta el archivo del token ({ruta}). Créalo con: python3 taller.py token"
    if os.name == "posix" and ruta.stat().st_mode & 0o077:
        return None, f"El archivo del token ({ruta}) lo pueden leer otros usuarios. Arréglalo con: chmod 600 '{ruta}'"
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        clave, _, valor = linea.partition("=")
        if clave.strip() == "TALLER3D_TOKEN":
            v = valor.strip().strip("'\"")
            return (v, None) if len(v) >= 32 else (None, "TALLER3D_TOKEN es demasiado corto (mínimo 32 caracteres).")
    return None, f"{ruta} no tiene la línea TALLER3D_TOKEN=…"


def crear_token(ruta: Path) -> bool:
    """Crea el archivo con un token nuevo (permisos 600) si no existe. Devuelve si lo creó."""
    if ruta.exists():
        return False
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(ruta), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(f"TALLER3D_TOKEN={secrets.token_urlsafe(32)}\n")
    return True


def crear_manejador(taller: Taller, token: str, puerto: int, origenes: List[str]) -> type:
    hosts = {f"127.0.0.1:{puerto}", f"localhost:{puerto}"}

    class Manejador(BaseHTTPRequestHandler):
        server_version = "taller-3d"
        sys_version = ""

        def log_message(self, formato: str, *args: Any) -> None:  # solo método, ruta y código: nada de cabeceras
            sys.stderr.write(f"taller-3d · {self.command} {self.path.split('?')[0]} · {args[1] if len(args) > 1 else ''}\n")

        def _cors(self) -> None:
            origen = self.headers.get("Origin", "")
            if origen in origenes:
                self.send_header("Access-Control-Allow-Origin", origen)
                self.send_header("Vary", "Origin")

        def _json(self, codigo: int, datos: Dict[str, Any]) -> None:
            cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(cuerpo)

        def _permitido(self) -> bool:
            if self.headers.get("Host", "") not in hosts:  # contra el «DNS rebinding»
                self._json(421, {"motivo": "Este taller solo atiende en 127.0.0.1."})
                return False
            dado = self.headers.get("Authorization", "")
            if not hmac.compare_digest(dado.encode("utf-8"), f"Bearer {token}".encode("utf-8")):
                self._json(401, {"motivo": "Falta el token del taller o no es el correcto."})
                return False
            return True

        def do_OPTIONS(self) -> None:  # noqa: N802 — preflight del navegador del OS
            self.send_response(204)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            ruta = self.path.split("?")[0].rstrip("/")
            if ruta == "/salud":
                if self.headers.get("Host", "") not in hosts:
                    return self._json(421, {"motivo": "Este taller solo atiende en 127.0.0.1."})
                return self._json(200, {"ok": True, "servicio": "taller-3d", "version": VERSION})
            if not self._permitido():
                return
            if ruta == "/capacidades":
                return self._json(200, {**detectar(taller.s), "recursos": recursos(taller.s)})
            partes = ruta.split("/")
            if len(partes) in (3, 4) and partes[1] == "trabajos" and RE_ID.match(partes[2]):
                if len(partes) == 3:
                    t = taller.publico(partes[2])
                    return self._json(200, t) if t else self._json(404, {"motivo": "No hay ningún trabajo con ese id."})
                if partes[3] == "resultado":
                    archivo = taller.archivo_resultado(partes[2])
                    if not archivo or not archivo.exists():
                        return self._json(404, {"motivo": "Ese trabajo no tiene resultado (aún no está listo o falló)."})
                    datos = archivo.read_bytes()
                    self.send_response(200)
                    self._cors()
                    self.send_header("Content-Type", "model/gltf-binary" if archivo.suffix == ".glb" else "application/octet-stream")
                    self.send_header("Content-Length", str(len(datos)))
                    self.end_headers()
                    self.wfile.write(datos)
                    return
            self._json(404, {"motivo": "Ruta desconocida."})

        def do_POST(self) -> None:  # noqa: N802
            if not self._permitido():
                return
            if self.path.split("?")[0].rstrip("/") != "/trabajos":
                return self._json(404, {"motivo": "Ruta desconocida."})
            largo = int(self.headers.get("Content-Length") or 0)
            if largo <= 0 or largo > MAX_ENTRADA_BYTES * 4 // 3 + 65536:
                return self._json(413, {"motivo": "El cuerpo está vacío o es demasiado grande."})
            try:
                cuerpo = json.loads(self.rfile.read(largo).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                return self._json(400, {"motivo": "El cuerpo no es JSON válido."})
            codigo, datos = taller.crear(cuerpo)
            self._json(codigo, datos)

    return Manejador


# ───────────────────────────── descarga de pesos (solo con orden explícita) ─────────────────────────────

def orden_descarga(s: Sistema, motor: str) -> Tuple[Optional[List[str]], float]:
    """La orden de image-to-3dlab que descarga los pesos de un motor y su tamaño aproximado (GB)."""
    py = str(_python_lab(s, "")) if s.existe(_python_lab(s, "")) else "python3"
    tabla = {
        "pixal3d": ([py, "scripts/bootstrap_pixal3d.py"], 8.4),
        "stable-fast-3d": ([py, "scripts/bootstrap_sf3d.py"], PESOS_GB),
        "trellis2": ([py, "scripts/bootstrap_trellis_cuda.py" if (vram_nvidia_gb(s) or 0) >= 16 else "scripts/bootstrap_trellis_space_macos.py"], 15.0),
        "hunyuan3d-mlx": ([str(_python_lab(s, "hunyuan_mlx/shape")), "hunyuan_mlx/download_weights.py"], PESOS_GB),
    }
    orden, gb = tabla.get(motor, (None, PESOS_GB))
    return orden, gb


def descargar_pesos(s: Sistema, motor: str, confirmado: bool, imprimir: Callable[[str], None] = print) -> int:
    orden, gb = orden_descarga(s, motor)
    if not orden:
        imprimir(f"No sé descargar pesos de «{motor}». Motores: pixal3d, trellis2, hunyuan3d-mlx, stable-fast-3d.")
        return 2
    if not s.existe(s.lab / "scripts"):
        imprimir(f"image-to-3dlab no está instalado en {s.lab}: instálalo primero (README del taller).")
        return 1
    hace_falta = FACTOR_DISCO * max(PESOS_GB, gb)
    libre = s.disco_libre(str(s.lab)) / GIB
    imprimir(f"«{motor}» descarga unos {gb:.1f} GB. Se exige {hace_falta:.0f} GB libres (el triple); hay {libre:.1f} GB.")
    if libre < hace_falta:
        imprimir("No hay espacio suficiente: no se descarga nada.")
        return 1
    if not confirmado:
        imprimir(f"No se ha descargado nada. Para hacerlo de verdad: python3 taller.py descargar-pesos --motor {motor} --si")
        return 2
    try:
        return s.ejecutar(orden, cwd=str(s.lab)).returncode  # interactiva: el propio guion de image-to-3dlab pregunta
    except OSError as e:
        imprimir(f"No se pudo lanzar la descarga: {e.strerror or e}.")
        return 1


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Taller 3D local de StarSeed OS (AV1011F).")
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("token", help="crea el archivo del token si no existe (no lo imprime)")
    sub.add_parser("capacidades", help="enseña lo que esta neurona puede hacer")
    sv = sub.add_parser("servir", help="escucha en 127.0.0.1")
    sv.add_argument("--puerto", type=int, default=int(os.environ.get("TALLER3D_PUERTO") or PUERTO))
    dp = sub.add_parser("descargar-pesos", help="descarga los pesos de un motor (13–14 GB): solo con --si")
    dp.add_argument("--motor", required=True)
    dp.add_argument("--si", action="store_true", help="confirmo la descarga")
    a = ap.parse_args(argv)
    s = Sistema()
    if a.orden == "token":
        ruta = archivo_entorno(s)
        print(f"Token creado en {ruta} (permisos 600)." if crear_token(ruta) else f"Ya existe {ruta}: no se toca.")
        return 0
    if a.orden == "capacidades":
        print(json.dumps({**detectar(s), "recursos": recursos(s)}, ensure_ascii=False, indent=2))
        return 0
    if a.orden == "descargar-pesos":
        return descargar_pesos(s, a.motor, a.si)
    token, motivo = leer_token(archivo_entorno(s))
    if not token:
        print(motivo, file=sys.stderr)
        return 1
    origenes = [o.strip() for o in (os.environ.get("TALLER3D_ORIGENES") or "http://localhost:9002,http://127.0.0.1:9002").split(",") if o.strip()]
    servidor = ThreadingHTTPServer((HOST, a.puerto), crear_manejador(Taller(s), token, a.puerto, origenes))
    print(f"Taller 3D escuchando en http://{HOST}:{a.puerto} (solo esta máquina).", file=sys.stderr)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
