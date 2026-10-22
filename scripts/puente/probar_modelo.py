#!/usr/bin/env python3
"""Probar antes de quedarse (VGM1016Kb, architecture/vigia-modelos.md §5).

Tras instalar un modelo, una prueba corta por área con el motor local si responde
(imagen 512×512, oído, voz, palabra de 64 tokens) mide segundos y pico de memoria;
`decidir` (pura) elige entre quedarse con la nueva versión o volver atrás.
El cliente HTTP y la medida de memoria se inyectan: las pruebas no usan red.
"""

from __future__ import annotations

import json
import time
import urllib.request
from typing import Any, Callable, Optional

MARGEN_TIEMPO = 1.15  # la nueva puede tardar hasta un 15 % más que la actual

# area -> (ruta del motor local, cuerpo de la prueba, clave que debe traer la respuesta)
PRUEBAS: dict[str, tuple[str, dict[str, Any], str]] = {
    "imagen": ("/sdapi/v1/txt2img",
               {"prompt": "una semilla de luz", "width": 512, "height": 512, "steps": 8}, "images"),
    "oido": ("/inference", {"audio": "muestra-corta.wav"}, "text"),
    "voz": ("/v1/audio/speech", {"input": "Hola, esta es una prueba."}, "audio"),
    "palabra": ("/completion", {"prompt": "StarSeed es", "n_predict": 64}, "content"),
}


def http_json(url: str, cuerpo: dict[str, Any], espera: float = 120.0) -> dict[str, Any]:
    """Cliente real: POST JSON. Las pruebas lo sustituyen por uno de ejemplo."""
    peticion = urllib.request.Request(
        url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(peticion, timeout=espera) as r:  # noqa: S310 (motor local)
        return json.loads(r.read() or b"{}")


def pico_memoria_mb() -> float:
    """Pico de memoria residente del proceso, en MB (0.0 si el sistema no lo da)."""
    try:
        import resource, sys
        pico = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
        return round(pico / (1024 * 1024 if sys.platform == "darwin" else 1024), 1)
    except Exception:  # noqa: BLE001
        return 0.0


def probar_modelo(area: str, base_url: str,
                  http: Callable[..., dict[str, Any]] = http_json,
                  memoria: Callable[[], float] = pico_memoria_mb,
                  reloj: Callable[[], float] = time.perf_counter) -> dict[str, Any]:
    """Una prueba corta; devuelve {area, exitoso, segundos, pico_mb, error}. Nunca lanza."""
    res: dict[str, Any] = {"area": area, "exitoso": False, "segundos": 0.0, "pico_mb": 0.0, "error": None}
    if area not in PRUEBAS:
        res["error"] = f"área sin prueba: {area}"
        return res
    ruta, cuerpo, clave = PRUEBAS[area]
    antes = memoria()
    t0 = reloj()
    try:
        respuesta = http(base_url.rstrip("/") + ruta, cuerpo)
    except Exception as e:  # noqa: BLE001 — el motor puede no responder
        res["error"] = f"el motor local no responde: {e}"
        return res
    res["segundos"] = round(reloj() - t0, 3)
    res["pico_mb"] = max(antes, memoria())
    if respuesta.get(clave):
        res["exitoso"] = True
    else:
        res["error"] = f"la respuesta no trae «{clave}»"
    return res


def decidir(nueva: dict[str, Any], actual: Optional[dict[str, Any]]) -> str:
    """Pura: 'quedarse' si la nueva funciona y no es más de un 15 % más lenta que la actual
    (o aporta una capacidad nueva); si no, 'volver_atras'."""
    if not nueva.get("exitoso"):
        return "volver_atras"
    if actual is None or not actual.get("exitoso") or nueva.get("capacidad_nueva"):
        return "quedarse"
    t_nueva, t_actual = nueva.get("segundos"), actual.get("segundos")
    if t_nueva is None or t_actual is None:
        return "volver_atras"  # sin medida no se puede afirmar que no empeora
    return "quedarse" if t_nueva <= t_actual * MARGEN_TIEMPO else "volver_atras"
