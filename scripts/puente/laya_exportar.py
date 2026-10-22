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
import subprocess
import sys
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

# Preguntas tipadas de Laya, puntos reales del contrato (§4: score dificultad + noul «¿basta un modelo pequeño?»)
PREGUNTAS = {
    "herramienta": {
        "type": "choice",
        "instructions": "¿Qué medio responde este mensaje?",
        "criteria": {"chat": "conversación escrita", "voz": "habla o audio", "tarea": "automatización o la malla"},
    },
    "dificultad": {
        "type": "score",
        "instructions": "¿Cuán difícil es lo pedido?",
        "criteria": ["fácil", "media", "alta"],
    },
    "basta_pequeno": {
        "type": "noul",
        "instructions": "¿Basta un modelo pequeño para responder bien?",
    },
}


def extraer_respuesta(resultado: dict) -> dict:
    """Aplana la respuesta de system_one a la forma real: choice/probabilities/answer_confidence, score, noul.

    `answer_confidence` es la calibrada; la media entre las tres preguntas es la confianza del mensaje.
    """
    respuestas = resultado.get("answers", {})
    plana = {"choice": None, "score": None, "noul": None, "answer_confidence": 0.0, "probabilities": {}}
    for respuesta in respuestas.values():
        if "choice" in respuesta and plana["choice"] is None:
            plana["choice"] = respuesta["choice"]
            plana["probabilities"] = respuesta.get("probabilities", {})
        if "score" in respuesta and plana["score"] is None:
            plana["score"] = respuesta["score"]
        if "noul" in respuesta and plana["noul"] is None:
            plana["noul"] = respuesta["noul"]
        plana["answer_confidence"] += float(respuesta.get("answer_confidence", 0.0))
    if respuestas:
        plana["answer_confidence"] /= len(respuestas)
    return plana


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


def medir_latencia(func: Callable[[], Any], reloj: Callable[[], float] = time.perf_counter) -> tuple[Any, float]:
    """Ejecuta func con el reloj que le den y devuelve (resultado, latencia_ms)."""
    inicio = reloj()
    resultado = func()
    fin = reloj()
    return resultado, (fin - inicio) * 1000.0


def evaluar(mensajes: list[str], modelos: dict[str, Callable[[str], dict]], reloj: Callable[[], float] = time.perf_counter) -> list[dict]:
    """Mide cada mensaje con cada modelo (callables mensaje → respuesta plana) y compara fp32 contra int8.

    Pura: los modelos, el reloj y los mensajes vienen dados; no toca red, disco ni pesos.
    """
    filas = []
    for mensaje in mensajes:
        fila: dict = {"mensaje": mensaje}
        planas: dict[str, dict] = {}
        for nombre, modelo in modelos.items():
            respuesta, latencia = medir_latencia(lambda m=mensaje: modelo(m), reloj=reloj)  # noqa: B023
            fila[f"latencia_{nombre}_ms"] = latencia
            fila[f"respuesta_{nombre}"] = respuesta
            planas[nombre] = respuesta
        fila["comparacion"] = comparar_respuestas(planas["fp32"], planas["int8"])
        filas.append(fila)
    return filas


ORIGEN_MODELO = "convaiinnovations/laya-multilingual"
# Solo los archivos del modelo y el tokenizador: no README ni textos ni código del repositorio
REPO_RECETA = "https://raw.githubusercontent.com/receptron/laya/main/export"
ARCHIVOS_RECETA = ("export_onnx.py", "rl_common.py")
PAQUETES_VENV = ["huggingface_hub", "transformers", "torch", "onnx", "onnxruntime", "safetensors", "laya[onnx]"]


def crear_venv(ruta: str) -> str:
    """Crea el entorno virtual propio y devuelve la ruta de su ejecutable de Python."""
    subprocess.run([sys.executable, "-m", "venv", ruta], check=True)
    return str(Path(ruta) / ("Scripts/python.exe" if os.name == "nt" else "bin/python"))


