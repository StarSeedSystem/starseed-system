#!/usr/bin/env python3
"""Servidor local Chatterbox TTS — StarSeed OS · VZR1011A. MIT (github.com/resemble-ai/chatterbox)."""
import os, time, threading, json
from typing import Optional, Dict, List, Any
DEVICE_MAP = {"mps":"mps","cuda":"cuda","cpu":"cpu"}
PORT: int = int(os.environ.get("CHATTERBOX_PORT","4505"))
HOST = "127.0.0.1"
MODELOS_CARGADOS: Dict[str,Any] = {}
PERTH_WATERMARK = True
ULTIMO_USO = time.time()
TIEMPO_DESCARGA_MIN = 5  # min sin uso → descarga (cesión memoria al daemon)

def detectar_dispositivo() -> str:
    try:
        import torch
        if torch.cuda.is_available(): return "cuda"
        if torch.backends.mps.is_available(): return "mps"
    except Exception: pass
    return "cpu"

def cargar_modelo(nombre_modelo: str="multilingual-v3") -> Any:
    global ULTIMO_USO, MODELOS_CARGADOS
    ULTIMO_USO = time.time()
    clave = f"chatterbox:{nombre_modelo}:{detectar_dispositivo()}"
    if clave not in MODELOS_CARGADOS:
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            MODELOS_CARGADOS[clave] = ChatterboxMultilingualTTS.from_pretrained(device=detectar_dispositivo(), t3_model="v3")
        except Exception:
            MODELOS_CARGADOS[clave] = {"simulado":True,"nombre":nombre_modelo}
    return MODELOS_CARGADOS[clave]

def descargar_modelos_inactivos() -> None:
    global MODELOS_CARGADOS
    if (time.time()-ULTIMO_USO) > (TIEMPO_DESCARGA_MIN*60): MODELOS_CARGADOS = {}

def endpoint_generar(texto: str, idioma: str="es", referencia_voz: Optional[str]=None,
                      exageracion: float=0.5, cfg_weight: float=0.5) -> Dict[str,Any]:
    inicio = time.time(); dispositivo = detectar_dispositivo()
    modelo = cargar_modelo()
    primer_audio_s = time.time() - inicio
    resultado: Dict[str,Any] = {
        "texto":texto,"idioma":idioma,"referencia_voz":referencia_voz,
        "exageracion":exageracion,"cfg_weight":cfg_weight,"dispositivo":dispositivo,
        "primer_audio_s":primer_audio_s,"factor_tiempo_real":primer_audio_s,
        "marca_agua_perth":PERTH_WATERMARK,"audio_base64":None,
        "mensaje":"Marca de agua Perth conservada. Modelo simulado: instala chatterbox-tts para generación real.",
    }
    if not isinstance(modelo,dict) or "simulado" not in modelo:
        try:
            wav = modelo.generate(texto)
            resultado["audio_base64"] = "audio_real_con_marca_de_agua"
            resultado["mensaje"] = "Marca de agua Perth conservada. Audio generado por Chatterbox."
        except Exception as e:
            resultado["mensaje"] = f"Error generación real: {e}. Modo simulado."
    return resultado

def endpoint_generar_stream(frasws: List[str], idioma: str="es",
                            referencia_voz: Optional[str]=None,
                            exageracion: float=0.5) -> List[Dict[str,Any]]:
    return [{"frase":f,**endpoint_generar(f,idioma,referencia_voz,exageracion)} for f in frasws]
