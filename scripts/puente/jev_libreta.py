#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Libreta de ejemplos con desenlace para Jev/Laya.

Módulo puro: no toca disco ni red directamente. Los lectores se inyectan
(funciones que devuelven listas de dicts) y tienen implementaciones por
defecto basadas en jev_captura y jev_desenlaces.

Reglas clave:
- DOMINIOS_PRIVADOS: telegram, chat, inbox, buzon -> siempre excluidos
- ESTRATOS_OBJETIVO: desde jev_captura.py
- Deduplicación por huella (sha256 short de campos clave)
- Etiquetado con jev_desenlaces.etiqueta_de
- Solo 'verdad' sale en JSONL de afinado
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Set


# ── dominios privados que nunca deben salir ──────────────────────────────────

DOMINIOS_PRIVADOS = (
    "telegram",
    "chat",
    "inbox",
    "buzon",
)


# ── huella para deduplicación ───────────────────────────────────────────────

def _footprint(fila: Dict[str, Any]) -> str:
    """Huella corta (sha256 truncada) para deduplicar filas por contenido."""
    partes = [
        str(fila.get("id", "")),
        str(fila.get("quien", "")),
        str(fila.get("dominio", "")),
        str(fila.get("estado", "")),
    ]
    clave = "|".join(p for p in partes if p)
    return hashlib.sha256(clave.encode("utf-8", "replace")).hexdigest()[:16]


# ── lectores inyectables (implementaciones por defecto) ─────────────────────

def leer_captura(d: Any = None) -> List[Dict[str, Any]]:
    """Lector de captures: por defecto usa jev_captura.leer.

    Los tests pueden inyectar su propia función o añadir
    scripts/puente a sys.path antes de importar.

    Args:
        d: directorio alternativo (solo pruebas).

    Returns:
        Lista de dicts de captura.
    """
    import jev_captura as _jc
    resultado: List[Dict[str, Any]] = []
    try:
        for _dia, entrada in _jc.leer(d):
            if isinstance(entrada, dict):
                resultado.append(entrada)
    except Exception:
        pass
    return resultado


def leer_experiencias(d: Any = None) -> List[Dict[str, Any]]:
    """Lector de experiencias: por defecto devuelve lista vacía.

    Args:
        d: directorio o parámetro alternativo.

    Returns:
        Lista de dicts de experiencias.
    """
    return []


