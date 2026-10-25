#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Evaluación pura del vigía (sin red)."""
from __future__ import annotations
from typing import Dict, List, Optional
import sys
from pathlib import Path
_RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_RAIZ))
from scripts.puente.vigia_evaluar import (
    clase_licencia, es_seguro, cabe_en, motor_para, puntuar, LICENCIAS_CONOCIDAS
)

LIMITE_FICHAS_DIA = 5


class VigiaError(Exception):
    pass


def descubrir(area: Dict[str, object], datos_inyectados: Optional[List[Dict[str, object]]] = None, cliente_http: Optional[object] = None) -> List[Dict[str, object]]:
    candidatos: List[Dict[str, object]] = []
    if datos_inyectados is not None:
        candidatos = list(datos_inyectados)
    return candidatos


def evaluar(candidato: Dict[str, object], area: Dict[str, object], modelos_aceptados: Optional[List[str]] = None) -> Dict[str, object]:
    resultado: Dict[str, object] = {
        "id": candidato.get("id", ""),
        "tags": candidato.get("tags", []),
        "licencia_hf": candidato.get("licencia", "other"),
        "clase_licencia": clase_licencia(
            candidato.get("licencia", "other"),
            candidato.get("tags", []),
            LICENCIAS_CONOCIDAS,
        ),
        "seguro": es_seguro(candidato, modelos_aceptados),
        "cabe_en": cabe_en(
            candidato,
            {"tipo": candidato.get("medio", "desconocido"), "espacio_gb": candidato.get("tamanio_gb", 0)},
        ),
        "motor": motor_para(candidato.get("archivo", "")),
        "es_mejora": False,
        "puntaje": 0,
        "motivo_puntaje": "",
    }
    resultado["puntaje"], resultado["motivo_puntaje"] = puntuar(candidato)
    return resultado
