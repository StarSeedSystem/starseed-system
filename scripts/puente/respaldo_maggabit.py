#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Maggabit · director de la pasada (MAG10 · MAG1117).

Una pasada: lee el medio; si el disco está y la imagen de trabajo no está montada, la adjunta
con `hdiutil attach … -owners on` y timeout (la bóveda no se monta aquí); el ritmo elige UN
trabajo o ninguno; se ejecuta con el módulo que toque; y queda el manifiesto escrito.
Decisión pura (`plan_pasada`), E/S fina con todo inyectable. Órdenes: `pasada`, `estado` y
`expulsar`; un cerrojo de archivo evita dos pasadas a la vez. Con el disco ausente nada
falla ni espera (principio 0) y todo subprocess lleva timeout: «sin-respuesta», nunca colgado.
"""
from __future__ import annotations

import datetime as dt
import fcntl
import json
import os
import shutil
import subprocess
import sys
import time
from typing import Any, Callable, Dict, List, Optional

import maggabit_clones
import maggabit_desarrollo
import maggabit_medio
import maggabit_ritmo
import maggabit_verificar
import maggabit_versiones

TOPE_S = 30.0
RAIZ = maggabit_medio.RAIZ
TRABAJO = maggabit_medio.TRABAJO
BOVEDA = maggabit_medio.BOVEDA
IMAGEN_TRABAJO = maggabit_medio.IMAGEN_TRABAJO
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUTA_CERROJO = "~/.starseed/maggabit/pasada.lock"
SIN_MODULO = "sin-módulo"


def presion_por_carga(carga: float) -> int:
    """PURA: carga media del sistema → presión 0 (tranquilo), 1 o 2 (lento)."""
    return 2 if carga >= 4.0 else 1 if carga >= 2.0 else 0


def plan_pasada(medio: Dict[str, Any], presion: int, libre_interno: float,
                ahora: float, ultimas: Dict[str, float],
                en_marcha: Optional[str]) -> Dict[str, Any]:
    """PURA: si hay que adjuntar la imagen de trabajo y qué trabajo toca."""
    montar = bool(medio.get("estado") == "listo" and not medio.get("trabajo_montado"))
    eleccion = maggabit_ritmo.siguiente(ahora, medio, libre_interno, presion,
                                        ultimas or {}, en_marcha)
    return {"montar": montar, "trabajo": eleccion["trabajo"],
            "motivo": eleccion["motivo"]}


def correr(args: List[str], ejecutar: Callable[..., Any],
           tope_s: float = TOPE_S) -> Dict[str, Any]:
    """Subprocess con timeout siempre: un volumen mudo da «sin-respuesta»."""
    try:
        hecho = ejecutar(args, capture_output=True, text=True, timeout=tope_s)
    except subprocess.TimeoutExpired:
        return {"codigo": None, "error": "sin-respuesta"}
    except OSError as fallo:
        return {"codigo": None, "error": str(fallo)}
    lineas = (getattr(hecho, "stderr", "") or "").strip().splitlines()
    return {"codigo": getattr(hecho, "returncode", 1),
            "salida": (getattr(hecho, "stdout", "") or "").strip(),
            "error": lineas[0] if lineas else ""}


def _ejecutores(ejecutar: Callable[..., Any], limite_kbps: Optional[int]) -> dict:
    """Módulo que toca para cada familia con capa de E/S propia."""
    return {
        "desarrollo": lambda: maggabit_desarrollo.respaldar(
            REPO, TRABAJO + "/respaldo/desarrollo",
            limite_kbps=limite_kbps, ejecutar=ejecutar),
        "instaladores": lambda: maggabit_versiones.revisar(
            RAIZ, pedir_gh=lambda args, timeout=60:
                maggabit_versiones.gh(args, timeout=timeout, ejecutar=ejecutar)),
        "versiones": lambda: maggabit_clones.ejecutar_dia(
            TRABAJO, dt.date.today(), ejecutar=ejecutar),
    }


def una_pasada(leer_medio: Callable[[], Dict[str, Any]], presion: int,
               libre_interno: float, ejecutar: Callable[..., Any], ahora: float,
               *, ultimas: Optional[Dict[str, float]] = None,
               en_marcha: Optional[str] = None,
               ejecutores: Optional[Dict[str, Callable[[], dict]]] = None,
               guardar: Optional[Callable[[dict], Any]] = None) -> Dict[str, Any]:
    """Una pasada: medio, montaje, un trabajo a lo sumo y manifiesto; nada falla sin disco."""
    medio = leer_medio()
    plan = plan_pasada(medio, presion, libre_interno, ahora, ultimas or {}, en_marcha)
    pasada: Dict[str, Any] = {"generado": ahora, "medio": medio.get("estado"),
                              "montar": plan["montar"], "trabajo": plan["trabajo"],
                              "motivo": plan["motivo"], "estado": "sin-trabajo"}
    if plan["montar"]:
        montaje = correr(["hdiutil", "attach", IMAGEN_TRABAJO, "-owners", "on"], ejecutar)
        pasada["montaje"] = montaje
        if montaje["codigo"] != 0:
            pasada["estado"] = "sin-montar"
            return _cerrar_pasada(pasada, guardar)
    if plan["trabajo"]:
        hacer = (ejecutores or {}).get(plan["trabajo"])
        if hacer is None:
            hacer = _ejecutores(ejecutar, maggabit_ritmo.limite_kbps(presion)).get(plan["trabajo"])
        pasada["ejecucion"] = hacer() if hacer else {"estado": SIN_MODULO}
        pasada["estado"] = "trabajo-servido" if hacer else "trabajo-" + SIN_MODULO
    return _cerrar_pasada(pasada, guardar)


def _cerrar_pasada(pasada: Dict[str, Any], guardar) -> Dict[str, Any]:
    """Escribe el manifiesto de la pasada: en ~/.starseed y, si el disco está, en RAIZ."""
    rutas = [maggabit_verificar.RUTA_ESTADO_MAGGABIT]
    if os.path.isdir(RAIZ):
        rutas.append(RAIZ + "/MetaGenesis/estado/ultima-pasada.json")
    pasada["manifiestos"] = (guardar or (lambda d: maggabit_verificar.guardar_manifiesto(
        d, rutas=rutas)))(pasada)
    return pasada


def quedo_montadas(resultados: List[Dict[str, Any]]) -> List[str]:
    """PURA: rutas de las imágenes que no se desmontaron (ocupadas)."""
    return [r["ruta"] for r in resultados if r.get("codigo") != 0]


def expulsar(ejecutar: Callable[..., Any], leer_medio_fn: Optional[Callable[[], dict]] = None,
             montados: Optional[List[str]] = None) -> Dict[str, Any]:
    """Desmonta las imágenes con timeout y expulsa el disco; si una queda, lo dice y no fuerza."""
    medio = (leer_medio_fn or maggabit_medio.leer)()
    if not medio.get("presente"):
        return {"estado": "sin-disco", "hecho": [], "quedo": []}
    if montados is None:
        texto = correr(["mount"], ejecutar)
        montados = maggabit_medio._puntos_montaje(texto["salida"])
    resultados: List[Dict[str, Any]] = []
    for ruta in (TRABAJO, maggabit_medio.BOVEDA):
        if ruta in montados:
            hecho = correr(["hdiutil", "detach", ruta], ejecutar)
            resultados.append({"ruta": ruta, "codigo": hecho["codigo"], "error": hecho["error"]})
    quedo = quedo_montadas(resultados)
    salida: Dict[str, Any] = {"estado": "imagen-ocupada" if quedo else "expulsado",
                              "hecho": [r["ruta"] for r in resultados if r["codigo"] == 0],
                              "quedo": quedo}
    if not quedo:
        fin = correr(["diskutil", "eject", RAIZ], ejecutar)
        if fin["codigo"] != 0:
            salida["estado"] = "no-expulsado"
            salida["quedo"] = [RAIZ]
            salida["error"] = fin["error"]
    return salida


def tomar_cerrojo(ruta: str, abrir: Optional[Callable[[str, str], Any]] = None,
                  bloquear: Optional[Callable[..., Any]] = None) -> Optional[Any]:
    """Toma un cerrojo de archivo exclusivo sin esperar; None si otra pasada lo tiene."""
    bloquear = bloquear or fcntl.flock
    abrir = abrir or open
    try:
        carpeta = os.path.dirname(ruta)
        if carpeta:
            os.makedirs(carpeta, exist_ok=True)
        mano = abrir(ruta, "w")
        bloquear(mano, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return mano
    except OSError:
        return None


def _presion_y_libre() -> tuple:
    """Presión (0/1/2) y GB libres del disco interno, mejor esfuerzo."""
    try:
        presion = presion_por_carga(os.getloadavg()[0])
    except OSError:
        presion = 0
    try:
        libre = round(shutil.disk_usage("/").free / (1024 ** 3), 2)
    except OSError:
        libre = 0.0
    return presion, libre


def main(argv: Optional[List[str]] = None, leer_medio_fn=None,
         ejecutar_fn=None, escribir=None, guardar=None,
         abrir=None, bloquear=None) -> int:
    """Órdenes: `pasada` (con cerrojo), `estado` y `expulsar`. Sin error con el disco ausente."""
    orden = list(sys.argv[1:] if argv is None else argv) or ["estado"]
    escribir = escribir or print
    ejecutar_fn = ejecutar_fn or subprocess.run
    leer_medio_fn = leer_medio_fn or maggabit_medio.leer
    if orden[0] == "estado":
        escribir(json.dumps(leer_medio_fn(), ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    if orden[0] == "pasada":
        mano = tomar_cerrojo(os.path.expanduser(RUTA_CERROJO), abrir=abrir, bloquear=bloquear)
        if mano is None:
            escribir("pasada en marcha: no se arranca otra")
            return 0
        presion, libre = _presion_y_libre()
        pasada = una_pasada(leer_medio_fn, presion, libre, ejecutar_fn,
                            time.time(), guardar=guardar)
        escribir(json.dumps(pasada, ensure_ascii=False, sort_keys=True))
        return 0
    if orden[0] == "expulsar":
        escribir(json.dumps(expulsar(ejecutar_fn, leer_medio_fn),
                            ensure_ascii=False, sort_keys=True))
        return 0
    escribir("Uso: respaldo_maggabit.py pasada|estado|expulsar")
    return 2


if __name__ == "__main__":
    sys.exit(main())
