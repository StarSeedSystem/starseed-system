# -*- coding: utf-8 -*-
"""Estado del medio Maggabit (MAG1117): disco, imagen y bóveda.

La DECISIÓN es pura (`estado_medio`): recibe lo medido y responde sin tocar disco, red ni
procesos. La E/S es una capa fina (`leer`) con todo inyectable y tope de tiempo en cada
subprocess: un exFAT que no responde se informa «sin-respuesta» y nunca cuelga. Ausente no
lanza nada (principio 0). El disco se reconoce por UUID, jamás por el nombre, porque en
/Volumes/Maggabit puede haber otro con el mismo nombre. Uso: `… maggabit_medio.py estado`.
"""
from __future__ import annotations
import json, os, plistlib, re, shutil, subprocess, sys
from typing import Any, Callable, Dict, List, Optional

UUID_VOLUMEN = "7C596EA4-EFA0-38F1-A4D5-3E060EBA11D7"
RAIZ = "/Volumes/Maggabit"
TRABAJO = "/Volumes/MaggabitTrabajo"
BOVEDA = "/Volumes/MaggabitBoveda"
IMAGEN_TRABAJO = RAIZ + "/MetaGenesis/imagenes/trabajo.sparsebundle"
IMAGEN_BOVEDA = RAIZ + "/MetaGenesis/imagenes/boveda.sparsebundle"
_RE_MONTAJE = re.compile(r"\son\s(.+?)\s+\(")


def _texto(valor: Any) -> str:
    return valor.strip().lower() if isinstance(valor, str) else ""


def _num(valor: Any) -> Optional[float]:
    return None if isinstance(valor, bool) or not isinstance(valor, (int, float)) else float(valor)


def estado_medio(info: Optional[Dict[str, Any]], montados: List[str],
                 libres_gb: Dict[str, float], existe_boveda: bool,
                 existe_imagen: Optional[bool] = None) -> Dict[str, Any]:
    """Decide el estado sin tocar nada; sin `existe_imagen`, vale que la imagen esté montada."""
    montados = list(montados or [])
    libres_gb = libres_gb or {}
    presente = isinstance(info, dict) and info.get("VolumeUUID") == UUID_VOLUMEN
    sistema = None
    if isinstance(info, dict):
        sistema = (_texto(info.get("FilesystemType")) or _texto(info.get("FilesystemName"))
                   or _texto(info.get("Type (Bundle)")) or "desconocido")
    trabajo_montado = bool(presente and TRABAJO in montados)
    boveda = "abierta" if BOVEDA in montados else ("cerrada" if existe_boveda else "sin-crear")
    if existe_imagen is None:
        existe_imagen = trabajo_montado
    libre_gb = _num(libres_gb.get(RAIZ)) if presente else None
    libre_trabajo_gb = _num(libres_gb.get(TRABAJO)) if trabajo_montado else None
    if not presente:
        estado = "otro-disco" if RAIZ in montados else "ausente"
    else:
        estado = "listo" if existe_imagen else "sin-imagen"
    return {"presente": bool(presente), "sistema": sistema, "trabajo_montado": trabajo_montado,
            "boveda": boveda, "libre_gb": libre_gb, "libre_trabajo_gb": libre_trabajo_gb,
            "estado": estado}

def _bytes_salida(resultado: Any) -> bytes:
    salida = getattr(resultado, "stdout", b"") or b""
    if isinstance(salida, str):
        return salida.encode("utf-8", "replace")
    return bytes(salida) if isinstance(salida, (bytes, bytearray)) else b""

def _puntos_montaje(texto: str) -> List[str]:
    """Puntos de montaje de la salida de `mount` (… on /ruta (tipo, …))."""
    return [m.group(1).strip() for m in map(_RE_MONTAJE.search, (texto or "").splitlines()) if m]

def _libre_gb(ruta: str) -> float:
    return round(shutil.disk_usage(ruta).free / (1024 ** 3), 2)

def leer(correr: Callable[..., Any] = subprocess.run, tope_s: float = 10,
         existe: Optional[Callable[[str], bool]] = None,
         libre: Optional[Callable[[str], float]] = None) -> Dict[str, Any]:
    """Mide el medio (o dobles inyectados). Ausente no lanza nada; timeout no cuelga."""
    existe = existe or os.path.exists
    libre = libre or _libre_gb
    sin_respuesta: Dict[str, Any] = {"estado": "sin-respuesta"}
    try:
        if not existe(RAIZ):
            return estado_medio(None, [], {}, False, existe_imagen=False)
        respuesta = correr(["diskutil", "info", "-plist", RAIZ], capture_output=True, timeout=tope_s)
    except (subprocess.TimeoutExpired, OSError):
        return sin_respuesta
    info: Optional[Dict[str, Any]] = None
    if getattr(respuesta, "returncode", 0) == 0:
        try:
            cargado = plistlib.loads(_bytes_salida(respuesta))
            info = cargado if isinstance(cargado, dict) else None
        except Exception:  # plist ilegible: disco no reconocido
            info = None
    try:
        respuesta = correr(["mount"], capture_output=True, timeout=tope_s)
    except (subprocess.TimeoutExpired, OSError):
        return sin_respuesta
    montados = _puntos_montaje(_bytes_salida(respuesta).decode("utf-8", "replace"))
    libres: Dict[str, float] = {}
    for ruta in (RAIZ, TRABAJO):
        if ruta in montados:
            try:
                libres[ruta] = float(libre(ruta))
            except Exception:  # sin medida fiable de ese volumen
                pass
    try:
        existe_boveda, existe_imagen = bool(existe(IMAGEN_BOVEDA)), bool(existe(IMAGEN_TRABAJO))
    except OSError:
        return sin_respuesta
    return estado_medio(info, montados, libres, existe_boveda, existe_imagen=existe_imagen)


def main(argv: Optional[List[str]] = None, leer_fn: Callable[..., Dict[str, Any]] = leer,
         salida: Callable[[str], Any] = print) -> int:
    """Órdenes de la línea: `estado` (por defecto) imprime el JSON."""
    orden = list(sys.argv[1:] if argv is None else argv) or ["estado"]
    if orden[0] != "estado":
        sys.stderr.write("Uso: maggabit_medio.py estado\n")
        return 2
    salida(json.dumps(leer_fn(), ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
