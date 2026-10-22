"""Probar antes de quedarse (VGM1016Kb, architecture/vigia-modelos.md §5).

Tras instalar un modelo se hace una prueba corta por área con el motor local, se miden
segundos y pico de memoria y `decidir` (pura) resuelve si se queda o vuelve atrás.
Los motores y las medidas se inyectan: las pruebas no necesitan red ni modelos.
"""
from __future__ import annotations

import os
import time
from typing import Any, Callable, Dict, Optional

QUEDARSE, VOLVER_ATRAS = "quedarse", "volver_atras"
MARGEN_TIEMPO = 1.15  # como mucho un 15 % más lento que el actual

# Qué se le pide al motor en cada área (la prueba es corta a propósito).
PRUEBAS: Dict[str, Dict[str, Any]] = {
    "imagen": {"ancho": 512, "alto": 512, "prompt": "un faro al amanecer"},
    "oido": {"audio": "muestra-corta.wav"},
    "voz": {"texto": "Hola, esto es una prueba de voz."},
    "palabra": {"prompt": "Resume en una frase qué es una semilla.", "tokens": 64},
}


def memoria_pico_mb() -> float:
    """Pico de memoria residente del proceso, en MB (macOS da bytes; Linux, KB)."""
    try:
        import resource
        pico = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except ImportError:  # Windows
        return 0.0
    return round(pico / (1024 * 1024 if os.uname().sysname == "Darwin" else 1024), 2)


def _resultado(exitoso: bool, segundos: float = 0.0, memoria: float = 0.0,
               error: Optional[str] = None, capacidades=()) -> Dict[str, Any]:
    return {"exitoso": exitoso, "tiempo_segundos": round(segundos, 4),
            "memoria_mb": memoria, "error": error, "capacidades": sorted(capacidades)}


def probar_modelo(area: str, motores: Optional[Dict[str, Callable[..., Any]]] = None,
                  medir_memoria: Callable[[], float] = memoria_pico_mb,
                  reloj: Callable[[], float] = time.perf_counter,
                  capacidades=()) -> Dict[str, Any]:
    """Ejecuta la prueba corta del área. `motores[area](**PRUEBAS[area])` debe devolver
    algo no vacío (la muestra) o lanzar. Sin motor local que responda → no exitoso."""
    prueba = PRUEBAS.get(area)
    if prueba is None:
        return _resultado(False, error=f"área sin prueba: {area}")
    motor = (motores or {}).get(area)
    if motor is None:
        return _resultado(False, error="sin motor local para esta área")
    antes, inicio = medir_memoria(), reloj()
    try:
        muestra = motor(**prueba)
    except Exception as e:  # un motor caído o sin memoria es un resultado, no un cuelgue
        return _resultado(False, reloj() - inicio, max(antes, medir_memoria()), str(e))
    segundos, memoria = reloj() - inicio, max(antes, medir_memoria())
    if not muestra:
        return _resultado(False, segundos, memoria, "el motor no devolvió muestra")
    return _resultado(True, segundos, memoria, None, capacidades)


def decidir(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]]) -> str:
    """PURA. `quedarse` si la nueva funciona y (no hay actual válida, o no es más de un
    15 % más lenta que la actual, o aporta una capacidad nueva); si no, `volver_atras`."""
    if not nueva.get("exitoso"):
        return VOLVER_ATRAS
    if not actual or not actual.get("exitoso"):
        return QUEDARSE
    if set(nueva.get("capacidades") or ()) - set(actual.get("capacidades") or ()):
        return QUEDARSE
    t_nueva, t_actual = nueva.get("tiempo_segundos"), actual.get("tiempo_segundos")
    if t_nueva is None or t_actual is None:
        return VOLVER_ATRAS
    return QUEDARSE if t_nueva <= t_actual * MARGEN_TIEMPO else VOLVER_ATRAS


def motores_http(post: Callable[[str, dict], Any], sd_url: str = "http://127.0.0.1:7860",
                 llm_url: str = "http://127.0.0.1:8790") -> Dict[str, Callable[..., Any]]:
    """Motores locales por HTTP con el cliente `post(url, json)->dict` inyectado.
    Imagen: servidor de stable-diffusion.cpp; palabra: llama-server `/completion`."""
    return {
        "imagen": lambda ancho, alto, prompt: post(
            f"{sd_url}/v1/images/generations",
            {"prompt": prompt, "size": f"{ancho}x{alto}", "n": 1}).get("data"),
        "palabra": lambda prompt, tokens: post(
            f"{llm_url}/completion", {"prompt": prompt, "n_predict": tokens}).get("content"),
    }
