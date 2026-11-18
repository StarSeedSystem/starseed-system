#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Libro de recomendaciones para la síntesis (SIN1116E).

Maneja starseed_memory_root/sintesis/recomendaciones.jsonl con id, fecha, área,
texto, pieza base y estado (propuesta, aprobada, rechazada, ya_existe, encargada, integrada).
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


RUTA_RECOMENDACIONES = "starseed_memory_root/sintesis/recomendaciones.jsonl"
_ESTADOS_VALIDOS = (
    "propuesta",
    "aprobada",
    "rechazada",
    "ya_existe",
    "encargada",
    "integrada",
)


def _leer_recomendaciones() -> list[dict[str, Any]]:
    """Lee todas las recomendaciones del archivo JSONL."""
    items = []
    path = Path(RUTA_RECOMENDACIONES)
    if not path.exists():
        return items

    with path.open(encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea:
                continue
            try:
                items.append(json.loads(linea))
            except json.JSONDecodeError:
                pass
    return items


def _escribir_recomendaciones(items: list[dict[str, Any]]) -> None:
    """Escribe todas las recomendaciones al archivo JSONL (sobrescribe)."""
    path = Path(RUTA_RECOMENDACIONES)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


def _generar_id() -> str:
    """Genera un ID único para recomendación."""
    return f"rec-{uuid.uuid4().hex[:8]}"


def _validar_estado(estado: str) -> str:
    """Valida y normaliza el estado."""
    estado = estado.lower().strip()
    if estado in _ESTADOS_VALIDOS:
        return estado
    return "propuesta"


def crear_recomendacion(
    texto: str,
    area: str,
    pieza_base: str,
    id_propuesta: str | None = None,
) -> dict[str, Any]:
    """Crea una nueva recomendación en estado 'propuesta'.

    Args:
        texto: Texto de la recomendación
        area: Área temática (ia, diseno, gobernanza, etc.)
        pieza_base: ID de la pieza en la que se apoya
        id_propuesta: ID opcional (se genera automáticamente si no se da)

    Returns:
        Dict con la recomendación creada
    """
    now = datetime.now().isoformat()
    rec_id = id_propuesta or _generar_id()

    recomendacion = {
        "id": rec_id,
        "fecha": now,
        "area": area.lower().strip(),
        "texto": texto.strip(),
        "pieza_base": pieza_base.strip(),
        "estado": "propuesta",
    }

    items = _leer_recomendaciones()
    items.append(recomendacion)
    _escribir_recomendaciones(items)

    return recomendacion


def obtener_recomendacion(rec_id: str) -> dict[str, Any] | None:
    """Obtiene una recomendación por su ID."""
    items = _leer_recomendaciones()
    for item in items:
        if item.get("id") == rec_id:
            return item
    return None


def actualizar_estado(rec_id: str, nuevo_estado: str) -> dict[str, Any] | None:
    """Actualiza el estado de una recomendación.

    Args:
        rec_id: ID de la recomendación
        nuevo_estado: Nuevo estado (aprobada, rechazada, ya_existe, encargada, integrada)

    Returns:
        La recomendación actualizada o None si no existe
    """
    estado = _validar_estado(nuevo_estado)
    items = _leer_recomendaciones()

    for item in items:
        if item.get("id") == rec_id:
            item["estado"] = estado
            item["fecha_actualizacion"] = datetime.now().isoformat()
            _escribir_recomendaciones(items)
            return item
    return None


def listar_recomendaciones(
    estado: str | None = None,
    area: str | None = None,
    limite: int | None = None,
) -> list[dict[str, Any]]:
    """Lista recomendaciones con filtros opcionales.

    Args:
        estado: Filtrar por estado
        area: Filtrar por área
        limite: Máximo número de resultados (más recientes primero)

    Returns:
        Lista de recomendaciones filtradas
    """
    items = _leer_recomendaciones()

    if estado:
        estado = _validar_estado(estado)
        items = [i for i in items if i.get("estado") == estado]

    if area:
        items = [i for i in items if i.get("area", "").lower() == area.lower()]

    # Ordenar por fecha descendente (más reciente primero)
    items.sort(key=lambda x: x.get("fecha", ""), reverse=True)

    if limite:
        items = items[:limite]

    return items


def actualizar_estados_desde_chat(respuestas: list[dict[str, Any]]) -> int:
    """Actualiza estados basándose en respuestas del chat de la síntesis.

    Args:
        respuestas: Lista de dicts con 'id' (recomendación) y 'accion' (aprobar/rechazar/ya_existe/encargar)

    Returns:
        Número de recomendaciones actualizadas
    """
    items = _leer_recomendaciones()
    actualizadas = 0

    mapa_acciones = {
        "aprobar": "aprobada",
        "aprobada": "aprobada",
        "rechazar": "rechazada",
        "rechazada": "rechazada",
        "ya_existe": "ya_existe",
        "ya existe": "ya_existe",
        "encargar": "encargada",
        "encargada": "encargada",
    }

    for resp in respuestas:
        rec_id = resp.get("id")
        accion = resp.get("accion", "").lower().strip()
        estado_nuevo = mapa_acciones.get(accion)
        if not rec_id or not estado_nuevo:
            continue

        for item in items:
            if item.get("id") == rec_id:
                if item.get("estado") != estado_nuevo:
                    item["estado"] = estado_nuevo
                    item["fecha_actualizacion"] = datetime.now().isoformat()
                    actualizadas += 1
                break

    if actualizadas > 0:
        _escribir_recomendaciones(items)

    return actualizadas


def actualizar_estados_desde_commits(commits: list[dict[str, Any]]) -> int:
    """Actualiza estados basándose en commits/olas que citan IDs de recomendaciones.

    Args:
        commits: Lista de dicts con 'mensaje' (commit message) y opcional 'sha'

    Returns:
        Número de recomendaciones actualizadas
    """
    items = _leer_recomendaciones()
    actualizadas = 0

    # Buscar IDs de recomendaciones en mensajes de commit
    for commit in commits:
        mensaje = commit.get("mensaje", "")
        # Buscar patrones como "rec-abc12345" o "SIN1116E: rec-abc12345"
        import re
        ids_en_mensaje = re.findall(r"rec-[a-f0-9]{8}", mensaje)

        for rec_id in ids_en_mensaje:
            for item in items:
                if item.get("id") == rec_id and item.get("estado") != "integrada":
                    item["estado"] = "integrada"
                    item["fecha_actualizacion"] = datetime.now().isoformat()
                    item["commit_sha"] = commit.get("sha")
                    actualizadas += 1
                    break

    if actualizadas > 0:
        _escribir_recomendaciones(items)

    return actualizadas


def estadisticas() -> dict[str, Any]:
    """Devuelve estadísticas del libro de recomendaciones."""
    items = _leer_recomendaciones()
    stats = {"total": len(items)}
    for estado in _ESTADOS_VALIDOS:
        stats[estado] = sum(1 for i in items if i.get("estado") == estado)
    return stats


if __name__ == "__main__":
    import sys

    # Demo rápido
    if len(sys.argv) > 1 and sys.argv[1] == "demo":
        # Crear algunas recomendaciones de prueba
        rec1 = crear_recomendacion(
            "Integrar NotebookLM con la síntesis diaria",
            "ia",
            "sintesis_autonoma",
            "rec-test001",
        )
        rec2 = crear_recomendacion(
            "Mejorar filtro de novedad con LEANN",
            "ia",
            "filtro_novedad",
            "rec-test002",
        )
        print("Creadas:", json.dumps([rec1, rec2], ensure_ascii=False, indent=2))

        # Actualizar estado
        actualizar_estado("rec-test001", "aprobada")
        print("Actualizada:", json.dumps(obtener_recomendacion("rec-test001"), ensure_ascii=False, indent=2))

        # Listar
        print("Todas:", json.dumps(listar_recomendaciones(), ensure_ascii=False, indent=2))
        print("Stats:", json.dumps(estadisticas(), ensure_ascii=False, indent=2))