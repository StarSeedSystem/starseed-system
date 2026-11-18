#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Filtro de novedad para propuestas de síntesis (SIN1116E).

Compara cada propuesta con el índice de lo integrado y con las propuestas
de los últimos 14 días. Usa LEANN si responde, si no TF-IDF puro en Python.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


def _normalizar_texto(texto: str) -> str:
    """Normaliza texto para comparación: minúsculas, sin puntuación extra."""
    texto = texto.lower()
    texto = re.sub(r"[^\w\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto


# Stop words en español para filtrar
_STOP_WORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "y", "o", "pero", "sino", "ni",
    "con", "sin", "por", "para", "de", "del", "en", "a", "al",
    "se", "te", "me", "le", "lo", "la", "les", "nos", "os",
    "su", "sus", "mi", "mis", "tu", "tus", "nuestro", "nuestra",
    "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
    "aquel", "aquella", "aquellos", "aquellas",
    "que", "quien", "quienes", "cual", "cuales",
    "como", "donde", "cuando", "cuanto", "cuanta",
    "muy", "más", "menos", "bien", "mal",
    "si", "no", "ya", "también", "tampoco",
}


def _tokenizar(texto: str) -> list[str]:
    """Tokeniza texto en palabras significativas, filtrando stop words."""
    return [t for t in _normalizar_texto(texto).split() if len(t) > 2 and t not in _STOP_WORDS]


def _calcular_tfidf(documentos: list[str], consulta: str) -> list[float]:
    """Calcula similitud TF-IDF entre consulta y documentos."""
    if not documentos:
        return []

    from collections import Counter
    import math

    # TF de la consulta
    tokens_consulta = _tokenizar(consulta)
    tf_consulta = Counter(tokens_consulta)
    total_consulta = sum(tf_consulta.values())
    if total_consulta == 0:
        return [0.0] * len(documentos)

    # Tokenizar documentos
    doc_tokens = []
    for doc in documentos:
        tokens = _tokenizar(doc)
        doc_tokens.append(Counter(tokens))

    # Caso especial: coincidencia exacta de tokens
    for i, dt in enumerate(doc_tokens):
        if dt == tf_consulta:
            # Crear resultado con 1.0 en la posición exacta, 0 en otras
            resultados = [0.0] * len(documentos)
            resultados[i] = 1.0
            return resultados

    # IDF global - usar suavizado para evitar IDF=0
    all_tokens = set(tokens_consulta)
    for dt in doc_tokens:
        all_tokens.update(dt.keys())

    idf = {}
    n_docs = len(documentos)
    for token in all_tokens:
        df = sum(1 for dt in doc_tokens if token in dt)
        # Suavizado: añadir 1 al denominador para evitar log(1)=0 cuando df=n_docs
        idf[token] = math.log((n_docs + 1) / (df + 1)) + 1e-6

    # TF-IDF consulta (calcular una vez)
    tfidf_cons = {t: (c / total_consulta) * idf.get(t, 0) for t, c in tf_consulta.items()}
    norm_cons = math.sqrt(sum(v * v for v in tfidf_cons.values()))

    # Similitud coseno
    resultados = []
    for dt in doc_tokens:
        total_doc = sum(dt.values()) or 1
        tfidf_doc = {t: (c / total_doc) * idf.get(t, 0) for t, c in dt.items()}
        norm_doc = math.sqrt(sum(v * v for v in tfidf_doc.values()))

        if norm_cons == 0 or norm_doc == 0:
            resultados.append(0.0)
        else:
            dot = sum(tfidf_cons.get(t, 0) * tfidf_doc.get(t, 0) for t in set(tfidf_cons) | set(tfidf_doc))
            resultados.append(dot / (norm_cons * norm_doc))

    return resultados


def _cargar_indice_integrado(ruta_indice: str) -> list[dict[str, Any]]:
    """Carga el índice de lo integrado (archivo JSONL)."""
    items = []
    path = Path(ruta_indice)
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


