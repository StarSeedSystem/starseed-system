#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigías de la Biblioteca (AV1011G) · QUÉ se vigila, como datos (sin lógica ni red).

Contrato: architecture/astraura-avatares-3d.md §1 (qué hay de verdad en cada herramienta), §8 (preparación
de UniMate) y §9 fase G. El vigía (`vigias_3d.py`) compara lo que encuentra en la red con `LINEA_BASE`.

LINEA_BASE es lo que el PROYECTO daba por sabido (contrato §1 y `motores.ts`, verificado el 2026-10-11),
NO lo que hay hoy en el mundo. Por eso la primera pasada de UniMate da una novedad REAL y se avisa una sola
vez (el código de inferencia se publicó el 2026-09-06 y los pesos declaran CC BY-NC 4.0, y el proyecto aún
no lo sabía); después el estado guardado (`~/.starseed/vigia-3d.json`) impide repetir el aviso.
"""
from __future__ import annotations

from dataclasses import dataclass

FECHA_BASE = "2026-10-11"


@dataclass(frozen=True)
class Vigia:
    id: str
    nombre: str
    etapa: str  # etapa del taller (contrato §4): generar, detallar o animar
    arxiv: str
    repo: str | None  # «dueño/nombre» en GitHub si ya se conoce; si no, se busca en el artículo
    rama: str | None
    modelos_hf: tuple[str, ...]  # modelos OFICIALES en Hugging Face (de ahí sale la licencia de los pesos)
    sondas: tuple[str, ...]  # rutas del repo cuya existencia prueba que hay código de inferencia
    adaptador: str  # dónde iría el adaptador local (patrón de servicios/taller-3d/motores/pixelartistry.py)
    integracion: str  # lo ya sabido para integrarlo: va tal cual al encargo


VIGIAS: tuple[Vigia, ...] = (
    Vigia(
        "unimate", "UniMate", "animar", "2609.05415", "Friedrich-M/UniMate", "main", ("Linzhan/UniMate",),
        ("unimate/inference/sample.py",), "servicios/taller-3d/motores/unimate.py",
        "Es el motor del nivel «vivo» del movimiento para esqueletos LIBRES (criaturas y bots no humanos); "
        "Kimodo sigue moviendo SOMA y SMPL-X. Preparación conocida (contrato §8): articulaciones en orden de "
        "anchura, escala por el diámetro de la topología, marco canónico y-arriba con la raíz en el origen "
        "mirando a +z, rotaciones relativas a la pose de reposo. Su README trae `python -m unimate.inference.sample "
        "--exp_dir <carpeta del punto de control> [--asset <activo con esqueleto>]` y `rig_preprocess` (convierte un "
        "GLB/glTF/FBX con esqueleto en un activo animable). Hay derivados de terceros (conversión MLX para Apple "
        "Silicon, versión WebGPU): léelos como pista, no como dependencia.",
    ),
    Vigia(
        "filigree3d", "Filigree3D", "generar", "2609.34900", None, None, (), (),
        "servicios/taller-3d/motores/filigree3d.py",
        "Imagen a geometría de hasta 2048^3 (extensible a 4096^3), ~1 minuto según el artículo, con la memoria de "
        "GPU «dentro de límites prácticos» sin cifra publicada: mídela en su README o dila «sin comprobar». "
        "Sería el nivel de máxima fidelidad del taller en neuronas NVIDIA.",
    ),
    Vigia(
        "btc3d", "BTC3D", "detallar", "2609.39709", None, None, (), (),
        "servicios/taller-3d/motores/btc3d.py",
        "Mejora de detalle SIN entrenar para generadores imagen a 3D por difusión (teselas mezcladas, solo en "
        "inferencia). Necesita un generador base compatible: es una etapa opcional «detallar» que se engancha a ese "
        "generador, no un servicio aparte.",
    ),
)

_SIN_NADA = {"repo": None, "codigo_publicado": False, "modelos_hf": [], "licencia_codigo": None, "licencia_pesos": None}

#: Lo que el proyecto sabía el 2026-10-11 (contrato §1): UniMate con pesos en Hugging Face, sin licencia declarada
#: y con la inferencia «anunciada pero no publicada»; Filigree3D y BTC3D, solo el artículo.
LINEA_BASE: dict[str, dict] = {
    "unimate": {**_SIN_NADA, "repo": "Friedrich-M/UniMate", "modelos_hf": ["Linzhan/UniMate"], "licencia_codigo": "MIT"},
    "filigree3d": dict(_SIN_NADA),
    "btc3d": dict(_SIN_NADA),
}
