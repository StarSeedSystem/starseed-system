#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recopila las fichas de capacidades de los nodos (MAG1120): orquestador Mac,
autocuración del A1 y sonda de Maggabox → ~/.starseed/capacidades-nodos.json.
Todo se inyecta (`read_fn`, `sonda_fn`, `write_fn`): sin red ni disco en pruebas."""
from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, List, Optional

HOME = os.path.expanduser("~")
RUTA_ORQUESTADOR = os.path.join(HOME, ".starseed", "orquestador.json")
RUTA_A1 = os.path.join(HOME, ".starseed", "a1-autocuracion.json")
RUTA_SALIDA = os.path.join(HOME, ".starseed", "capacidades-nodos.json")
# ALM1121 · el medidor de MetaGenesis enseña también Drive y lo que el alivio movió.
RUTA_DRIVE = os.path.join(HOME, ".starseed", "almacenamiento-drive.json")
RUTA_ALIVIO = os.path.join(HOME, ".starseed", "almacenamiento-alivio.json")
RUTA_INDICE = "starseed_memory_root/nodo/indice-pesados-maggabox.md"
NUCLEOS = ("nucleos", "núcleos", "cpu_count", "cpuCount", "cores", "cpus")
RAM = ("ramLibreMb", "ram_libre_mb", "ramLibreMB", "memoria_libre_mb")
CPU = ("cpu", "cpu_pct", "cpuPct", "carga_cpu", "uso_cpu", "cpu_1h")
DISCO = ("discoLibreGb", "disco_libre_gb", "discoLibreGB", "disco_gb")
ALMACEN = ("almacen", "almacén", "almacenamiento", "rutas_almacen", "carpetas")
CAPAS = ("capas", "capas_instaladas", "capasInstaladas", "layers")

def _buscar(datos: Any, claves: tuple, fondo: int = 3) -> Any:
    """Primer valor no nulo de `claves`, en el propio diccionario o anidado."""
    if not isinstance(datos, dict): return None
    for clave in claves:
        if datos.get(clave) is not None: return datos[clave]
    if fondo > 0:
        for valor in datos.values():
            encontrado = _buscar(valor, claves, fondo - 1)
            if encontrado is not None: return encontrado
    return None

def _numero(valor: Any) -> float:
    if isinstance(valor, bool) or valor is None: return 0.0
    try: return float(valor)
    except (TypeError, ValueError): return 0.0

def _capa(item: Any) -> Optional[str]:
    if isinstance(item, str): return item.strip() or None
    if not isinstance(item, dict): return None
    ident = item.get("id") or item.get("nombre") or item.get("name") or item.get("capa")
    if not isinstance(ident, str) or not ident.strip(): return None
    version = item.get("version") or item.get("versión") or item.get("v")
    return "%s@%s" % (ident.strip(), version) if version else ident.strip()

def _capas(valor: Any) -> List[str]:
    if isinstance(valor, dict):
        valor = valor["capas"] if isinstance(valor.get("capas"), list) else [
            "%s@%s" % (c, v) if v else str(c) for c, v in valor.items()]
    salida: List[str] = []
    for item in valor if isinstance(valor, list) else []:
        capa = _capa(item)
        if capa and capa not in salida: salida.append(capa)
    return salida

def _almacen(valor: Any) -> List[str]:
    if isinstance(valor, dict): valor = list(valor.keys())
    salida: List[str] = []
    for item in valor if isinstance(valor, list) else []:
        ruta = item.strip() if isinstance(item, str) else None
        if not ruta and isinstance(item, dict): ruta = item.get("ruta") or item.get("path")
        if isinstance(ruta, str) and ruta.strip() and ruta.strip() not in salida: salida.append(ruta.strip())
    return salida

def _ficha(nodo_id: str, medio: str, datos: Any, **medidas: Any) -> Dict[str, Any]:
    """Ficha de un nodo; lo que no se mide sale a cero o vacío, nunca inventado."""
    def valor(clave: str, claves: tuple) -> Any:
        return medidas[clave] if clave in medidas else _buscar(datos, claves)
    return {"nodoId": nodo_id, "medio": medio,
            "nucleos": int(round(_numero(valor("nucleos", NUCLEOS)))),
            "ramLibreMb": int(round(_numero(valor("ram", RAM)))),
            "cpu": _numero(valor("cpu", CPU)),
            "discoLibreGb": round(_numero(valor("disco", DISCO)), 1),
            "almacen": _almacen(valor("almacen", ALMACEN)),
            "capas": _capas(valor("capas", CAPAS))}

def _ficha_maggabox(sonda: Any) -> Dict[str, Any]:
    sonda = sonda if isinstance(sonda, dict) else {}
    carpetas = sonda.get("carpetas_starSeed_almacen")
    almacen = ["~/StarSeed-almacen/%s" % n for n in sorted(carpetas)] if isinstance(carpetas, dict) else []
    return _ficha("maggabox", "linux", sonda, nucleos=sonda.get("cpu"), ram=sonda.get("ramLibreMb"),
                  cpu=0, disco=sonda.get("discoLibreGb"), almacen=almacen, capas=sonda.get("capas"))

def _fuente(leer: Optional[Callable[[str], Any]], ruta: str) -> Dict[str, Any]:
    try:
        if leer is None:
            with open(ruta, encoding="utf-8") as archivo: valor = json.load(archivo)
        else: valor = leer(ruta)
        if isinstance(valor, str): valor = json.loads(valor)
        return valor if isinstance(valor, dict) else {}
    except Exception: return {}

def _numero_valido(valor: Any) -> bool:
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)

def _anotar_alivio(ficha: Dict[str, Any], datos: Any) -> None:
    """Añade a `almacen` lo movido y el enlace al índice (lo que el medidor puede leer)."""
    datos = datos if isinstance(datos, dict) else {}
    movido = datos.get("movidoGb")
    if _numero_valido(movido) and movido > 0:
        ficha["almacen"].append("movido %.1f GB a la Maggabox" % movido)
    indice = datos.get("indice")
    if isinstance(indice, str) and indice.strip():
        ficha["almacen"].append("índice: %s" % indice.strip())

def _ficha_drive(drive: Dict[str, Any], alivio: Dict[str, Any]) -> Dict[str, Any]:
    almacen: List[str] = []
    _anotar_alivio({"almacen": almacen}, alivio or drive)
    if not any(a.startswith("índice:") for a in almacen):
        almacen.append("índice: %s" % RUTA_INDICE)
    nota = drive.get("nota")
    if isinstance(nota, str) and nota.strip(): almacen.append(nota.strip())
    return _ficha("Drive", "nube", {}, disco=drive.get("libreGb"), almacen=almacen, capas=[])

def _medir_drive() -> Dict[str, Any]:
    """Mide Drive si está montado; en macOS DriveFS puede informar del disco local."""
    import shutil
    base = os.environ.get("STARSEED_DRIVE") or os.path.expanduser("~/Library/CloudStorage")
    if not os.path.isdir(base): return {}
    try: _total, _usado, libre = shutil.disk_usage(base)
    except OSError: return {}
    return {"libreGb": round(libre / (1024 ** 3), 1),
            "nota": "df de DriveFS puede informar del disco local en macOS"}

def recopilar(read_fn: Optional[Callable[[str], Any]] = None,
              sonda_fn: Optional[Callable[[], Any]] = None,
              drive_fn: Optional[Callable[[], Any]] = None) -> Dict[str, Any]:
    """Fichas de los nodos; `read_fn`, `sonda_fn` y `drive_fn` se inyectan en pruebas."""
    if sonda_fn is None: from sonda_maggabox import sonda_maggabox as sonda_fn
    try: sonda = sonda_fn()
    except Exception: sonda = {}
    alivio = _fuente(read_fn, RUTA_ALIVIO)
    drive = _fuente(read_fn, RUTA_DRIVE)
    if drive_fn is not None:
        try: medido = drive_fn() or {}
        except Exception: medido = {}
        if isinstance(medido, dict) and medido: drive = {**drive, **medido}
    mac = _ficha("mac-local", "mac", _fuente(read_fn, RUTA_ORQUESTADOR))
    _anotar_alivio(mac, alivio)
    nodos = [mac, _ficha_maggabox(sonda), _ficha("a1-oracle", "nube", _fuente(read_fn, RUTA_A1))]
    if _numero_valido(drive.get("libreGb")):
        nodos.append(_ficha_drive(drive, alivio))
    return {"nodos": nodos}

def guardar(datos: Dict[str, Any], write_fn: Optional[Callable[[str, str], Any]] = None) -> Dict[str, Any]:
    """Escribe el JSON; en pruebas se inyecta `write_fn(ruta, texto)`."""
    texto = json.dumps(datos, ensure_ascii=False, indent=1)
    if write_fn is not None:
        write_fn(RUTA_SALIDA, texto)
        return datos
    os.makedirs(os.path.dirname(RUTA_SALIDA), exist_ok=True)
    with open(RUTA_SALIDA + ".tmp", "w", encoding="utf-8") as archivo: archivo.write(texto)
    os.replace(RUTA_SALIDA + ".tmp", RUTA_SALIDA)
    return datos

if __name__ == "__main__":
    print(json.dumps(guardar(recopilar(drive_fn=_medir_drive)), ensure_ascii=False))