def leer_desenlaces(filas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Lector de desenlaces: procesa cada fila con jev_desenlaces.desenlace_de.

    Args:
        filas: Lista de dicts de experiencias.

    Returns:
        Lista de dicts {'verdad': True|False|None, 'fuente': str}.
    """
    import jev_desenlaces as _jd
    if not isinstance(filas, list):
        return []
    return [_jd.desenlace_de(f) for f in filas if isinstance(f, dict)]


# ── construir: une captura + experiencia, etiqueta, filtra, deduplica ──────

def construir(
    libreta: List[Dict[str, Any]] | None = None,
    *,
    leer_captura_fn: Any = None,
    leer_experiencias_fn: Any = None,
    leer_desenlaces_fn: Any = None,
) -> List[Dict[str, Any]]:
    """Construye/actualiza la libreta uniendo captura y experiencia.

    Une captura y experiencia por el id enlazado (campo "enlace" en el dict de captura,
    como añade jev_captura.enlazar), pone etiqueta con jev_desenlaces.etiqueta_de,
    EXCLUYE todo dominio privado (Telegram, chats, buzón: lista DOMINIOS_PRIVADOS)
    y deduplica por huella.

    Args:
        libreta: Lista existente a la que unirse/actualizar. Si None, se construye
            desde los lectores.
        leer_captura_fn: Lector inyectable (sobreescribe el por defecto).
        leer_experiencias_fn: Lector inyectable de experiencias.
        leer_desenlaces_fn: Procesador inyectable de desenlaces.

    Returns:
        Nueva lista limpia: sin dominios privados, deduplicada, con etiqueta.
    """
    if leer_captura_fn is None:
        leer_captura_fn = leer_captura
    if leer_experiencias_fn is None:
        leer_experiencias_fn = leer_experiencias
    if leer_desenlaces_fn is None:
        leer_desenlaces_fn = leer_desenlaces

    capturas = leer_captura_fn()
    filas_experiencias = leer_experiencias_fn()
    desenlaces = leer_desenlaces_fn(filas_experiencias) if filas_experiencias else []

    # Importa jev_desenlaces.etiqueta_de aquí
    import jev_desenlaces as _jd_mod

    # Construye mapa de experiencia_id -> resultado de desenlace
    mapa_desenlace: Dict[str, Dict[str, Any]] = {}
    for i, exp in enumerate(filas_experiencias):
        if i < len(desenlaces):
            d = desenlaces[i]
            eid = exp.get("id") or exp.get("experience_id")
            if eid:
                mapa_desenlace[str(eid)] = d

    # Une captura + experiencia por enlace
    resultado: List[Dict[str, Any]] = []
    huellas_vistas: Set[str] = set()

    for captura in capturas:
        dominio = captura.get("dominio") or ""

        # Excluir dominios privados
        if any(privado in str(dominio).lower() for privado in DOMINIOS_PRIVADOS):
            continue

        # Buscar experiencia vinculada por campo "enlace"
        enlace = captura.get("enlace")
        if not enlace:
            # Fallback a otros campos de identificación
            enlace = captura.get("experiencia_id") or captura.get("_enlace")

        experiencia_id = str(enlace) if enlace else None
        experiencia_desenlace = mapa_desenlace.get(experiencia_id) if experiencia_id else None

        # Construir entrada unida
        entrada = dict(captura)
        if experiencia_desenlace:
            entrada["_desenlace"] = experiencia_desenlace
            entrada["etiqueta"] = _jd_mod.etiqueta_de(captura, experiencia_desenlace)
        else:
            entrada["_desenlace"] = {"verdad": None, "fuente": "desconocida"}
            entrada["etiqueta"] = "sin_dato"

        # Deduplicar por huella
        huella = _footprint(entrada)
        if huella in huellas_vistas:
            continue
        huellas_vistas.add(huella)

        resultado.append(entrada)

    return resultado


# ── resumen: contadores por estrato y etiqueta, sin texto ───────────────────

def resumen(libreta: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    """Devuelve contadores por estrato y por etiqueta, sin ningún texto.

    Cuenta por estrato usando ESTRATOS_OBJETIVO de jev_captura.py y por
    la etiqueta ('verdad', 'debil', 'sin_dato') que cada entrada tenga.

    Args:
        libreta: Lista de entradas (salida de `construir`). Si None, usa vacía.

    Returns:
        Dict con contadores:
        - por_estrato: {estrato: count} para cada ESTRATOS_OBJETIVO
        - por_etiqueta: {etiqueta: count}
        - total: total de entradas
    """
    import jev_captura as _jc

    if libreta is None:
        libreta = []

    ESTRATOS = _jc.ESTRATOS_OBJETIVO
    por_estrato: Dict[str, int] = {e: 0 for e in ESTRATOS}
    por_etiqueta: Dict[str, int] = {"verdad": 0, "debil": 0, "sin_dato": 0}
    total = 0

    for entrada in libreta:
        if not isinstance(entrada, dict):
            continue
        total += 1

        # Contar estrato desde el campo 'estratos' o 'dominio'
        estratos_entrada = entrada.get("estratos") or []
        if isinstance(estratos_entrada, str):
            estratos_entrada = [estratos_entrada]
        for estrato in ESTRATOS:
            if estrato in estratos_entrada:
                por_estrato[estrato] += 1
                break

        # Contar etiqueta
        etiqueta = entrada.get("etiqueta") or "sin_dato"
        if etiqueta in por_etiqueta:
            por_etiqueta[etiqueta] += 1
        else:
            por_etiqueta["sin_dato"] += 1

    return {
        "por_estrato": por_estrato,
        "por_etiqueta": por_etiqueta,
        "total": total,
    }


# ── a_jsonl: exporta a JSONL para afinado ───────────────────────────────────

def a_jsonl(libreta: List[Dict[str, Any]] | None = None, *, solo_verdad: bool = True) -> str:
    """Exporta la libreta a formato JSONL para afinado de Laya.

    Solo incluye entradas con etiqueta 'verdad' (cuando solo_verdad=True)
    y excluye cualquier entrada cuyo dominio sea privado.

    Args:
        libreta: Lista de entradas (salida de `construir`). Si None, usa vacía.
        solo_verdad: Si True, solo incluye etiqueta 'verdad'. Si False, incluye
            todas las etiquetas.

    Returns:
        String JSONL con una entrada por línea.
    """
    import json

    if libreta is None:
        libreta = []

    lineas: List[str] = []

    for entrada in libreta:
        if not isinstance(entrada, dict):
            continue

        # Excluir dominios privados
        dominio = entrada.get("dominio") or ""
        if any(privado in str(dominio).lower() for privado in DOMINIOS_PRIVADOS):
            continue

        # Filtrar por etiqueta si solo_verdad
        if solo_verdad:
            etiqueta = entrada.get("etiqueta") or "sin_dato"
            if etiqueta != "verdad":
                continue

        # Construir línea de solo los campos necesarios para afinado
        linea: Dict[str, Any] = {
            "id": entrada.get("id", ""),
            "tipo": entrada.get("tipo", ""),
            "dominio": entrada.get("dominio", ""),
            "etiqueta": entrada.get("etiqueta", "sin_dato"),
        }
        # Agregar verdad si está disponible en el desenlace
        dessin = entrada.get("_desenlace") or {}
        if isinstance(dessin, dict):
            linea["verdad"] = dessin.get("verdad")
            linea["fuente"] = dessin.get("fuente", "")

        lineas.append(json.dumps(linea, ensure_ascii=False))

    return "\n".join(lineas)


# ── main de prueba ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    import sys

    # Add this directory to path for imports
    sys.path.insert(0, __file__.rsplit("/", 1)[0] if "/" in __file__ else ".")

    # Datos de prueba simples
    captura_ejemplo = {
        "id": "cap-001",
        "quien": "test",
        "dominio": "noul",
        "estado": "produccion",
        "estratos": ["noul:produccion"],
        "tipo": "si-no",
    }

    experiencia_ejemplo = {
        "id": "exp-001",
        "tipo": "si-no",
        "resultado_posterior": "integrada",
    }

    # Probar construir
    libreta_prueba = construir([captura_ejemplo], leer_experiencias_fn=lambda: [experiencia_ejemplo])
    print("Construido:", json.dumps(libreta_prueba, ensure_ascii=False, indent=2))

    # Probar resumen
    r = resumen(libreta_prueba)
    print("Resumen:", json.dumps(r, ensure_ascii=False, indent=2))

    # Probar a_jsonl
    j = a_jsonl(libreta_prueba, solo_verdad=True)
    print("JSONL:", j)