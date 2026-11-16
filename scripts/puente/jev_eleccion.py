# -*- coding: utf-8 -*-
"""Regla pura para decidir el medio final cuando Jev elige entre medios.

El reparto determinista ya decidió a qué medio va una tarea y después consulta a
Jev. Este módulo aplica la elección de Jev solo cuando una persona la ha
encendido y el medio elegido está sano, libre y en la cola actual; si no,
mantiene el medio del plan y explica por qué."""

from __future__ import annotations

NOMBRE_ACTIVO = "STARSEED_JEV_ELIGE_MEDIO"
VALORES_ACTIVOS = frozenset({"1", "true", "si", "sí"})


def activo_por_entorno(entorno: dict) -> bool:
    """Indica si está encendido que Jev elija el medio (apagado por defecto)."""
    valor = (entorno or {}).get(NOMBRE_ACTIVO)
    if valor is None:
        return False
    return str(valor).strip() in VALORES_ACTIVOS


def medio_final(
    plan_medio: str,
    eleccion_jev: str,
    sanos_libres: list[str],
    cola_de: dict[str, str],
    cola_actual: str,
    activo: bool,
) -> tuple[str, str]:
    """Devuelve el medio final y el motivo legible de la decisión.

    El plan manda si el interruptor está apagado, si Jev no	opino o si eligió
    el mismo medio del plan. La elección de Jev solo se aplica cuando el medio
    está sano y libre y pertenece a la cola actual; si no, se queda con el plan
    y explica por qué no se usó.
    """
    plan = str(plan_medio or "").strip()
    eleccion = str(eleccion_jev or "").strip()
    if not activo or not eleccion or eleccion == plan:
        return plan, "plan"

    libres = {str(medio).strip() for medio in (sanos_libres or [])}
    if eleccion not in libres:
        return plan, f"Jev eligió {eleccion} pero no está libre/sano"

    cola_elegida = str((cola_de or {}).get(eleccion, "")).strip()
    if cola_elegida != str(cola_actual or "").strip():
        return plan, f"Jev eligió {eleccion} pero no está en esta cola"

    return eleccion, "Jev"
