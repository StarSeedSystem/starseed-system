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


def cargar_tokenizador(tokenizer_dir: str):
    """Carga el tokenizer de Hugging Face."""
    from transformers import AutoTokenizer
    return AutoTokenizer.from_pretrained(tokenizer_dir)


def cargar_config(modelo_dir: str):
    """Carga la configuración del modelo para obtener id2label."""
    from transformers import AutoConfig
    return AutoConfig.from_pretrained(modelo_dir)


def softmax(x):
    """Compute softmax of array x."""
    import numpy as np
    e_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e_x / e_x.sum(axis=-1, keepdims=True)


def inferir_laya(sesion, tokenizer, id2label, texto: str) -> dict:
    """Ejecuta inferencia Laya y devuelve choice/score/noul con answer_confidence."""
    import numpy as np
    # Tokenize
    inputs = tokenizer(texto, return_tensors="np", padding=True, truncation=True, max_length=512)
    # Get input names from session
    input_names = [input.name for input in sesion.get_inputs()]
    # Prepare ONNX inputs
    ort_inputs = {name: inputs[name] for name in input_names if name in inputs}
    # Run inference
    ort_outs = sesion.run(None, ort_inputs)
    # Assuming outputs are: choice_logits, score, noul
    choice_logits = ort_outs[0]
    score = ort_outs[1]
    noul = ort_outs[2]
    # Process choice_logits
    probs = softmax(choice_logits, axis=-1)
    choice_id = np.argmax(probs, axis=-1)[0]
    choice_label = id2label[choice_id]
    confidence = float(np.max(probs, axis=-1)[0])
    score_val = float(score[0][0])
    noul_val = float(noul[0][0])
    return {
        "choice": choice_label,
        "score": score_val,
        "noul": noul_val,
        "answer_confidence": confidence
    }


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=str, default=".", help="Directory to save ONNX models and report")
    args = parser.parse_args(argv)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        venv_dir = tmpdir / "venv"
        subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
        if sys.platform == "win32":
            python_venv = venv_dir / "Scripts" / "python.exe"
        else:
            python_venv = venv_dir / "bin" / "python"

        # Install packages
        subprocess.run([python_venv, "-m", "pip", "install", "transformers", "torch", "onnxruntime", "huggingface_hub"], check=True)

        # Download model
        modelo_dir = tmpdir / "modelo"
        download_script = tmpdir / "download.py"
        download_script.write_text(f"""
from huggingface_hub import snapshot_download
snapshot_download('convaiinnovations/laya-multilingual', local_dir=r'{modelo_dir}', allow_patterns=['*.json', '*.model', '*.txt', '*.bin'])
""")
        subprocess.run([python_venv, str(download_script)], check=True)

        # Get export script from receptron/laya
        receptron_dir = tmpdir / "receptron-laya"
        subprocess.run(["git", "clone", "--depth", "1", "https://github.com/receptron/laya", str(receptron_dir)], check=True)
        export_script = receptron_dir / "export" / "export_onnx.py"
        if not export_script.exists():
            export_script = next(receptron_dir.rglob("export_onnx.py"))

        # Export to ONNX fp32
        fp32_dir = tmpdir / "fp32"
        fp32_dir.mkdir()
        fp32_model = fp32_dir / "model.onnx"
        subprocess.run([python_venv, str(export_script), "--model-dir", str(modelo_dir), "--out", str(fp32_model)], check=True)

        # Quantize to int8
        int8_dir = tmpdir / "int8"
        int8_dir.mkdir()
        int8_model = int8_dir / "model_int8.onnx"
        quantize_script = tmpdir / "quantize.py"
        quantize_script.write_text(f"""
import sys
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic(r'{fp32_model}', r'{int8_model}', weight_type=QuantType.QUInt8)
""")
        subprocess.run([python_venv, str(quantize_script)], check=True)

        # Load models
        sesion_fp32 = cargar_modelo_onnx(str(fp32_model))
        sesion_int8 = cargar_modelo_onnx(str(int8_model))
        tokenizer = cargar_tokenizador(str(modelo_dir))
        id2label = cargar_config(str(modelo_dir)).id2label

        # Process messages
        mensajes = MENSAJES_EJEMPLO[:30]
        resultados = []
        for mensaje in mensajes:
            res_fp32, lat_fp32 = medir_latencia(inferir_laya, sesion_fp32, tokenizer, id2label, mensaje)
            res_int8, lat_int8 = medir_latencia(inferir_laya, sesion_int8, tokenizer, id2label, mensaje)
            comparacion = comparar_respuestas(res_fp32, res_int8)
            resultados.append({
                "mensaje": mensaje,
                "respuesta_fp32": res_fp32,
                "respuesta_int8": res_int8,
                "comparacion": comparacion,
                "latencia_fp32_ms": lat_fp32,
                "latencia_int8_ms": lat_int8
            })

        # Summarize and write report
        resumen = resumir_resultados(resultados)
        report_path = Path(args.output_dir) / "laya_export_report.json"
        with open(report_path, "w") as f:
            json.dump(resumen, f, indent=2)
        print(f"Informe escrito en {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())