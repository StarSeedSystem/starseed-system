"""
Funciones para probar modelos en el vigía de modelos.
"""

from typing import Dict, Any, Optional, Callable
import time
import os

try:
    import psutil
except ImportError:
    psutil = None

def _probar_imagen(modelo_info: Dict[str, Any], motor_local: Any) -> Dict[str, Any]:
    if not hasattr(motor_local, 'txt2img'):
        return {"exitoso": False, "tiempo_segundos": 0.0, "memoria_mb": 0.0,
                "error": "Motor local lacks 'txt2img' method", "detalles": None}
    proc = psutil.Process() if psutil else None
    mem_start = proc.memory_info().rss if proc else 0
    start = time.perf_counter()
    try:
        motor_local.txt2img(prompt="test", width=512, height=512, steps=2)
        success = True
        error = None
    except Exception as e:
        success = False
        error = str(e)
    end = time.perf_counter()
    mem_end = proc.memory_info().rss if proc else 0
    elapsed = end - start
    mem_mb = max(mem_start, mem_end) / 1024 / 1024 if proc else 0.0
    return {"exitoso": success, "tiempo_segundos": elapsed,
            "memoria_mb": round(mem_mb, 2), "error": error,
            "detalles": {"generado": success} if success else None}

def _probar_voz(modelo_info: Dict[str, Any], motor_local: Any) -> Dict[str, Any]:
    return {"exitoso": False, "tiempo_segundos": 0.0, "memoria_mb": 0.0,
            "error": "Voice test not implemented", "detalles": None}

def _probar_oido(modelo_info: Dict[str, Any], motor_local: Any) -> Dict[str, Any]:
    return {"exitoso": False, "tiempo_segundos": 0.0, "memoria_mb": 0.0,
            "error": "Hearing test not implemented", "detalles": None}

_AREA_FN: Dict[str, Callable] = {
    "imagen": _probar_imagen,
    "voz": _probar_voz,
    "oido": _probar_oido,
}

def probar_modelo(area: str, modelo_info: Dict[str, Any],
                  motor_local: Optional[Any] = None) -> Dict[str, Any]:
    if motor_local is None:
        return {"exitoso": False, "tiempo_segundos": 0.0, "memoria_mb": 0.0,
                "error": "No local motor provided", "detalles": None}
    fn = _AREA_FN.get(area)
    if fn is None:
        return {"exitoso": False, "tiempo_segundos": 0.0, "memoria_mb": 0.0,
                "error": f"Unsupported area for testing: {area}", "detalles": None}
    return fn(modelo_info, motor_local)

def decidir(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]]) -> bool:
    if not nueva.get("exitoso", False):
        return False
    if actual is None:
        return True
    t_nueva = nueva.get("tiempo_segundos", float('inf'))
    t_actual = actual.get("tiempo_segundos", float('inf'))
    if t_nueva > t_actual * 1.15:
        return False
    return True