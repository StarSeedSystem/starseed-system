# -*- coding: utf-8 -*-
"""Identidad de tarea verificable contra commits de integración.

Reconoce únicamente el asunto real del orquestador:
    «Ola 305 · zW8: título»
    «Ola 305 · descripción incluso con dos puntos: detalle · zW8: título»
No acepta menciones libres en commits de reparación ni en el cuerpo del mensaje.
"""

import re

_RE_OLA = re.compile(r"^Ola\s+(\d+)\s*$")
_RE_ID = re.compile(r"^[A-Za-z]+\d+[A-Za-z0-9]*$")
_RE_SEG_ID = re.compile(r"^([A-Za-z]+\d+[A-Za-z0-9]*)\s*:\s*(\S.*)$")


def _ola_numero(texto) -> int | None:
    """Número de ola desde «Ola 305 · texto» o «Ola 305»; None si no es válido."""
    if texto is None:
        return None
    cabeza = str(texto).split("·", 1)[0].strip()
    m = _RE_OLA.match(cabeza)
    return int(m.group(1)) if m else None


def identidad_tarea(tarea: dict) -> tuple[str, str] | None:
    """(ola «305», id «zW8») desde tarea['ola'] y tarea['id']; None si falta o es inválido."""
    if not isinstance(tarea, dict):
        return None
    ola = _ola_numero(tarea.get("ola"))
    tid = tarea.get("id")
    if ola is None or not isinstance(tid, str):
        return None
    tid = tid.strip()
    if not _RE_ID.match(tid):
        return None
    return str(ola), tid


def identidad_commit(asunto: str) -> tuple[str, str] | None:
    """(ola, id) si el asunto es de integración; None en menciones libres.

    El primer segmento «Ola N» y el primer segmento «id: título» identifican
    la integración; una referencia a otra tarea dentro del título no la cambia.
    """
    if not isinstance(asunto, str):
        return None
    partes = [p.strip() for p in asunto.split("·")]
    if len(partes) < 2:
        return None
    m_ola = _RE_OLA.match(partes[0])
    if not m_ola:
        return None
    m_id = next((m for parte in partes[1:] if (m := _RE_SEG_ID.match(parte))), None)
    if not m_id:
        return None
    return m_ola.group(1), m_id.group(1)


def esta_integrada(tarea: dict, asuntos) -> bool:
    """True solo si algún asunto integra ESA ola y ESE id (id V2 de Ola 249 no cierra V2 de Ola 275)."""
    identidad = identidad_tarea(tarea)
    if identidad is None:
        return False
    ola, tid = identidad
    for asunto in asuntos or []:
        c = identidad_commit(asunto)
        if c is not None and c[0] == ola and c[1] == tid:
            return True
    return False
