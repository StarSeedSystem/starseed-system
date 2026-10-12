#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Espejo del estado de la Mac para el A1 (COL1012N).

Selección PURA de lo que se copia de ``starseed_memory_root/olas/`` y empaquetado
en un tar.gz acotado. Nunca incluye credenciales, ``.git`` ni nada fuera de olas/.

Contrato: architecture/colmena-relevo-contenedores.md.
"""
from __future__ import annotations

import gzip
import os
import tarfile
import tempfile
from typing import Iterable, List, Tuple

#: Archivos de estado que siempre viajan al espejo.
SIEMPRE = frozenset({"progreso.json", "progreso.md", "medios.json", "puntos-control.json"})
#: Una cola viaja solo si se tocó en los últimos 7 días.
COLA_VENTANA_S = 7 * 24 * 3600
#: Líneas que se conservan de cada log dentro del paquete.
LOG_LINEAS = 200
#: Tope del paquete (el A1 lo extrae entero en disco).
TOPE_BYTES = 15 * 1024 * 1024


def _sospechoso(nombre: str) -> bool:
    """Descarta rutas que no deben salir de la Mac: fuera de olas/, credenciales o VCS.

    Defensivo: el listado ya viene de olas/, pero un nombre con separadores, ``..`` o
    pinta de secreto se queda fuera aunque exista.
    """
    if not nombre or nombre.startswith("/") or ".." in nombre.split("/"):
        return True
    base = nombre.rsplit("/", 1)[-1].lower()
    return (base.startswith(".") or ".git" in base or "env" in base
            or "clave" in base or "secret" in base)


def es_log(nombre: str) -> bool:
    """Un log es un ``*.jsonl`` o un nombre que menciona «log» (de tareas o del orquestador)."""
    base = nombre.rsplit("/", 1)[-1].lower()
    return base.endswith(".jsonl") or "log" in base


def que_copiar(listado: Iterable[Tuple[str, float]], ahora: float) -> List[str]:
    """PURA. Elige qué se copia al espejo.

    Args:
        listado: pares ``(nombre relativo a olas/, mtime en segundos)`` de lo que hay.
        ahora: instante actual; las colas más viejas que la ventana no viajan.

    Returns:
        nombres relativos a olas/ que deben empaquetarse (orden estable).
    """
    corte = ahora - COLA_VENTANA_S
    sel: List[str] = []
    for nombre, mtime in listado:
        if _sospechoso(nombre):
            continue
        if nombre in SIEMPRE or es_log(nombre):
            sel.append(nombre)
        elif nombre.startswith("cola-") and nombre.endswith(".json") and mtime >= corte:
            sel.append(nombre)
    return sorted(sel)


def _escribir_recorte(origen: str, destino: str, lineas_log: int) -> None:
    """Copia un archivo; si es log, solo las últimas ``lineas_log`` líneas."""
    os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)
    if es_log(origen):
        with open(origen, "r", encoding="utf-8", errors="replace") as f:
            lineas = f.readlines()[-lineas_log:]
        with open(destino, "w", encoding="utf-8") as f:
            f.writelines(lineas)
    else:
        with open(origen, "rb") as fi, open(destino, "wb") as fo:
            fo.write(fi.read())


def _empaquetar_en(seleccion: List[str], olas_dir: str, ruta_tar: str, lineas_log: int) -> int:
    """Arma el tar.gz con los archivos en la raíz del paquete; devuelve su peso.

    El paquete es determinista (mtime del gzip y de cada entrada a 0): así la huella solo
    cambia cuando cambia el contenido, y el espejo no se reenvía en balde cada 5 minutos.
    """
    with tempfile.TemporaryDirectory(prefix="espejo_") as tmp:
        for nombre in seleccion:
            try:
                _escribir_recorte(os.path.join(olas_dir, nombre), os.path.join(tmp, nombre), lineas_log)
            except OSError:
                continue  # un archivo que desaparece a mitad no tira el espejo
        with open(ruta_tar, "wb") as crudo:
            with gzip.GzipFile(fileobj=crudo, mode="wb", mtime=0) as gz:
                with tarfile.open(fileobj=gz, mode="w") as tar:
                    for nombre in sorted(os.listdir(tmp)):
                        info = tar.gettarinfo(os.path.join(tmp, nombre), arcname=nombre)
                        info.mtime = 0
                        with open(os.path.join(tmp, nombre), "rb") as f:
                            tar.addfile(info, f)
    return os.path.getsize(ruta_tar)


def empaquetar(seleccion: List[str], olas_dir: str, directorio_salida: str) -> str:
    """Crea ``<directorio_salida>/espejo-mac.tar.gz`` con la selección (≤ TOPE_BYTES).

    Si el primer intento supera el tope, se reconstruye con los logs recortados a la
    mitad; si aún no cabe, falla en claro en vez de mandar un paquete que el A1 rechace.
    """
    os.makedirs(directorio_salida, exist_ok=True)
    ruta = os.path.join(directorio_salida, "espejo-mac.tar.gz")
    peso = _empaquetar_en(seleccion, olas_dir, ruta, LOG_LINEAS)
    if peso > TOPE_BYTES:
        peso = _empaquetar_en(seleccion, olas_dir, ruta, max(20, LOG_LINEAS // 2))
    if peso > TOPE_BYTES:
        raise ValueError("el espejo pesa %d bytes y el tope es %d" % (peso, TOPE_BYTES))
    return ruta
