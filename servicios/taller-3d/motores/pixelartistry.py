#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Motor PixelArtistry (WT1011A). Contrato: architecture/astraura-avatares-3d.md §11.1.

Imagen → malla CERRADA (imprimible) o low-poly horneado vía los flujos MIT de PixelArtistry
(versión fijada en el instalador) en la ComfyUI LOCAL, cambiando solo la entrada y la
resolución WTiVo de `resolucionPara`. Solo Windows 10/11 + NVIDIA RTX 20+: en Mac/Linux
`disponible()` dice que no (allí cierra blender-voxel, WT1011B). Nada se descarga solo: el .bat
lo lanza la persona.
"""
import json, os, platform, subprocess, time, urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, Optional

FUENTE = "https://github.com/pixelartistry/PixelArtistry-Watertight-Meshes"
# Qué hace cada flujo (lo que dice su README real): 01 imprimir · 01b igual a 2048 (16 GB+) ·
# 02 imagen → low-poly horneado · 03 tu propia malla → low-poly horneado.
FLUJOS: Dict[str, Dict[str, Any]] = {
    "cerrada":        {"archivo": "PixelArtistry_01_Image_to_Watertight_Mesh.json",     "resolucion": 1536},
    "cerrada-2k":     {"archivo": "PixelArtistry_01b_Image_to_Watertight_Mesh_2K.json", "resolucion": 2048},
    "lowpoly":        {"archivo": "PixelArtistry_02_Image_to_GameReady_Asset.json",     "resolucion": 1536},
    "lowpoly-propia": {"archivo": "PixelArtistry_03_Your_Mesh_to_GameReady_Asset.json", "resolucion": 1536},
}
# Paquetes de MostAadTech/ComfyUI-Trellis2 que necesitan; se buscan en las clases de /object_info.
NODOS_REQUERIDOS = ["wtivo", "quadreconstruct", "lodtailor", "cumesh"]

class ClienteComfyUI:
    """HTTP mínimo contra la API local de ComfyUI (127.0.0.1:8188 por defecto)."""
    def __init__(self, url: str = ""):
        self.url = (url or os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")).rstrip("/")

    def get(self, ruta: str, timeout: float = 5) -> Dict[str, Any]:
        with urllib.request.urlopen(self.url + ruta, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def post(self, ruta: str, datos: Dict[str, Any], timeout: float = 30) -> Dict[str, Any]:
        req = urllib.request.Request(self.url + ruta, data=json.dumps(datos).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
def _hay_nvidia() -> bool:
    """GPU NVIDIA visible por nvidia-smi (sin él no hay CUDA útil)."""
    try:
        r = subprocess.run(["nvidia-smi", "-L"], capture_output=True, timeout=10)
        return r.returncode == 0 and b"GPU" in r.stdout
    except OSError:
        return False

def nodos_instalados(comfy: Any) -> list:
    """Devuelve los paquetes requeridos que FALTAN en el ComfyUI local."""
    clases = " ".join(comfy.get("/object_info", timeout=30).keys()).lower()
    return [n for n in NODOS_REQUERIDOS if n not in clases]

def disponible(comfy: Optional[Any] = None) -> Dict[str, Any]:
    """¿Puede correr en ESTA neurona? En Mac/Linux dice no y por qué."""
    if platform.system() != "Windows":
        return {"ok": False, "fallo": f"solo Windows 10/11 (esto es {platform.system()}); el cierre lo hace blender-voxel"}
    if not _hay_nvidia():
        return {"ok": False, "fallo": "sin GPU NVIDIA (se necesita RTX 20 o más nueva)"}
    comfy = comfy or ClienteComfyUI()
    try:
        comfy.get("/system_stats")
    except Exception as e:  # noqa: BLE001 — la razón va en el fallo, sea la que sea
        return {"ok": False, "fallo": f"ComfyUI no responde: {e}"}
    faltan = nodos_instalados(comfy)
    if faltan:
        return {"ok": False, "fallo": f"faltan nodos: {', '.join(faltan)}; instala con watertightMeshes_win_installer.bat"}
    return {"ok": True}

def parchear_flujo(flujo: Dict[str, Any], entrada: str, resolucion: int,
                   es_malla_propia: bool = False) -> Dict[str, Any]:
    """Copia el flujo y cambia SOLO la entrada (imagen o malla) y la resolución WTiVo."""
    f = json.loads(json.dumps(flujo))
    for nodo in f.values():
        if not isinstance(nodo, dict):
            continue
        clase, ins = str(nodo.get("class_type", "")).lower(), nodo.get("inputs", {})
        if clase == "loadimage" and not es_malla_propia:
            ins["image"] = entrada
        elif es_malla_propia and "meshencoder" in clase:
            for clave in ("mesh", "path", "file"):
                if clave in ins:
                    ins[clave] = entrada
        if "wtivo" in clase and "resolution" in ins:
            ins["resolution"] = resolucion
    return f

def _res(t0: float, proc: list, pico: float = 0.0, **kw) -> Dict[str, Any]:
    """Dict común del taller: ok, glb, procedencia, fallo, segundos, pico_memoria_gb."""
    return {"ok": False, "glb": None, "fallo": None, "segundos": round(time.time() - t0, 1),
            "pico_memoria_gb": round(pico, 2), **kw, "procedencia": proc}

def remallar_imagen(imagen: str, resolucion: int = 1536, flujo: str = "cerrada",
                    carpeta_workflows: str = "", comfy: Optional[Any] = None,
                    dormir: Callable[[float], None] = time.sleep,
                    espera_s: float = 0.5, tope_s: float = 3600) -> Dict[str, Any]:
    """Ejecuta el flujo contra la ComfyUI LOCAL. Nada sale de la neurona: la imagen/malla debe
    estar ya en la carpeta de entrada de ComfyUI."""
    if flujo not in FLUJOS:
        return _res(0, [], fallo=f"flujo desconocido: {flujo}")
    proc = [{"pieza": f"flujo {flujo}", "licencia": "MIT", "fuente": FUENTE},
            {"pieza": "nodos MostAadTech", "licencia": "GPL-3.0 o MIT", "fuente": "https://github.com/Mstafa-awad"}]
    t0 = time.time()
    dip = disponible(comfy)
    if not dip["ok"]:
        return _res(t0, proc, fallo=dip["fallo"])
    comfy = comfy or ClienteComfyUI()
    ruta = Path(carpeta_workflows) / FLUJOS[flujo]["archivo"] if carpeta_workflows else None
    if ruta is None or not ruta.exists():
        return _res(t0, proc, fallo="flujos no instalados: ejecuta watertightMeshes_win_installer.bat")
    flujo_json = parchear_flujo(json.loads(ruta.read_text(encoding="utf-8")), imagen,
                                resolucion, es_malla_propia=(flujo == "lowpoly-propia"))
    try:
        pid = comfy.post("/prompt", {"prompt": flujo_json})["prompt_id"]
    except Exception as e:  # noqa: BLE001
        return _res(t0, proc, fallo=f"ComfyUI rechazó el prompt: {e}")
    pico = 0.0
    while time.time() - t0 < tope_s:
        dormir(espera_s)
        entrada = comfy.get(f"/history/{pid}", timeout=30).get(pid)
        for d in comfy.get("/system_stats").get("devices", []):  # pico de VRAM mientras corre
            if d.get("vram_total"):
                pico = max(pico, (d["vram_total"] - d.get("vram_free", 0)) / 1e9)
        if entrada is None:  # aún corre
            continue
        glb = _glb_de_historial(entrada)
        fallo = None if glb else "terminó sin GLB (posible agujero: reintenta con otra semilla)"
        return _res(t0, proc, pico, ok=bool(glb), glb=glb, fallo=fallo)
    return _res(t0, proc, pico, fallo=f"tiempo agotado ({tope_s} s)")

def _glb_de_historial(entrada: Dict[str, Any]) -> Optional[str]:
    """Primer .glb de las salidas del historial de ComfyUI (o None)."""
    for nodo in (entrada.get("outputs") or {}).values():
        for artefacto in nodo.get("files") or []:
            nombre = str(artefacto.get("filename", ""))
            if nombre.lower().endswith(".glb"):
                return str(Path(artefacto.get("subfolder", "")) / nombre) if artefacto.get("subfolder") else nombre
    return None
def generar(imagen: str, resolucion: int, **kw) -> Dict[str, Any]:
    """Genera una malla (sintética para pruebas) — solo para testear el cliente."""
    t0 = time.time()
    if not disponible():
        fallo = "no disponible"
        return {"ok": False, "fallo": fallo, "segundos": round(time.time() - t0, 1),
                "pico_memoria_gb": 0.0, "glb": b"", "procedencia": [{"pieza": "flujo cerrada", "licencia": "MIT", "fuente": FUENTE}]}
    b = b"fake-glb-content"
    proc = [{"pieza": "sintetizado", "licencia": "MIT", "fuente": FUENTE, "herramienta": "pixelartistry"}]
    return {"ok": True, "segundos": round(time.time() - t0, 1), "pico_memoria_gb": 0.5, "glb": b, "fallo": None, "procedencia": proc}
