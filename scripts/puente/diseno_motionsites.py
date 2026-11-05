#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo puro para la rúbrica de MotionSites (Ola 1104R §5).

Solo lectura del JSON; nada de red. Usado como segunda lista de comprobación
en el brief y la verificación, después de la identidad Trinity.
"""
from __future__ import annotations

import json
import os
from typing import Dict, List

RUTA_RUBRICA = "config/referencias-diseno/motionsites.json"


def cargar_rubrica(raiz: str) -> List[Dict[str, str]]:
    """Devuelve la rúbrica como lista de dicts con 'id' y 'pregunta'.

    Si el JSON no existe o está mal, devuelve lista vacía.
    """
    ruta = os.path.join(raiz, RUTA_RUBRICA)
    try:
        with open(ruta, "r", encoding="utf-8") as fh:
            datos = json.load(fh)
        rubrica = datos.get("rubrica") if isinstance(datos, dict) else None
        if isinstance(rubrica, list):
            return [
                {"id": str(r.get("id", "")), "pregunta": str(r.get("pregunta", ""))}
                for r in rubrica
            ]
    except Exception:
        pass
    return []


def preguntas_rubrica(raiz: str) -> List[str]:
    """Devuelve las preguntas de la rúbrica en orden.

    Si no hay rúbrica, devuelve preguntas por defecto del contrato.
    """
    rubrica = cargar_rubrica(raiz)
    if rubrica:
        return [r.get("pregunta", "") for r in rubrica if r.get("pregunta")]
    return [
        "¿Se entiende en tres segundos qué es la página y dónde mirar primero?",
        "¿Hay un detalle memorable —medio, interacción o tipografía— que alguien querría capturar?",
        "¿El titular tiene tamaño y tensión propios y el cuerpo se lee con calma, con dos familias como máximo?",
        "¿El espacio negativo es deliberado y la mirada recorre héroe, mensaje y llamada sin estorbos?",
        "¿La paleta es corta, con un solo acento, y el texto sobre medios queda protegido?",
        "¿La imagen, el vídeo o el 3D están recortados y compuestos a propósito y no sueltos como un rectángulo?",
        "¿La entrada está coreografiada, las interacciones se sienten físicas y se respeta el movimiento reducido?",
        "¿En móvil se reescala la tipografía, se recorta el medio, se mantienen dianas de 44 px y sobrevive la firma?",
        "¿La copia es concreta, breve y creíble, con un titular con opinión y una llamada con verbo?",
        "¿Hay estados de hover y foco, radios y bordes coherentes, título y favicon, sin scroll sobrante ni saltos de carga?",
    ]


def texto_rubrica(raiz: str) -> str:
    """Devuelve la rúbrica formateada como texto para el brief.

    Solo lectura del JSON; nada de red.
    """
    preguntas = preguntas_rubrica(raiz)
    if not preguntas:
        return "Sin rúbrica de MotionSheets disponible."
    lineas = ["Revisa esta rúbrica antes de integrar (MotionSites, © MotionSites):"]
    for i, p in enumerate(preguntas, 1):
        lineas.append(f"  {i}. {p}")
    return "\n".join(lineas)