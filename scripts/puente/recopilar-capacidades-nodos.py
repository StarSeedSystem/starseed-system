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
            "movidoGb": round(_numero(medidas.get("movido_gb", _buscar(datos, ("movidoGb", "movido_gb", "movido")))), 2),
            "indiceEnlace": medidas.get("indice_enlace", ""),
            "almacen": _almacen(valor("almacen", ALMACEN)),
            "capas": _capas(valor("capas", CAPAS))}

def _ficha_maggabox(sonda: Any, **medidas: Any) -> Dict[str, Any]:
    sonda = sonda if isinstance(sonda, dict) else {}
    carpetas = sonda.get("carpetas_starSeed_almacen")
    almacen = ["~/StarSeed-almacen/%s" % n for n in sorted(carpetas)] if isinstance(carpetas, dict) else []
    return _ficha("maggabox", "linux", sonda, nucleos=sonda.get("cpu"), ram=sonda.get("ramLibreMb"),
                  cpu=0, disco=sonda.get("discoLibreGb"), almacen=almacen, capas=sonda.get("capas"), **medidas)

def _fuente(leer: Optional[Callable[[str], Any]], ruta: str) -> Dict[str, Any]:
    try:
        if leer is None:
            with open(ruta, encoding="utf-8") as archivo: valor = json.load(archivo)
        else: valor = leer(ruta)
        if isinstance(valor, str): valor = json.loads(valor)
        return valor if isinstance(valor, dict) else {}
    except Exception: return {}

def recopilar(read_fn: Optional[Callable[[str], Any]] = None,
              sonda_fn: Optional[Callable[[], Any]] = None,
              movido_gb: Optional[float] = None,
              indice_enlace: Optional[str] = None) -> Dict[str, Any]:
    """Fichas de los tres nodos; `read_fn` y `sonda_fn` se inyectan en pruebas."""
    if sonda_fn is None: from sonda_maggabox import sonda_maggabox as sonda_fn
    try: sonda = sonda_fn()
    except Exception: sonda = {}
    medidas: Dict[str, Any] = {}
    if movido_gb is not None: medidas["movido_gb"] = movido_gb
    if indice_enlace is not None: medidas["indice_enlace"] = indice_enlace
    return {"nodos": [
        _ficha("mac-local", "mac", _fuente(read_fn, RUTA_ORQUESTADOR), **medidas),
        _ficha_maggabox(sonda, **medidas),
        _ficha("a1-oracle", "nube", _fuente(read_fn, RUTA_A1), **medidas),
    ]}

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
    print(json.dumps(guardar(recopilar()), ensure_ascii=False))