def instalar_venv(python_venv: str) -> None:
    """Instala en el venv lo que hace falta: pesos, exportación y medición con laya[onnx]."""
    subprocess.run([python_venv, "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([python_venv, "-m", "pip", "install", *PAQUETES_VENV], check=True)


def descargar_modelo(python_venv: str, destino: str) -> str:
    """Descarga en `destino` solo los archivos del modelo y el tokenizador de laya-multilingual."""
    codigo = "\n".join([
        "from huggingface_hub import snapshot_download",
        f"snapshot_download(repo_id={ORIGEN_MODELO!r}, local_dir={destino!r},",
        "                   allow_patterns=[\"*.json\", \"*.safetensors\", \"encoder/*\", \"encoder/*/*\", \"tokenizer/*\", \"tokenizer/*/*\"])",
    ])
    subprocess.run([python_venv, "-c", codigo], check=True)
    return destino


def traer_receta(destino: str) -> list[str]:
    """Descarga la receta MIT acreditada de receptron/laya (export/export_onnx.py + rl_common.py)."""
    import urllib.request

    carpeta = Path(destino)
    carpeta.mkdir(parents=True, exist_ok=True)
    escritos = []
    for nombre in ARCHIVOS_RECETA:
        destino_archivo = carpeta / nombre
        with urllib.request.urlopen(f"{REPO_RECETA}/{nombre}") as bajada, open(destino_archivo, "wb") as archivo:
            archivo.write(bajada.read())
        escritos.append(str(destino_archivo))
    return escritos


def exportar_onnx(python_venv: str, modelo_dir: str, salida_fp32: str, receta_dir: str) -> dict:
    """Ejecuta export/export_onnx.py de la receta con el Python del venv."""
    subprocess.run([python_venv, str(Path(receta_dir) / "export_onnx.py"), modelo_dir, salida_fp32], check=True)
    return {"status": "ok", "salida": salida_fp32}


def cuantizar_int8(python_venv: str, entrada_fp32: str, salida_int8: str) -> dict:
    """Cuantiza a int8 dinámico con onnxruntime.quantization, ajustes del repo de Laya.

    Solo MatMul, QInt8 y POR TENSOR: per-channel colapsa el modelo (issue #790).
    """
    codigo = "\n".join([
        "import onnx",
        "from onnxruntime.quantization import QuantType, quantize_dynamic",
        f"modelo = onnx.load({entrada_fp32!r})",
        "del modelo.graph.value_info[:]",  # el cuantizador las rehace; dejarlas choca con su inferencia de forma
        f"quantize_dynamic(model_input=modelo, model_output={salida_int8!r},",
        "                   op_types_to_quantize=['MatMul'], weight_type=QuantType.QInt8, per_channel=False)",
    ])
    subprocess.run([python_venv, "-c", codigo], check=True)
    return {"status": "ok", "salida": salida_int8}


def inferir_laya(agente: Any, texto: str) -> dict:
    """Ejecuta system_one en el agente y devuelve la respuesta plana con answer_confidence calibrada."""
    return extraer_respuesta(agente.system_one(texto, PREGUNTAS))


def construir_modelo(carpeta_modelo: str, ruta_onnx: str) -> Callable[[str], dict]:
    """Carga ONNXAgent (tokenizador del checkpoint, grafo local) y lo envuelve como modelo a medida."""
    from laya.onnx_agent import ONNXAgent

    agente = ONNXAgent(carpeta_modelo, onnx_path=ruta_onnx)
    return lambda mensaje: inferir_laya(agente, mensaje)


def medir(carpeta_modelo: str, ruta_fp32: str, ruta_int8: str, ruta_informe: str) -> dict:
    """Mide los 30 mensajes con los dos grafos y escribe el informe JSON."""
    carriles = {"fp32": ruta_fp32, "int8": ruta_int8}
    modelos = {nombre: construir_modelo(carpeta_modelo, ruta) for nombre, ruta in carriles.items()}
    resultados = evaluar(MENSAJES_EJEMPLO, modelos)
    informe = {
        "resumen": resumir_resultados(resultados),
        "resultados": resultados,
        "rutas": {"modelo": carpeta_modelo, **carriles},
    }
    Path(ruta_informe).write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8")
    return informe


def main(argv: Optional[list] = None) -> int:
    """Sin `--medir`, corre el pipeline completo; el informe cuenta con `python_venv <script> --medir …`."""
    if argv and argv[0] == "--medir":
        _, carpeta_modelo, ruta_fp32, ruta_int8, ruta_informe = argv
        informe = medir(carpeta_modelo, ruta_fp32, ruta_int8, ruta_informe)
        print(json.dumps(informe["resumen"], ensure_ascii=False, indent=2))
        return 0

    parser = argparse.ArgumentParser(description="Exporta laya-multilingual a ONNX (fp32 e int8) y mide")
    parser.add_argument("--destino", default="salida-laya-onnx", help="carpeta de trabajo y del informe")
    parser.add_argument("--venv", default=".venv-laya-export", help="entorno virtual propio")
    argumentos = parser.parse_args(argv)

    base = Path(argumentos.destino)
    carpeta_modelo = str(base / "modelo")
    carpeta_fp32 = str(base / "onnx-fp32")
    carpeta_receta = str(base / "receta")
    ruta_fp32 = str(Path(carpeta_fp32) / "laya.onnx")
    ruta_int8 = str(base / "laya.int8.onnx")
    ruta_informe = str(base / "informe-laya-onnx.json")

    python_venv = crear_venv(argumentos.venv)
    instalar_venv(python_venv)
    descargar_modelo(python_venv, carpeta_modelo)
    traer_receta(carpeta_receta)
    exportar_onnx(python_venv, carpeta_modelo, carpeta_fp32, carpeta_receta)
    cuantizar_int8(python_venv, ruta_fp32, ruta_int8)

    # La medición necesita laya[onnx], que vive en el venv: se relanza este mismo script con su Python
    subprocess.run([python_venv, os.path.abspath(__file__), "--medir",
                    carpeta_modelo, ruta_fp32, ruta_int8, ruta_informe], check=True)
    print(f"Informe: {ruta_informe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())