#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prueba corta de un modelo recién instalado y decisión de quedarse o volver atrás.
Contrato: architecture/vigia-modelos.md §5 — una muestra, segundos y pico de memoria;
se vuelve atrás si es peor o si falla. Motores y medidas INYECTABLES (sin red, sin claves).
"""
import base64
import sys
import time
from typing import Any, Callable, Dict, Optional, Tuple

QUEDARSE = "quedarse"
VOLVER_ATRAS = "volver_atras"
MARGEN_TIEMPO = 0.15  # 15 %: más lento que esto y se vuelve atrás
AREAS = ("imagen", "oido", "voz", "palabra")
LICENCIA_COMERCIAL = {"libre", "condicionada"}  # contrato §3: lo demás no vale en uso comercial
# Servidores locales (127.0.0.1): voz → OmniVoice 4500 · oído → whisper.cpp · imagen → sd.cpp.
RUTAS = {
    "imagen": ("/sdapi/v1/txt2img", "http://127.0.0.1:8080"),
    "oido": ("/v1/audio/transcriptions", "http://127.0.0.1:8080"),
    "voz": ("/v1/audio/speech", "http://127.0.0.1:4500"),
    "palabra": ("/completion", "http://127.0.0.1:8080"),
}

def pico_proceso_mb() -> float:
    """Pico de memoria del proceso actual, en MB (0 si la plataforma no lo dice)."""
    try:
        import resource
        pico = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        return round(pico / (1024 * 1024) if sys.platform == "darwin" else pico / 1024, 2)
    except Exception:
        return 0.0

def cuerpo_prueba(area: str, muestra: Optional[bytes] = None) -> Dict[str, Any]:
    """La muestra corta de cada área (contrato §5)."""
    if area == "imagen":
        return {"prompt": "una silla junto a una ventana", "width": 512, "height": 512,
                "n_steps": 4, "seed": 42}
    if area == "oido":
        return {"audio_base64": base64.b64encode(muestra or b"").decode("ascii"), "language": "es"}
    if area == "voz":
        return {"input": "Prueba de voz de StarSeed.", "voice": "ef_dora", "response_format": "wav"}
    return {"prompt": "StarSeed", "n_predict": 64, "stream": False}

def _motor_http(area: str, cliente: Any, url_base: str) -> Callable[[Dict[str, Any]], Dict[str, Any]]:
    """Motor por HTTP del servidor local del área: el cliente devuelve {"codigo", "datos", "bytes"}."""
    ruta = RUTAS[area][0]

    def motor(cuerpo: Dict[str, Any]) -> Dict[str, Any]:
        resp = cliente.post(url_base + ruta, json=cuerpo, timeout=120) or {}
        codigo = int(resp.get("codigo", 200) or 200)
        if codigo >= 400:
            return {"ok": False, "error": "el motor local respondió %d" % codigo}
        datos = resp.get("datos") or {}
        bytes_muestra = int(resp.get("bytes", 0) or 0)
        if datos.get("error") or (not datos and not bytes_muestra):
            return {"ok": False, "error": str(datos.get("error") or "el motor local no devolvió muestra")}
        return {"ok": True, "memoria_mb": datos.get("memoria_mb"),
                "detalles": {"ruta": ruta, "bytes": bytes_muestra, "claves": sorted(datos)[:8]}}

    return motor

def probar_modelo(area: str, modelo_info: Optional[Dict[str, Any]] = None,
                  motor: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
                  cliente_http: Any = None, medir_memoria: Optional[Callable[[], float]] = None,
                  url_base: Optional[str] = None, muestra: Optional[bytes] = None) -> Dict[str, Any]:
    """Prueba corta del modelo del área: una muestra, segundos y pico de memoria."""
    info = modelo_info or {}
    res: Dict[str, Any] = {"area": area, "exitoso": False, "tiempo_segundos": 0.0, "memoria_mb": 0.0,
                            "error": None, "detalles": None}
    if area not in AREAS:
        res["error"] = "no hay prueba para el área «%s»" % area
        return res
    clase = str(info.get("licencia_clase") or "").strip().lower()
    if clase and info.get("uso_comercial") and clase not in LICENCIA_COMERCIAL:
        res["error"] = "la licencia «%s» no permite uso comercial" % clase
        return res
    if motor is None:
        if cliente_http is None:
            res["error"] = "no hay motor local para «%s»" % area
            return res
        motor = _motor_http(area, cliente_http, url_base or info.get("url_base") or RUTAS[area][1])
    medir = medir_memoria or pico_proceso_mb
    antes = float(medir() or 0.0)
    inicio = time.perf_counter()
    try:
        salida = motor(cuerpo_prueba(area, muestra)) or {}
    except Exception as exc:  # un motor que revienta no rompe la instalación
        salida = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
    memoria = salida.get("memoria_mb")
    if memoria is None:
        memoria = max(antes, float(medir() or 0.0))
    res.update({"tiempo_segundos": round(time.perf_counter() - inicio, 3),
                "exitoso": bool(salida.get("ok")), "memoria_mb": round(float(memoria), 2),
                "detalles": salida.get("detalles")})
    res["error"] = salida.get("error") or (None if res["exitoso"] else "el motor no devolvió muestra")
    return res

def _juzgar(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]]) -> Tuple[str, str]:
    """PURA: (decisión, motivo)."""
    if not nueva.get("exitoso"):
        return VOLVER_ATRAS, "la prueba del modelo nuevo falló"
    if not actual:
        return QUEDARSE, "no había modelo anterior"
    if set(nueva.get("capacidades") or []) - set(actual.get("capacidades") or []):
        return QUEDARSE, "aporta capacidades nuevas"
    t_nueva, t_actual = nueva.get("tiempo_segundos"), actual.get("tiempo_segundos")
    if t_nueva is None or t_actual is None:
        return QUEDARSE, "sin tiempos comparables"
    if float(t_nueva) > float(t_actual) * (1 + MARGEN_TIEMPO):
        return VOLVER_ATRAS, "más lento que el anterior (margen %d %%)" % int(MARGEN_TIEMPO * 100)
    return QUEDARSE, "funciona y no es más lento"

def decidir(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]] = None) -> str:
    """PURA: «quedarse» o «volver_atras»."""
    return _juzgar(nueva, actual)[0]

def explicar(nueva: Dict[str, Any], actual: Optional[Dict[str, Any]] = None) -> str:
    """PURA: el motivo de la decisión, para el registro de la neurona."""
    return _juzgar(nueva, actual)[1]
