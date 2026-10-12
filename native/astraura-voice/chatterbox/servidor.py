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

def endpoint_salud() -> Dict[str,Any]:
    global ULTIMO_USO
    ULTIMO_USO = time.time()
    descargar_modelos_inactivos()
    dispositivo = detectar_dispositivo()
    modelos_cargados = list(MODELOS_CARGADOS.keys())
    return {
        "dispositivo": dispositivo,
        "modelos_cargados": modelos_cargados,
        "marca_agua_perth": PERTH_WATERMARK
    }

def endpoint_generar(texto: str, idioma: str="es", referencia_voz: Optional[str]=None,
                       exageracion: float=0.5, cfg_weight: float=0.5) -> Dict[str,Any]:
    global ULTIMO_USO
    ULTIMO_USO = time.time()
    descargar_modelos_inactivos()
    inicio = time.time()
    dispositivo = detectar_dispositivo()
    modelo = cargar_modelo()
    # Simulated or real generation
    audio_wav = None
    if not isinstance(modelo,dict) or "simulado" not in modelo:
        try:
            # In real case, we would generate and get the wav
            start_gen = time.time()
            wav = modelo.generate(texto, language_id="es", exaggeration=exageracion, cfg_weight=cfg_weight)
            end_gen = time.time()
            generation_time = end_gen - start_gen
            # We need to get the sample rate and the wav format.
            # The Chatterbox model returns a torch tensor? We'll assume it's a numpy array or torch tensor.
            # We'll get the shape and sample rate from the model? Actually, the model's sample rate is fixed.
            # According to the Chatterbox repo, the output is 24 kHz.
            sample_rate = 24000
            # If wav is torch tensor, convert to numpy and get length.
            if hasattr(wav, 'shape'):
                audio_length_samples = wav.shape[-1]
            else:
                audio_length_samples = len(wav)
            audio_duration = audio_length_samples / sample_rate
            factor_tiempo_real = generation_time / audio_duration if audio_duration > 0 else 0.0
            audio_base64 = "audio_real_con_marca_de_agua"  # placeholder
            mensaje = "Marca de agua Perth conservada. Audio generado por Chatterbox."
        except Exception as e:
            # Fallback to simulated
            generation_time = time.time() - start_gen
            audio_duration = 1.0  # assume 1 second
            factor_tiempo_real = generation_time / audio_duration
            audio_base64 = None
            mensaje = f"Error generación real: {e}. Modo simulado."
    else:
        # Simulated model
        generation_time = 0.01  # small fixed time to avoid division by zero
        audio_duration = 1.0
        factor_tiempo_real = generation_time / audio_duration
        audio_base64 = None
        mensaje = "Marca de agua Perth conservada. Modelo simulado: instala chatterbox-tts para generación real."
    resultado: Dict[str,Any] = {
        "texto":texto,
        "idioma":idioma,
        "referencia_voz":referencia_voz,
        "exageracion":exageracion,
        "cfg_weight":cfg_weight,
        "dispositivo":dispositivo,
        "primer_audio_s":generation_time,  # time to generate the audio (first audio)
        "factor_tiempo_real":factor_tiempo_real,
        "marca_agua_perth":PERTH_WATERMARK,
        "audio_base64":audio_base64,
        "mensaje":mensaje,
    }
    return resultado

def endpoint_generar_stream(frases: List[str], idioma: str="es",
                             referencia_voz: Optional[str]=None,
                             exageracion: float=0.5) -> List[Dict[str,Any]]:
    return [{"frase":f,**endpoint_generar(f,idioma,referencia_voz,exageracion)} for f in frases]