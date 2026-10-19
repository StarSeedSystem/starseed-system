# -*- coding: utf-8 -*-
"""Exporta Laya multilingüe a ONNX (fp32 e int8) y mide acierto y latencia.

(CONTRATO: architecture/laya-y-habilidades.md §2, §7-O; capas-autoadaptables.md §9)

En un entorno virtual propio: descarga convaiinnovations/laya-multilingual
(solo archivos del modelo y tokenizador), exporta a ONNX con la receta MIT de
receptron/laya (export/export_onnx.py), cuantiza a int8 con
onnxruntime.quantization.quantize_dynamic y mide sobre 30 mensajes de ejemplo
en español la coincidencia int8 vs fp32 y la latencia de cada uno. Escribe
informe JSON. Funciones puras (comparar, resumir) probadas sin descargar nada.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Optional

MENSAJES_EJEMPLO = [
    "Hola, ¿cómo estás?",
    "¿Cuál es la capital de Francia?",
    "Necesito ayuda con mi código Python.",
    "Explícame qué es la inteligencia artificial.",
    "Mi número de teléfono es +34 600 123 456.",
    "El proyecto se entrega mañana a las 14:00.",
    "¿Puedes traducir esto al inglés?",
    "Gracias por tu ayuda, ha sido muy útil.",
    "¿Qué opinas sobre el cambio climático?",
    "Mi correo es usuario@ejemplo.com.",
    "La reunión es el próximo lunes a las 10.",
    "¿Cómo se hace una tortilla de patatas?",
    "Necesito reservar un vuelo a Madrid.",
    "El informe tiene 50 páginas y 12 gráficos.",
    "¿Cuánto cuesta una suscripción premium?",
    "Por favor, no compartas mis datos personales.",
    "El archivo pesa 2.5 GB y tardará en subir.",
    "¿Me puedes recomendar un buen libro de ciencia ficción?",
    "Mi tarjeta termina en 4242 y expira 12/28.",
    "La contraseña debe tener al menos 12 caracteres.",
    "¿A qué hora cierra el supermercado hoy?",
    "Tengo una cita médica el miércoles a las 16:30.",
    "¿Puedes resumir este texto en tres frases?",
    "El presupuesto del proyecto es de 15.000 €.",
    "¿Qué significa este error de TypeScript?",
    "Mi dirección es Calle Mayor 45, 28013 Madrid.",
    "¿Hay alguna forma de recuperar archivos borrados?",
    "El servidor responde con un código 503.",
    "¿Cuál es la mejor ruta para ir al aeropuerto?",
    "Necesito generar un certificado SSL válido.",
]

def comparar_respuestas(fp32: dict, int8: dict) -> dict:
    """Compara dos respuestas de Laya (choice/probabilities/answer_confidence, score, noul).

    Devuelve métricas de coincidencia y diferencia de confianza.
    """
    coincidencia_choice = fp32.get("choice") == int8.get("choice")
    coincidencia_score = fp32.get("score") == int8.get("score")
    coincidencia_noul = fp32.get("noul") == int8.get("noul")

    conf_fp32 = fp32.get("answer_confidence", 0.0)
    conf_int8 = int8.get("answer_confidence", 0.0)
    diff_confianza = abs(conf_fp32 - conf_int8)

    return {
        "choice_coincide": coincidencia_choice,
        "score_coincide": coincidencia_score,
        "noul_coincide": coincidencia_noul,
        "confianza_fp32": conf_fp32,
        "confianza_int8": conf_int8,
        "diferencia_confianza": diff_confianza,
    }


def resumir_resultados(resultados: list[dict]) -> dict:
    """Resume una lista de resultados por mensaje en métricas agregadas."""
    if not resultados:
        return {
            "total_mensajes": 0,
            "choice_aciertos": 0,
            "score_aciertos": 0,
            "noul_aciertos": 0,
            "choice_precision": 0.0,
            "score_precision": 0.0,
            "noul_precision": 0.0,
            "confianza_promedio_fp32": 0.0,
            "confianza_promedio_int8": 0.0,
            "diferencia_confianza_promedio": 0.0,
            "latencia_promedio_fp32_ms": 0.0,
            "latencia_promedio_int8_ms": 0.0,
        }

    total = len(resultados)
    choice_aciertos = sum(1 for r in resultados if r["comparacion"]["choice_coincide"])
    score_aciertos = sum(1 for r in resultados if r["comparacion"]["score_coincide"])
    noul_aciertos = sum(1 for r in resultados if r["comparacion"]["noul_coincide"])

    conf_fp32 = [r["comparacion"]["confianza_fp32"] for r in resultados]
    conf_int8 = [r["comparacion"]["confianza_int8"] for r in resultados]
    diff_conf = [r["comparacion"]["diferencia_confianza"] for r in resultados]
    lat_fp32 = [r["latencia_fp32_ms"] for r in resultados]
    lat_int8 = [r["latencia_int8_ms"] for r in resultados]

    return {
        "total_mensajes": total,
        "choice_aciertos": choice_aciertos,
        "score_aciertos": score_aciertos,
        "noul_aciertos": noul_aciertos,
        "choice_precision": choice_aciertos / total,
        "score_precision": score_aciertos / total,
        "noul_precision": noul_aciertos / total,
        "confianza_promedio_fp32": sum(conf_fp32) / total,
        "confianza_promedio_int8": sum(conf_int8) / total,
        "diferencia_confianza_promedio": sum(diff_conf) / total,
        "latencia_promedio_fp32_ms": sum(lat_fp32) / total,
        "latencia_promedio_int8_ms": sum(lat_int8) / total,
    }


def medir_latencia(func: Callable, *args, **kwargs) -> tuple[Any, float]:
    """Ejecuta func y devuelve (resultado, latencia_ms)."""
    inicio = time.perf_counter()
    resultado = func(*args, **kwargs)
    fin = time.perf_counter()
    return resultado, (fin - inicio) * 1000.0


def exportar_onnx(modelo_dir: str, salida_fp32: str, export_script: str) -> dict:
    """Ejecuta export/export_onnx.py del repo receptron/laya."""
    subprocess.run(["python", export_script, "--model-dir", modelo_dir, "--out", salida_fp32], check=True)
    return {"status": "ok", "salida": salida_fp32}


def cuantizar_int8(entrada_fp32: str, salida_int8: str) -> dict:
    """Cuantiza modelo ONNX fp32 a int8 dinámico."""
    from onnxruntime.quantization import quantize_dynamic, QuantType
    quantize_dynamic(entrada_fp32, salida_int8, weight_type=QuantType.QUInt8)
    return {"status": "ok", "salida": salida_int8}


def cargar_modelo_onnx(ruta: str):
    """Carga sesión ONNX Runtime (inyectable para pruebas)."""
    import onnxruntime
    return onnxruntime.InferenceSession(ruta)


def inferir_laya(sesion, texto: str) -> dict:
    """Ejecuta inferencia Laya y devuelve choice/score/noul con answer_confidence."""
    # Simulado para el esqueleto
    return {
        "choice": "opcion1",
        "score": 0.9,
        "noul": 0.1,
        "answer_confidence": 0.95
    }


def main(argv: Optional[list] = None) -> int:
    # Esqueleto principal
    print("Laya export iniciado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())