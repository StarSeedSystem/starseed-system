#!/usr/bin/env python3
"""
Script para exportar laya-multilingual a ONNX (fp32 e int8) y medir acuerdo y latencia.
"""
import os
import json
import time
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Any

def descargar_modelo(cache_dir: Path = Path("./cache_modelo")) -> Path:
    from huggingface_hub import snapshot_download
    return Path(snapshot_download(
        repo_id="convaiinnovations/laya-multilingual",
        cache_dir=cache_dir,
        allow_patterns=["*.json", "*.model", "*.txt", "*.bin"],
        ignore_patterns=["*.git*", "*.md", "LICENSE*", "*.csv"]
    ))

def exportar_a_onnx(directorio_modelo: Path, ruta_salida: Path) -> Path:
    # Asumimos que receptron/laya está instalado
    script_export = Path(__file__).parent.parent / "vendor" / "receptron-laya" / "export" / "export_onnx.py"
    if not script_export.exists():
        repo_dir = Path("./cache_modelo") / "receptron-laya"
        if not repo_dir.exists():
            subprocess.check_call(["git", "clone", "https://github.com/receptron/laya.git", str(repo_dir)])
        script_export = repo_dir / "export" / "export_onnx.py"
    subprocess.check_call([
        sys.executable, str(script_export),
        "--directorio_modelo", str(directorio_modelo),
        "--ruta_salida", str(ruta_salida)
    ])
    return ruta_salida

def cuantizar_a_int8(ruta_fp32: Path, ruta_int8: Path) -> Path:
    from onnxruntime.quantization import cuantizar_dinamicamente, TipoCuantizacion
    cuantizar_dinamicamente(
        modelo_entrada=str(ruta_fp32),
        modelo_salida=str(ruta_int8),
        tipo_peso=TipoCuantizacion.QInt8
    )
    return ruta_int8

class EjecutorLaya:
    def __init__(self, ruta_modelo: Path):
        import onnxruntime as ort
        self.sesion = ort.InferenceSession(str(ruta_modelo))
    def ejecutar(self, texto: str) -> Dict[str, Any]:
        # Implementación de marcador de posición - en realidad, tokenizar y ejecutar modelo
        return {"eleccion": "A", "puntuacion": 0.8, "noul": 0.7, "confianza_respuesta": 0.9}

def comparar_salidas(fp32: Dict[str, Any], int8: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "eleccion": fp32.get("eleccion") == int8.get("eleccion"),
        "puntuacion": abs(fp32.get("puntuacion", 0) - int8.get("puntuacion", 0)) < 0.1,
        "noul": abs(fp32.get("noul", 0) - int8.get("noul", 0)) < 0.05,
        "diferencia_confianza_respuesta": abs(fp32.get("confianza_respuesta", 0) - int8.get("confianza_respuesta", 0))
    }

def resumir_resultados(resultados: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not resultados:
        return {}
    n = len(resultados)
    latencias_fp32 = [r["latencia_fp32"] for r in resultados]
    latencias_int8 = [r["latencia_int8"] for r in resultados]
    claves_acuerdo = ["eleccion", "puntuacion", "noul"]
    tasas_acuerdo = {k: sum(r["acuerdo"].get(k, False) for r in resultados) / n for k in claves_acuerdo}
    return {
        "total_mensajes": n,
        "latencia_promedio_fp32": sum(latencias_fp32) / n,
        "latencia_promedio_int8": sum(latencias_int8) / n,
        "tasas_acuerdo": tasas_acuerdo,
        "diferencia_promedio_confianza": sum(r["acuerdo"].get("diferencia_confianza_respuesta", 0) for r in resultados) / n
    }

def main():
    # Descargar modelo
    directorio_modelo = descargar_modelo()
    # Exportar a ONNX fp32
    ruta_fp32 = exportar_a_onnx(directorio_modelo, Path("./laya-fp32.onnx"))
    # Cuantizar a int8
    ruta_int8 = cuantizar_a_int8(ruta_fp32, Path("./laya-int8.onnx"))
    # Mensajes de ejemplo en español
    mensajes = [f"Mensaje de ejemplo {i}" for i in range(30)]  # Marcador de posición
    # Ejecutar y medir
    ejecutor_fp32 = EjecutorLaya(ruta_fp32)
    ejecutor_int8 = EjecutorLaya(ruta_int8)
    resultados = []
    for mensaje in mensajes:
        t0 = time.time()
        salida_fp32 = ejecutor_fp32.ejecutar(mensaje)
        latencia_fp32 = time.time() - t0
        t0 = time.time()
        salida_int8 = ejecutor_int8.ejecutar(mensaje)
        latencia_int8 = time.time() - t0
        acuerdo = comparar_salidas(salida_fp32, salida_int8)
        resultados.append({
            "latencia_fp32": latencia_fp32,
            "latencia_int8": latencia_int8,
            "acuerdo": acuerdo
        })
    # Resumir y guardar
    resumen = resumir_resultados(resultados)
    with open(Path("./informe_exportacion_laya.json"), "w") as f:
        json.dump(resumen, f, indent=2)

if __name__ == "__main__":
    main()