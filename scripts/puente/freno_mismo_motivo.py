# -*- coding: utf-8 -*-
"""Freno por mismo motivo (HAL08).

Detecta cuando varias tareas recientes acaban en el mismo fallo o motivo
y detiene la asignación de nuevos escritores para evitar bucles infinitos.
"""
from __future__ import annotations

import re
from typing import Optional


ESTADOS_HECHOS = ("commit", "hecho", "integrada", "ok", "sustituida", "descartada", "informe")
MOTIVOS_FALLOS = ("sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "rechazada")
_NOTA_LA_NUBE = re.compile(r"la nube dijo «([^»]+)»")


def motivo_de(nota: Optional[str]) -> str:
    """Normaliza una nota para extraer el motivo del fallo.

    - Minúsculas
    - Sin números ni IDs de tarea
    - Sin rutas
    - Recorta a 80 caracteres
    - Extrae de «la nube dijo «x»» la parte «x»
    - Normaliza espacios y guiones bajos
    """
    if not nota:
        return ""
    n = str(nota).strip().lower()
    m = _NOTA_LA_NUBE.search(n)
    if m:
        n = m.group(1)
    n = re.sub(r"\d+", "", n)
    n = re.sub(r"/[^/\s]*/", "", n)
    n = re.sub(r"/\S+", "", n)
    n = n.replace(" ", "_")
    n = re.sub(r"_+", "_", n)
    n = n[:80].strip()
    if n.endswith(":"):
        n = n[:-1]
    return n


def _es_estado_hecho(estado: Optional[str]) -> bool:
    """¿El estado indica que la tarea se cerró con éxito?"""
    return estado is not None and str(estado).lower().strip() in ESTADOS_HECHOS


def _es_motivo_falla(nota: Optional[str]) -> bool:
    """¿La nota indica un motivo de falla válido?"""
    motivo = motivo_de(nota)
    return bool(motivo and motivo in MOTIVOS_FALLOS)


def frenar_por_mismo_motivo(
    entradas: list[dict] | None,
    ventana: int = 10,
    minimo: int = 5,
    umbral: float = 0.6,
) -> tuple[bool, str]:
    """Evalúa si se debe frenar por mismo motivo.

    Toma las `ventana` entradas terminadas MÁS RECIENTES (cada una con
    `estado` y `nota`; ordena por `fin` si lo trae, si no por el orden recibido).

    Ignora las que acabaron bien (estado en hecho/integrada/ok).
    Si hay al menos `minimo` terminadas y la fracción que acabó en
    `sin_cambios`, `fallo`, `fallo_tsc`, `fallo_tests` o `rechazada`
    por el MISMO motivo normalizado es ≥ `umbral`, devuelve
    (True, frase) con la frase en español que DICE EL MOTIVO y los números:
    «se frena: 7 de las últimas 10 tareas acabaron «sin_cambios» por «<motivo>»;
    añadir escritores no lo arregla».

    Si no, (False, "").
    """
    if not entradas:
        return False, ""

    terminadas = []
    for entrada in entradas:
        if not isinstance(entrada, dict):
            continue
        estado = entrada.get("estado")
        if _es_estado_hecho(estado):
            continue
        if not entrada.get("fin"):
            continue
        terminadas.append(entrada)

    if len(terminadas) < minimo:
        return False, ""

    terminadas.sort(key=lambda e: e.get("fin", 0), reverse=True)
    recientes = terminadas[:ventana]

    motivos: dict[str, int] = {}
    for entrada in recientes:
        nota = entrada.get("nota")
        if _es_motivo_falla(nota):
            motivo = motivo_de(nota)
            motivos[motivo] = motivos.get(motivo, 0) + 1

    if not motivos:
        return False, ""

    total = len(recientes)
    for motivo, cuenta in sorted(motivos.items(), key=lambda x: -x[1]):
        fraccion = cuenta / total
        if fraccion >= umbral:
            texto = (
                f"se frena: {cuenta} de las últimas {total} tareas acabaron «{motivo}» "
                f"por «{motivo}»; añadir escritores no lo arregla"
            )
            return True, texto

    return False, ""


if __name__ == "__main__":
    import unittest

    unittest.main()