def _cargar_propuestas_recientes(ruta_propuestas: str, dias: int = 14) -> list[dict[str, Any]]:
    """Carga propuestas de los últimos N días."""
    items = []
    path = Path(ruta_propuestas)
    if not path.exists():
        return items

    corte = datetime.now() - timedelta(days=dias)
    with path.open(encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea:
                continue
            try:
                item = json.loads(linea)
                fecha_str = item.get("fecha", "")
                try:
                    fecha = datetime.fromisoformat(fecha_str.replace("Z", "+00:00"))
                    if fecha >= corte:
                        items.append(item)
                except ValueError:
                    pass
            except json.JSONDecodeError:
                pass
    return items


def _probar_leann(texto: str, candidatos: list[str]) -> list[float] | None:
    """Intenta usar LEANN para similitud semántica. Devuelve None si no está disponible."""
    try:
        import leann
    except ImportError:
        return None

    # Placeholder para integración real con LEANN
    # Por ahora devolvemos None para usar TF-IDF como fallback
    return None


def filtrar_novedad(
    propuesta: dict[str, Any],
    ruta_indice_integrado: str = "starseed_memory_root/sintesis/indice_integrado.jsonl",
    ruta_propuestas_recientes: str = "starseed_memory_root/sintesis/propuestas.jsonl",
    umbral_similitud: float = 0.75,
    umbral_revisor: int = 6,
) -> dict[str, Any]:
    """Filtra una propuesta por novedad.

    Args:
        propuesta: Dict con claves 'id', 'texto', 'area', 'pieza_base'
        ruta_indice_integrado: Ruta al índice de lo integrado
        ruta_propuestas_recientes: Ruta a propuestas recientes
        umbral_similitud: Umbral de similitud (0-1) para considerar duplicado
        umbral_revisor: Puntuación mínima (1-10) del revisor gratuito

    Returns:
        Dict con 'estado' (aceptada/descartada/ampliacion), 'motivo', 'similitud_max', 'pieza_relacionada'
    """
    texto = propuesta.get("texto", "")
    if not texto:
        return {
            "estado": "descartada",
            "motivo": "Propuesta sin texto",
            "similitud_max": 0.0,
            "pieza_relacionada": None,
        }

    # Cargar corpus de comparación
    integrados = _cargar_indice_integrado(ruta_indice_integrado)
    recientes = _cargar_propuestas_recientes(ruta_propuestas_recientes)

    corpus_textos = [item.get("texto", "") for item in integrados + recientes if item.get("texto")]
    corpus_ids = [item.get("id", "") for item in integrados + recientes]

    if not corpus_textos:
        return {
            "estado": "aceptada",
            "motivo": "Sin corpus previo para comparar",
            "similitud_max": 0.0,
            "pieza_relacionada": None,
        }

    # Intentar LEANN, fallback a TF-IDF
    similitudes = _probar_leann(texto, corpus_textos)
    if similitudes is None:
        similitudes = _calcular_tfidf(corpus_textos, texto)

    if not similitudes:
        return {
            "estado": "aceptada",
            "motivo": "No se pudo calcular similitud",
            "similitud_max": 0.0,
            "pieza_relacionada": None,
        }

    max_similitud = max(similitudes)
    idx_max = similitudes.index(max_similitud)
    pieza_relacionada = corpus_ids[idx_max] if idx_max < len(corpus_ids) else None

    if max_similitud >= umbral_similitud:
        # Revisor gratuito: puntúa novedad, concreción, anclaje
        # Placeholder: simulación simple basada en similitud
        puntuacion = max(1, int(10 * (1 - max_similitud)))

        if puntuacion < umbral_revisor:
            return {
                "estado": "descartada",
                "motivo": f"Baja puntuación revisor ({puntuacion}/10): similitud {max_similitud:.2f} con {pieza_relacionada}",
                "similitud_max": max_similitud,
                "pieza_relacionada": pieza_relacionada,
            }
        else:
            return {
                "estado": "ampliacion",
                "motivo": f"Similitud alta ({max_similitud:.2f}) con {pieza_relacionada}, pero puntuación revisor {puntuacion}/10 permite ampliación",
                "similitud_max": max_similitud,
                "pieza_relacionada": pieza_relacionada,
            }

    return {
        "estado": "aceptada",
        "motivo": f"Novedad suficiente (similitud máx: {max_similitud:.2f})",
        "similitud_max": max_similitud,
        "pieza_relacionada": pieza_relacionada,
    }


def procesar_lote_propuestas(
    propuestas: list[dict[str, Any]],
    ruta_indice_integrado: str = "starseed_memory_root/sintesis/indice_integrado.jsonl",
    ruta_propuestas_recientes: str = "starseed_memory_root/sintesis/propuestas.jsonl",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Procesa un lote de propuestas y devuelve (aceptadas, descartadas_con_motivo)."""
    aceptadas = []
    descartadas = []

    for prop in propuestas:
        resultado = filtrar_novedad(prop, ruta_indice_integrado, ruta_propuestas_recientes)
        prop_con_resultado = {**prop, "filtro_novedad": resultado}

        if resultado["estado"] == "aceptada":
            aceptadas.append(prop_con_resultado)
        else:
            descartadas.append(prop_con_resultado)

    return aceptadas, descartadas


if __name__ == "__main__":
    import sys

    # Test rápido
    test_propuesta = {
        "id": "test-001",
        "texto": "Integrar NotebookLM con la síntesis diaria",
        "area": "ia",
        "pieza_base": "sintesis_autonoma",
    }

    resultado = filtrar_novedad(test_propuesta)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))