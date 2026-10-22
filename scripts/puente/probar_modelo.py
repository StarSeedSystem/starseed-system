"""Prueba corta tras instalar un modelo: mide tiempo y memoria, y decide quedarse o volver atrás.

Contrato: architecture/vigia-modelos.md §5. El motor local y las medidas se inyectan
(nada de red ni de reloj real en las pruebas); `decidir` es pura.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional

TOLERANCIA_TIEMPO = 1.15  # la nueva puede tardar hasta un 15 % más que la actual

# Muestra mínima por área: imagen 512×512, oído un audio corto, voz una frase, palabra 64 tokens.
MUESTRAS: Dict[str, Dict[str, Any]] = {
    "imagen": {"prompt": "una semilla de luz sobre agua", "ancho": 512, "alto": 512},
    "oido": {"audio": "muestra-corta.wav", "segundos": 3},
    "voz": {"texto": "Hola, esta es una prueba de voz."},
    "palabra": {"prompt": "Escribe una frase sobre la cooperación.", "max_tokens": 64},
}


def _pico_memoria_mb() -> float:
    """Pico de memoria residente del proceso en MB (0.0 si el sistema no lo da)."""
    try:
        import resource
        import sys
        pico = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(pico / (1024 * 1024 if sys.platform == "darwin" else 1024), 2)
    except Exception:
        return 0.0


def _resultado(exitoso: bool, tiempo: float, memoria: float, error: Optional[str],
               detalles: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"exitoso": exitoso, "tiempo_segundos": round(tiempo, 4),
            "memoria_mb": memoria, "error": error, "detalles": detalles}


def probar_modelo(area: str, modelo_info: Dict[str, Any],
                  motor_local: Optional[Callable[[str, Dict[str, Any]], Any]] = None,
                  medir_memoria: Callable[[], float] = _pico_memoria_mb,
                  reloj: Callable[[], float] = time.perf_counter) -> Dict[str, Any]:
    """Ejecuta la muestra del área con `motor_local(area, muestra)` y mide segundos y memoria.

    Sin motor que responda no se inventa nada: devuelve `exitoso=False` con el motivo.
    """
    muestra = MUESTRAS.get(area)
    if muestra is None:
        return _resultado(False, 0.0, 0.0, f"Área sin prueba: {area}")
    if motor_local is None:
        return _resultado(False, 0.0, 0.0, "No hay motor local que responda")
    inicio = reloj()
    try:
        salida = motor_local(area, dict(muestra))
    except Exception as exc:  # el motor puede fallar de cualquier modo; se anota, no se propaga
        return _resultado(False, reloj() - inicio, medir_memoria(), str(exc) or type(exc).__name__)
    tiempo = reloj() - inicio
    if salida is None or salida is False or salida == "" or salida == b"":
        return _resultado(False, tiempo, medir_memoria(), "El motor no devolvió resultado")
    return _resultado(True, tiempo, medir_memoria(), None,
                      {"area": area, "modelo": modelo_info.get("id")})


def decidir(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]]) -> str:
    """PURA. Devuelve "quedarse" o "volver_atras".

    Se queda si funciona y (no hay actual válida, aporta capacidad nueva o no tarda más
    de un 15 % que la actual). Si falla, o es más lenta de ese margen, vuelve atrás.
    """
    if not nueva.get("exitoso", False):
        return "volver_atras"
    if actual is None or not actual.get("exitoso", False):
        return "quedarse"
    if nueva.get("capacidad_nueva", False):
        return "quedarse"
    t_nueva = nueva.get("tiempo_segundos")
    t_actual = actual.get("tiempo_segundos")
    if t_nueva is None or t_actual is None:
        return "volver_atras"
    return "quedarse" if t_nueva <= t_actual * TOLERANCIA_TIEMPO else "volver_atras"
