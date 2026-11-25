#!/usr/bin/env python3
"""Revisor de almacenamiento: propone limpiezas, nunca las ejecuta."""

from __future__ import annotations

import hashlib
import os
from typing import Callable, Dict, List, Tuple, Union

CACHES_EXACTOS: Tuple[str, ...] = ("go-build", "electron", "electron-builder")
Candidato = Dict[str, object]
ExisteFn = Callable[[str], bool]
TamanoFn = Callable[[str], int]
MtimeFn = Callable[[str], float]
ListarFn = Callable[[str], List[str]]


def _id_estable(ruta: str) -> str:
    return hashlib.sha1(ruta.encode("utf-8")).hexdigest()[:12]


def _ficha(ruta: str, gb: float, porque: str, regenerable: bool, otra_copia: Union[bool, str], accion: str) -> Candidato:
    return {
        "id": _id_estable(ruta),
        "ruta": ruta,
        "gb": round(gb, 2),
        "porque": porque,
        "regenerable": regenerable,
        "otra_copia": otra_copia,
        "accion": accion,
    }


def proponer_candidatos(
    home: str,
    raiz_repo: str,
    raiz_memoria: str,
    ahora: float,
    existe_fn: ExisteFn,
    tamano_fn: TamanoFn,
    mtime_fn: MtimeFn,
    listar_fn: ListarFn,
) -> List[Candidato]:
    candidatos: List[Candidato] = []

    def agregar(
        ruta: str,
        porque: str,
        accion: str = "borrar",
        regenerable: bool = True,
        otra_copia: Union[bool, str] = False,
        antiguedad_horas: float = 0,
    ) -> None:
        if not existe_fn(ruta):
            return
        if antiguedad_horas:
            try:
                if ahora - mtime_fn(ruta) <= antiguedad_horas * 3600:
                    return
            except OSError:
                return
        try:
            bytes_totales = tamano_fn(ruta)
        except (OSError, TypeError, ValueError):
            return
        if bytes_totales <= 0:
            return
        gb = bytes_totales / (1024 ** 3)
        candidatos.append(_ficha(ruta, gb, porque, regenerable, otra_copia, accion))

    caches = os.path.join(home, "Library", "Caches")
    nombres = set(CACHES_EXACTOS)
    try:
        for nombre in listar_fn(caches):
            if nombre.endswith("-updater") and os.path.basename(nombre) == nombre:
                nombres.add(nombre)
    except OSError:
        pass

    for nombre in sorted(nombres):
        agregar(
            os.path.join(caches, nombre),
            "Caché regenerable de herramientas",
        )

    for ruta, porque in (
        (os.path.join(raiz_repo, "native", "src-tauri", "target"), "Compilación nativa regenerable"),
        (os.path.join(raiz_repo, ".next-anterior"), "Compilación anterior regenerable"),
    ):
        agregar(ruta, porque)
    agregar(
        os.path.join(raiz_memoria, ".tmp.driveupload"), "Carga temporal de Drive de más de 24 h",
        antiguedad_horas=24,
    )
    agregar(
        os.path.join(raiz_memoria, "olas", "logs"),
        "Registros de olas de más de 7 días",
        accion="trasladar:maggabox",
        regenerable=False, otra_copia="maggabox",
        antiguedad_horas=7 * 24,
    )
    return candidatos


def ruta_permitida(ruta: str, home: str, raiz_repo: str, raiz_memoria: str) -> bool:
    caches = os.path.join(home, "Library", "Caches")
    exactas = {os.path.join(caches, nombre) for nombre in CACHES_EXACTOS}
    exactas.update((
        os.path.join(raiz_repo, "native", "src-tauri", "target"),
        os.path.join(raiz_repo, ".next-anterior"),
        os.path.join(raiz_memoria, ".tmp.driveupload"),
        os.path.join(raiz_memoria, "olas", "logs"),
    ))
    if ruta in exactas:
        return True
    padre, nombre = os.path.split(ruta)
    return padre == caches and nombre.endswith("-updater") and os.path.basename(nombre) == nombre
