#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aprendizaje progresivo de la síntesis (SIN1116E).

Tras cada entrega, escribe en memory/sintesis-aprendizajes.md y actualiza
las notas de enfoque por agente en starseed_memory_root/sintesis/notas-agentes.json.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any


RUTA_APRENDIZAJES = "memory/sintesis-aprendizajes.md"
RUTA_NOTAS_AGENTES = "starseed_memory_root/sintesis/notas-agentes.json"


def _leer_notas_agentes() -> dict[str, Any]:
    """Lee las notas de enfoque de los agentes."""
    path = Path(RUTA_NOTAS_AGENTES)
    if not path.exists():
        return {}

    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _escribir_notas_agentes(notas: dict[str, Any]) -> None:
    """Escribe las notas de enfoque de los agentes."""
    path = Path(RUTA_NOTAS_AGENTES)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(notas, f, ensure_ascii=False, indent=2)


def _leer_aprendizajes() -> str:
    """Lee el archivo de aprendizajes actual."""
    path = Path(RUTA_APRENDIZAJES)
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _escribir_aprendizajes(contenido: str) -> None:
    """Escribe el archivo de aprendizajes (añade al final)."""
    path = Path(RUTA_APRENDIZAJES)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(contenido)


def _formatear_entrada_aprendizaje(
    fecha: str,
    aceptadas: list[dict[str, Any]],
    descartadas: list[dict[str, Any]],
    stats: dict[str, int],
) -> str:
    """Formatea una entrada de aprendizaje para el archivo markdown."""
    lineas = []
    lineas.append(f"\n## {fecha}\n")
    lineas.append(f"- **Total propuestas**: {stats.get('total', 0)}")
    lineas.append(f"- **Aceptadas**: {stats.get('aceptadas', 0)}")
    lineas.append(f"- **Descartadas**: {stats.get('descartadas', 0)}")
    lineas.append(f"- **Ampliaciones**: {stats.get('ampliaciones', 0)}")

    if aceptadas:
        lineas.append("\n### ✅ Aceptadas")
        for a in aceptadas:
            motivo = a.get("filtro_novedad", {}).get("motivo", "")
            lineas.append(f"- {a.get('id', '?')}: {a.get('texto', '')[:80]}… ({motivo})")

    if descartadas:
        lineas.append("\n### ❌ Descartadas / Ampliaciones")
        for d in descartadas:
            estado = d.get("filtro_novedad", {}).get("estado", "")
            motivo = d.get("filtro_novedad", {}).get("motivo", "")
            lineas.append(f"- {d.get('id', '?')}: {d.get('texto', '')[:80]}… [{estado}] {motivo}")

    lineas.append("\n---\n")
    return "\n".join(lineas)


def _actualizar_nota_agente(
    agente: str,
    propuestas_aceptadas: list[str],
    propuestas_descartadas: list[str],
    puntuaciones: list[int],
) -> None:
    """Actualiza la nota de enfoque de un agente."""
    notas = _leer_notas_agentes()

    if agente not in notas:
        notas[agente] = {
            "temas_fuertes": [],
            "temas_debiles": [],
            "ultima_actualizacion": "",
            "total_propuestas": 0,
            "aceptadas": 0,
        }

    nota = notas[agente]
    nota["ultima_actualizacion"] = datetime.now().isoformat()
    nota["total_propuestas"] += len(propuestas_aceptadas) + len(propuestas_descartadas)
    nota["aceptadas"] += len(propuestas_aceptadas)

    # Temas fuertes: piezas base de propuestas aceptadas
    for pid in propuestas_aceptadas:
        # Extraer pieza_base del ID o usar heurística
        if pid not in nota["temas_fuertes"]:
            nota["temas_fuertes"].append(pid)

    # Temas débiles: piezas base de propuestas descartadas repetidamente
    for pid in propuestas_descartadas:
        if pid not in nota["temas_debiles"]:
            nota["temas_debiles"].append(pid)

    # Mantener solo los últimos 20
    nota["temas_fuertes"] = nota["temas_fuertes"][-20:]
    nota["temas_debiles"] = nota["temas_debiles"][-20:]

    _escribir_notas_agentes(notas)


