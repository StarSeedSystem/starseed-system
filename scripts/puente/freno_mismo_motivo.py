# -*- coding: utf-8 -*-
"""Freno por mismo motivo (puro): detecta si las últimas tareas fallaron por la misma causa."""
from __future__ import annotations

import re
from typing import Any


ESTADOS_FALLO = ("sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "rechazada")
ESTADOS_BUENOS = ("hecho", "integrada", "ok")

# Patrones para extraer motivo de "la nube dijo «x»" o "la nube dijo 'x'"
_PATTERN_NUBE_QUIETE = re.compile(
    r"la nube dijo [«\"']([a-z_áéíóúüñ]+)[«\"']", re.IGNORECASE
)
_PATTERN_NUBE_QUOTES = re.compile(
    r"la nube dijo [\"']([a-z_áéíóúüñ]+)[\"']", re.IGNORECASE
)
# Patrón para texto después de la nube dijo (ej. "por timeout")
_PATTERN_DESPUES_NUBE = re.compile(r"por\s+([a-z_áéíóúüñ]+)", re.IGNORECASE)


def motivo_de(nota: str | None) -> str:
    """Normaliza una nota a su motivo base.

    - Minúsculas
    - Extrae la nube dijo «x» o 'x' → devuelve solo x
    - Si hay texto después (ej. "por timeout"), se añade
    - Elimina números sueltos
    - Elimina IDs de tarea (patrones alfanuméricos cortos)
    - Elimina rutas de archivo
    - Recorta a 80 caracteres
    """
    if not nota:
        return ""
    s = str(nota).strip().lower()

    # Intenta extraer "la nube dijo «x»" o 'la nube dijo "x"'
    m = _PATTERN_NUBE_QUIETE.search(s) or _PATTERN_NUBE_QUOTES.search(s)
    if m:
        motivo = m.group(1)
        # Busca texto después como "por timeout"
        m2 = _PATTERN_DESPUES_NUBE.search(s[m.end():])
        if m2:
            motivo += " " + m2.group(1)
        return motivo

    # Si no hay patrón de la nube, normaliza paso a paso
    # Elimina números enteros sueltos
    s = re.sub(r"\d+", "", s)
    # Elimina IDs tipo TG1, zN4-123 (palabra de 1-8 letras opcionalmente seguida de 0-6 dígitos)
    s = re.sub(r"\b[a-z]{1,8}\d{0,6}\b", "", s)
    # Elimina rutas (contiene / o \ con contenido alrededor) - reemplaza por espacio
    s = re.sub(r"\S*[/\\]\S*", " ", s)
    # Elimina caracteres no alfanuméricos salvo acentos y espacios
    s = re.sub(r"[^a-záéíóúüñ\s]", " ", s)
    # Colapsa múltiples espacios yquita al final/principio
    s = re.sub(r"\s+", " ", s).strip()
    return s[:80]


def _es_dict_valido(x: Any) -> bool:
    return isinstance(x, dict) and "estado" in x and "nota" in x


def _fin_de(e: dict) -> float:
    return float(e.get("fin", 0)) if isinstance(e.get("fin"), (int, float)) else 0.0


def frenar_por_mismo_motivo(
    entradas: list[dict | Any],
    ventana: int = 10,
    minimo: int = 5,
    umbral: float = 0.6,
) -> tuple[bool, str]:
    """Evalúa si hay que frenar por repetición del mismo motivo de fallo.

    Args:
        entradas: Lista de dicts con claves `estado`, `nota`, y opcional `fin`.
        ventana: Cuántas entradas terminadas más recientes examinar.
        minimo: Mínimo de entradas terminadas (no buenas) para evaluar.
        umbral: Fracción mínima del mismo motivo entre las terminadas.

    Returns:
        (True, frase) si se frena, (False, "") si no.
    """
    # Filtra entradas válidas
    validas = [e for e in entradas if _es_dict_valido(e)]

    if not validas:
        return False, ""

    # Ordena por `fin` descendente (más reciente primero), fallback al orden recibido
    validas.sort(key=_fin_de, reverse=True)

    # Toma la ventana
    ventana_entradas = validas[:ventana]

    # Separa terminadas (no en estados buenos) de las buenas
    terminadas = []
    for e in ventana_entradas:
        est = str(e.get("estado", "")).strip().lower()
        if est in ESTADOS_BUENOS:
            continue
        terminadas.append(e)

    if len(terminadas) < minimo:
        return False, ""

    # Cuenta motivos normalizados entre las terminadas en estados de fallo
    motivos: dict[str, int] = {}
    total_fallos = 0
    for e in terminadas:
        est = str(e.get("estado", "")).strip().lower()
        if est not in ESTADOS_FALLO:
            continue
        total_fallos += 1
        m = motivo_de(e.get("nota", ""))
        if m:
            motivos[m] = motivos.get(m, 0) + 1

    if total_fallos == 0:
        return False, ""

    # Busca el motivo más frecuente
    motivo_top, cuenta_top = max(motivos.items(), key=lambda kv: kv[1])
    fraccion = cuenta_top / total_fallos

    if fraccion >= umbral:
        frase = (
            f"se frena: {cuenta_top} de las últimas {len(ventana_entradas)} tareas "
            f"acabaron «{motivo_top}» por «{motivo_top}»; añadir escritores no lo arregla"
        )
        return True, frase

    return False, ""