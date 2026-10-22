"""Prueba corta tras instalar un modelo (VGM1016Kb · architecture/vigia-modelos.md §5).

POR QUÉ existe: el instalador no se queda con un modelo solo porque se descargó bien. Genera una
muestra pequeña por área con el motor LOCAL, mide segundos y pico de memoria y `decidir` compara con
el modelo actual: si es peor de la cuenta o falla, se vuelve atrás.

Los motores y las medidas son INYECTABLES (las pruebas no usan red ni modelos reales): un motor es
cualquier objeto con el método de su área —imagen: `generar(prompt, ancho, alto)`; oido:
`transcribir(audio)`; voz: `hablar(frase)`; palabra: `completar(prompt, max_tokens)`—.
"""
import json
import resource
import sys
import time
import urllib.request
from typing import Any, Callable, Dict, Optional

UMBRAL_TIEMPO = 1.15  # la nueva puede tardar hasta un 15 % más que la actual
FRASE = "Hola, esta es una prueba corta de voz."
AUDIO_MUESTRA = b"RIFF\x00\x00\x00\x00WAVEfmt "  # cabecera mínima: el motor real trae su propio audio

# área → (método del motor, argumentos de la muestra)
_MUESTRAS: Dict[str, tuple] = {
    "imagen": ("generar", {"prompt": "un faro al amanecer", "ancho": 512, "alto": 512}),
    "oido": ("transcribir", {"audio": AUDIO_MUESTRA}),
    "voz": ("hablar", {"frase": FRASE}),
    "palabra": ("completar", {"prompt": "Escribe una frase corta.", "max_tokens": 64}),
}


def _pico_mb() -> float:
    """Pico de memoria de este proceso en MB (en macOS ru_maxrss va en bytes, en Linux en KB)."""
    kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(kb / (1024 * 1024 if sys.platform == "darwin" else 1024), 2)


def _resultado(exitoso: bool, segundos: float = 0.0, mem: float = 0.0,
               error: Optional[str] = None, detalles: Any = None) -> Dict[str, Any]:
    return {"exitoso": exitoso, "tiempo_segundos": round(segundos, 4), "memoria_mb": mem,
            "error": error, "detalles": detalles}


def probar_modelo(area: str, modelo_info: Optional[Dict[str, Any]] = None, motor: Any = None,
                  medir_memoria: Callable[[], float] = _pico_mb,
                  reloj: Callable[[], float] = time.perf_counter) -> Dict[str, Any]:
    """Una muestra del área con el motor local; nunca lanza: un fallo es un resultado `exitoso=False`."""
    if motor is None:
        return _resultado(False, error="No local motor provided")
    muestra = _MUESTRAS.get(area)
    if muestra is None:
        return _resultado(False, error=f"Unsupported area for testing: {area}")
    metodo, argumentos = muestra
    funcion = getattr(motor, metodo, None)
    if not callable(funcion):
        return _resultado(False, error=f"Motor lacks '{metodo}' method")
    antes, inicio = medir_memoria(), reloj()
    try:
        salida = funcion(**argumentos)
    except Exception as e:  # el motor puede romper de mil formas: todas significan «no sirve»
        return _resultado(False, reloj() - inicio, max(antes, medir_memoria()), str(e))
    segundos = reloj() - inicio
    if not salida:  # un motor que contesta vacío no ha producido muestra
        return _resultado(False, segundos, max(antes, medir_memoria()), "Muestra vacía")
    return _resultado(True, segundos, max(antes, medir_memoria()), None, {"area": area})


def motor_imagen_http(url: str, abrir: Callable[..., Any] = urllib.request.urlopen,
                      espera: float = 120.0) -> Any:
    """Motor de imagen sobre el servidor de stable-diffusion.cpp (POST JSON; devuelve los bytes)."""
    class _Motor:
        def generar(self, prompt: str, ancho: int, alto: int) -> bytes:
            cuerpo = json.dumps({"prompt": prompt, "width": ancho, "height": alto}).encode()
            peticion = urllib.request.Request(url, cuerpo, {"Content-Type": "application/json"})
            with abrir(peticion, timeout=espera) as respuesta:
                return respuesta.read()
    return _Motor()


def decidir(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]]) -> str:
    """PURA. «quedarse» si funciona y no es más de un 15 % más lenta que la actual (o aporta una
    capacidad nueva: no había actual que funcione, o `capacidad_nueva`); si no, «volver_atras»."""
    if not nueva.get("exitoso", False):
        return "volver_atras"
    if nueva.get("capacidad_nueva") or actual is None or not actual.get("exitoso", False):
        return "quedarse"
    t_actual = actual.get("tiempo_segundos", 0.0)
    t_nueva = nueva.get("tiempo_segundos", float("inf"))
    return "quedarse" if t_nueva <= t_actual * UMBRAL_TIEMPO + 1e-9 else "volver_atras"