def registrar_entrega(
    aceptadas: list[dict[str, Any]],
    descartadas: list[dict[str, Any]],
    agentes_info: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Registra el aprendizaje tras una entrega de síntesis.

    Args:
        aceptadas: Lista de propuestas aceptadas (con filtro_novedad)
        descartadas: Lista de propuestas descartadas/ampliación (con filtro_novedad)
        agentes_info: Dict opcional con info por agente {agente: {propuestas: [...], ...}}

    Returns:
        Dict con estadísticas de la entrega
    """
    fecha = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Estadísticas
    stats = {
        "total": len(aceptadas) + len(descartadas),
        "aceptadas": len(aceptadas),
        "descartadas": sum(1 for d in descartadas if d.get("filtro_novedad", {}).get("estado") == "descartada"),
        "ampliaciones": sum(1 for d in descartadas if d.get("filtro_novedad", {}).get("estado") == "ampliacion"),
    }

    # Escribir en memory/sintesis-aprendizajes.md
    entrada = _formatear_entrada_aprendizaje(fecha, aceptadas, descartadas, stats)
    _escribir_aprendizajes(entrada)

    # Actualizar notas por agente
    if agentes_info:
        for agente, info in agentes_info.items():
            prop_aceptadas = [p.get("pieza_base", p.get("id", "")) for p in info.get("propuestas_aceptadas", [])]
            prop_descartadas = [p.get("pieza_base", p.get("id", "")) for p in info.get("propuestas_descartadas", [])]
            puntuaciones = [p.get("filtro_novedad", {}).get("similitud_max", 0) * 10 for p in info.get("propuestas_todas", [])]
            _actualizar_nota_agente(agente, prop_aceptadas, prop_descartadas, puntuaciones)

    return {
        "fecha": fecha,
        "stats": stats,
        "entrada_escrita": True,
        "notas_actualizadas": list(agentes_info.keys()) if agentes_info else [],
    }


def obtener_notas_agente(agente: str) -> dict[str, Any]:
    """Obtiene las notas de enfoque de un agente específico."""
    notas = _leer_notas_agentes()
    return notas.get(agente, {})


def obtener_todas_las_notas() -> dict[str, Any]:
    """Obtiene todas las notas de todos los agentes."""
    return _leer_notas_agentes()


def obtener_aprendizajes_recientes(lineas: int = 50) -> str:
    """Obtiene las últimas líneas del archivo de aprendizajes."""
    contenido = _leer_aprendizajes()
    if not contenido:
        return ""
    lineas_contenido = contenido.splitlines()
    return "\n".join(lineas_contenido[-lineas:])


def generar_contexto_para_agente(agente: str) -> str:
    """Genera un contexto resumido para inyectar en el paquete del agente al día siguiente."""
    notas = obtener_notas_agente(agente)
    if not notas:
        return ""

    partes = []
    if notas.get("temas_fuertes"):
        partes.append(f"Temas donde {agente} acierta: {', '.join(notas['temas_fuertes'][-5:])}")
    if notas.get("temas_debiles"):
        partes.append(f"Temas a evitar/mejorar para {agente}: {', '.join(notas['temas_debiles'][-5:])}")
    if notas.get("aceptadas", 0) > 0:
        ratio = notas["aceptadas"] / max(notas["total_propuestas"], 1)
        partes.append(f"Ratio de acierto: {ratio:.0%} ({notas['aceptadas']}/{notas['total_propuestas']})")

    return "\n".join(partes)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "demo":
        # Demo
        aceptadas = [
            {"id": "rec-1", "texto": "Integrar NotebookLM", "pieza_base": "sintesis", "filtro_novedad": {"motivo": "Novedad suficiente", "estado": "aceptada"}},
            {"id": "rec-2", "texto": "Mejorar filtro novedad", "pieza_base": "filtro", "filtro_novedad": {"motivo": "Novedad suficiente", "estado": "aceptada"}},
        ]
        descartadas = [
            {"id": "rec-3", "texto": "Integrar NotebookLM (duplicado)", "pieza_base": "sintesis", "filtro_novedad": {"motivo": "Ya existe", "estado": "descartada"}},
        ]
        agentes_info = {
            "investigador-ia": {
                "propuestas_aceptadas": aceptadas,
                "propuestas_descartadas": descartadas,
                "propuestas_todas": aceptadas + descartadas,
            }
        }

        resultado = registrar_entrega(aceptadas, descartadas, agentes_info)
        print("Resultado:", json.dumps(resultado, ensure_ascii=False, indent=2))

        print("\nNotas agente:", json.dumps(obtener_notas_agente("investigador-ia"), ensure_ascii=False, indent=2))
        print("\nContexto para agente:", generar_contexto_para_agente("investigador-ia"))