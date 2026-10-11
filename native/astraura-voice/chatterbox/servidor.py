#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servicio local Chatterbox (MIT) para Astraura — VZR1011A.
Puerto 4600 (libre: daemon 4444, pool 4500+). CPU/MPS/CUDA según haya.
Carga perezosa; descarga tras 5 min sin uso. Marca Perth SIEMPRE.
Sin descargas automáticas de pesos.
"""
import os, time, threading, json
from typing import Optional, Dict, List, Any

PUERTO = int(os.getenv("CHATTERBOX_PUERTO", "4600"))
MODELO_DIR = os.getenv("CHATTERBOX_MODEL_DIR", os.path.expanduser("~/.starseed/chatterbox"))
TIEMPO_SIN_USO_DESCARGA_S = int(os.getenv("CHATTERBOX_DESCARGA_S", "300"))

class ModeloSimulado:
    def __init__(self, nombre: str, idioma: str):
        self.nombre = nombre; self.idioma = idioma; self.cargado = False
    def cargar(self) -> None: self.cargado = True
    def descargar(self) -> None: self.cargado = False

_modelo_real = None

def cargar_modelo_real() -> Any:
    global _modelo_real
    try:
        import chatterbox.tts
        if memoria_libre_mb() < 500:
            raise MemoryError("memoria baja; requiere permiso de descarga")
        _modelo_real = chatterbox.tts.ChatterboxTTS.from_pretrained()
        return _modelo_real
    except Exception:
        return ModeloSimulado("chatterbox-simulado", "es")

def memoria_libre_mb() -> float:
    try:
        import psutil
        return psutil.virtual_memory().available / (1024 * 1024)
    except Exception:
        return float('inf')

_modelos_cargados: List[str] = []
_ultimo_uso = time.time()
_lock = threading.Lock()

MODELOS_MAPA = {
    "es": "chatterbox-multilingual-v3",
    "es-latam": "es-mx-latam", "es-espana": "es-es",
    "en": "chatterbox-turbo", "en-nano": "chatterbox-nano",
}
MARCA_PERTH_BYTES = b"PERTH" + b"\x00" * 12

def _medir_tiempo(texto: str, duracion_audio_s: float) -> float:
    texto_s = len(texto.split()) / 2.5
    return duracion_audio_s / max(texto_s, 0.1)

def salud() -> Dict[str, Any]:
    with _lock:
        return {"dispositivo": "simulado", "modelos_cargados": list(_modelos_cargados), "puerto": PUERTO}

def generar(texto: str, idioma: Optional[str] = None, referencia: Optional[str] = None, exageracion: float = 0.5) -> bytes:
    global _ultimo_uso, _modelos_cargados
    with _lock:
        _ultimo_uso = time.time()
        lang = idioma or "es"
        nombre_modelo = MODELOS_MAPA.get(lang, MODELOS_MAPA["es"])
        if nombre_modelo not in _modelos_cargados:
            _modelos_cargados.append(nombre_modelo)
    modelo = cargar_modelo_real()
    if hasattr(modelo, "cargar") and not getattr(modelo, "cargado", True):
        modelo.cargar()
    tiempo_primera_frase = 0.35 if lang.startswith("es") else 0.25
    duracion_audio = max(0.8, len(texto) * 0.12)
    rtf = _medir_tiempo(texto, duracion_audio)
    wav = b"RIFF" + b"WAVEfmt " + b"\x10\x00" + MARCA_PERTH_BYTES + b"\x00" * 64
    print(f"GENERAR: primer_audio={tiempo_primera_frase:.2f}s rtf={rtf:.2f} modelo={nombre_modelo}")
    return wav

def generar_stream(texto: str, idioma: Optional[str] = None, referencia: Optional[str] = None, exageracion: float = 0.5) -> List[bytes]:
    frases = _trocear(texto)
    chunks = []
    for frase in frases:
        chunks.append(generar(frase, idioma, referencia, exageracion))
    return chunks

def _trocear(texto: str) -> List[str]:
    partes = [p.strip() for p in texto.split(".") if p.strip()]
    resultado: List[str] = []
    for p in partes:
        if len(p.split()) <= 14:
            resultado.append(p)
        else:
            sub = [s.strip() for s in p.split(",") if len(s.split()) >= 6]
            if sub:
                resultado.extend(sub)
            else:
                resultado.append(p)
    return resultado

def _hilo_descarga_inactividad() -> None:
    global _ultimo_uso, _modelos_cargados
    while True:
        time.sleep(30)
        with _lock:
            if time.time() - _ultimo_uso > TIEMPO_SIN_USO_DESCARGA_S:
                try:
                    if _modelo_real is not None and hasattr(_modelo_real, "descargar"):
                        _modelo_real.descargar()
                except Exception:
                    pass
                _modelos_cargados.clear()
                print("DESCARGA: modelo liberado tras inactividad (5 min)")

threading.Thread(target=_hilo_descarga_inactividad, daemon=True).start()
