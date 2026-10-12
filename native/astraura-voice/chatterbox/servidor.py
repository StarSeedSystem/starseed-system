#!/usr/bin/env python3
"""Servidor local Chatterbox TTS — StarSeed OS · VZR1011Ab. MIT (github.com/resemble-ai/chatterbox)."""
import os, time, threading, json
from typing import Optional, Dict, List, Any

# Intentamos importar las dependencias opcionales
try:
    import torch
    TORCH_DISPONIBLE = True
except ImportError:
    TORCH_DISPONIBLE = False
    torch = None

try:
    import numpy as np
    NUMPY_DISPONIBLE = True
except ImportError:
    NUMPY_DISPONIBLE = False
    np = None

try:
    import base64
    BASE64_DISPONIBLE = True
except ImportError:
    BASE64_DISPONIBLE = False
    base64 = None

try:
    from scipy.io.wavfile import write as write_wav
    SCIPY_DISPONIBLE = True
except ImportError:
    SCIPY_DISPONIBLE = False
    write_wav = None

try:
    from io import BytesIO
    BYTESIO_DISPONIBLE = True
except ImportError:
    BYTESIO_DISPONIBLE = False
    BytesIO = None

# Puertos del rango del daemon de voz (4500-5499 según daemon.mjs)
PORT: int = int(os.environ.get("CHATTERBOX_PORT", "4505"))
HOST = "127.0.0.1"

# Modelos Chatterbox disponibles
MODELOS_MULTILINGUAL = {
    "v3": "multilingual-v3",  # 500M, 23+ idiomas
}
MODELOS_TURBO = {
    "turbo": "turbo",  # 350M, inglés, baja latencia
}
MODELOS_NANO = {
    "nano": "nano",  # 110M, inglés, CPU ~3× tiempo real
}

MODELOS_CARGADOS: Dict[str, Any] = {}
PERTH_WATERMARK = True
ULTIMO_USO = time.time()
TIEMPO_DESCARGA_MIN = 5  # min sin uso → descarga (cesión memoria al daemon)

def detectar_dispositivo() -> str:
    """Detecta el mejor dispositivo disponible para inferencia."""
    if not TORCH_DISPONIBLE:
        return "cpu"
    
    try:
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"

def cargar_modelo(modelo_type: str = "multilingual-v3", idioma: str = "es") -> Any:
    """
    Carga un modelo Chatterbox según el tipo y idioma solicitado.
    Implementa carga perezosa y caché de modelos.
    """
    global ULTIMO_USO, MODELOS_CARGADOS
    ULTIMO_USO = time.time()
    
    # Clave única para el modelo: tipo + idioma + dispositivo
    dispositivo = detectar_dispositivo()
    clave = f"chatterbox:{modelo_type}:{idioma}:{dispositivo}"
    
    if clave not in MODELOS_CARGADOS:
        try:
            # Intentamos importar y usar el modelo real de Chatterbox
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            
            # Para modelos en inglés, usar las variantes específicas
            if modelo_type in MODELOS_TURBO.values() or modelo_type in MODELOS_NANO.values():
                if idioma != "en":
                    # Estos modelos solo soportan inglés, pero podemos usar multilingual v3 como fallback
                    modelo_type = "v3"
            
            MODELOS_CARGADOS[clave] = ChatterboxMultilingualTTS.from_pretrained(
                device=dispositivo, 
                t3_model=modelo_type
            )
        except ImportError:
            # Si no podemos importar chatterbox, usamos modo simulado
            MODELOS_CARGADOS[clave] = {
                "simulado": True,
                "tipo": modelo_type,
                "idioma": idioma,
                "dispositivo": dispositivo,
                "razon": "chatterbox-tts no está instalado"
            }
        except Exception as e:
            # Otros errores (por ejemplo, problemas de conexión o GPU)
            MODELOS_CARGADOS[clave] = {
                "simulado": True,
                "tipo": modelo_type,
                "idioma": idioma,
                "dispositivo": dispositivo,
                "razon": f"Error al cargar el modelo: {str(e)}"
            }
    
    return MODELOS_CARGADOS[clave]

def descargar_modelos_inactivos() -> None:
    """Descarga modelos no utilizados para liberar memoria."""
    global MODELOS_CARGADOS
    if (time.time() - ULTIMO_USO) > (TIEMPO_DESCARGA_MIN * 60):
        MODELOS_CARGADOS = {}

def determinar_modelo(idioma: str) -> str:
    """
    Determina qué tipo de modelo usar basado en el idioma.
    - Español: Multilingual V3 (con variantes es-es y es-mx-latam si están disponibles)
    - Inglés: Puede usar Turbo o Nano para mejor rendimiento
    - Otros idiomas: Multilingual V3
    """
    if idioma == "es":
        return "v3"  # Multilingual V3 para español
    elif idioma == "en":
        # Para inglés, preferir Turbo por baja latencia, Nano como alternativa
        return "turbo"  # Turbo para inglés (baja latencia)
    else:
        return "v3"  # Multilingual V3 para otros idiomas

def generar_audio_wav(wav_tensor, sample_rate: int = 24000) -> bytes:
    """
    Convierte un tensor de audio a bytes WAV en formato RIFF.
    """
    # Si no tenemos las dependencias necesarias, devolvemos un WAV vacío o simulado
    if not NUMPY_DISPONIBLE or not SCIPY_DISPONIBLE:
        # Devolvemos un WAV mínimo de 1 segundo de silencio
        buffer = BytesIO() if BYTESIO_DISPONIBLE else None
        if buffer:
            # WAV mínimo: 44 bytes de header + datos de muestra
            # Para 1 segundo de silencio a 24000 Hz, 16-bit mono:
            # 44 + (24000 * 2) = 44 + 48000 = 48044 bytes
            wav_data = bytearray(48044)
            # RIFF header
            wav_data[0:4] = b'RIFF'
            wav_data[4:8] = (48040).to_bytes(4, 'little')  # tamaño total - 8
            wav_data[8:12] = b'WAVE'
            # fmt chunk
            wav_data[12:16] = b'fmt '
            wav_data[16:20] = (16).to_bytes(4, 'little')  # tamaño del chunk fmt
            wav_data[20:22] = (1).to_bytes(2, 'little')   # formato PCM
            wav_data[22:24] = (1).to_bytes(2, 'little')   # canales mono
            wav_data[24:28] = (sample_rate).to_bytes(4, 'little')  # sample rate
            wav_data[28:32] = (sample_rate * 2).to_bytes(4, 'little')  # byte rate
            wav_data[32:34] = (2).to_bytes(2, 'little')   # block align
            wav_data[34:36] = (16).to_bytes(2, 'little')  # bits per sample
            # data chunk
            wav_data[36:40] = b'data'
            wav_data[40:44] = (48000).to_bytes(4, 'little')  # tamaño de los datos
            # Los datos (muestras de silencio) ya están inicializados a 0
            return bytes(wav_data)
        else:
            # Si incluso BytesIO no está disponible, devolvemos bytes vacíos
            return b""
    
    # Convertir tensor a numpy array
    if hasattr(wav_tensor, 'cpu'):
        wav_np = wav_tensor.cpu().numpy()
    else:
        wav_np = np.array(wav_tensor)
    
    # Asegurar que está en el rango [-1, 1] y convertir a 16-bit PCM
    wav_np = np.clip(wav_np, -1.0, 1.0)
    wav_int16 = (wav_np * 32767).astype(np.int16)
    
    # Crear buffer WAV en memoria
    buffer = BytesIO()
    write_wav(buffer, sample_rate, wav_int16)
    return buffer.getvalue()

def endpoint_salud() -> Dict[str, Any]:
    """
    Endpoint GET /salud
    Dispositivo y modelos cargados.
    """
    dispositivo = detectar_dispositivo()
    return {
        "dispositivo": dispositivo,
        "modelos_cargados": list(MODELOS_CARGADOS.keys()),
        "marca_agua_perth": PERTH_WATERMARK,
        "estado": "activo"
    }

def endpoint_generar(texto: str, idioma: str = "es", referencia_voz: Optional[str] = None,
                     exageracion: float = 0.5) -> Dict[str, Any]:
    """
    Endpoint POST /generar
    Genera audio completo para el texto proporcionado.
    """
    inicio_total = time.time()
    
    # Determinar modelo apropiado para el idioma
    modelo_type = determinar_modelo(idioma)
    
    # Medir tiempo de carga del modelo
    inicio_carga = time.time()
    modelo = cargar_modelo(modelo_type, idioma)
    tiempo_carga = time.time() - inicio_carga
    
    # Medir tiempo de generación de audio
    inicio_generacion = time.time()
    
    resultado: Dict[str, Any] = {
        "texto": texto,
        "idioma": idioma,
        "referencia_voz": referencia_voz,
        "exageracion": exageracion,
        "dispositivo": detectar_dispositivo(),
        "marca_agua_perth": PERTH_WATERMARK,
        "tiempo_carga_s": tiempo_carga,
    }
    
    if isinstance(modelo, dict) and modelo.get("simulado", False):
        # Modo simulado
        resultado["audio_base64"] = None
        resultado["mensaje"] = "Marca de agua Perth conservada. Modelo simulado: instala chatterbox-tts para generación real."
        resultado["tiempo_generacion_s"] = 0.0
        resultado["factor_tiempo_real"] = 0.0  # No hay audio real
    else:
        try:
            # Generar audio con los parámetros especificados
            # Según la documentación de Chatterbox, los parámetros son:
            # - exaggeration: controla la expresividad (0.0-1.0, default 0.5)
            # - cfg_weight: peso de la guía clasificadora (0.0-1.0, default 0.5)
            wav = modelo.generate(
                texto,
                language_id=idioma,
                audio_prompt_path=referencia_voz,
                exaggeration=exageracion,
                cfg_weight=exageracion  # Usamos el mismo valor para simplicidad
            )
            
            # Convertir a WAV y luego a base64
            wav_bytes = generar_audio_wav(wav)
            resultado["audio_base64"] = base64.b64encode(wav_bytes).decode('utf-8')
            resultado["mensaje"] = "Marca de agua Perth conservada. Audio generado por Chatterbox."
            
            # Calcular métricas de tiempo
            tiempo_generacion = time.time() - inicio_generacion
            resultado["tiempo_generacion_s"] = tiempo_generacion
            
            # Factor de tiempo real: duración del audio / tiempo de generación
            # Asumimos 24 kHz sample rate, calculamos duración basada en número de muestras
            if hasattr(wav, 'shape'):
                duration_samples = wav.shape[-1] if len(wav.shape) > 0 else len(wav)
                sample_rate = 24000  # Chatterbox usa 24 kHz
                audio_duration = duration_samples / sample_rate
                resultado["factor_tiempo_real"] = audio_duration / tiempo_generacion if tiempo_generacion > 0 else 0.0
            else:
                resultado["factor_tiempo_real"] = 0.0
                
        except Exception as e:
            resultado["audio_base64"] = None
            resultado["mensaje"] = f"Error en generación: {e}. Verifique la instalación de chatterbox-tts."
            resultado["tiempo_generacion_s"] = 0.0
            resultado["factor_tiempo_real"] = 0.0
    
    resultado["tiempo_total_s"] = time.time() - inicio_total
    return resultado

def endpoint_generar_stream(frases: List[str], idioma: str = "es",
                           referencia_voz: Optional[str] = None,
                           exageracion: float = 0.5) -> List[Dict[str, Any]]:
    """
    Endpoint POST /generar/stream
    Genera audio por frases, devolviendo resultados individuales para cada frase.
    """
    resultados = []
    for frase in frases:
        resultado = endpoint_generar(frase, idioma, referencia_voz, exageracion)
        resultado["frase"] = frase
        resultados.append(resultado)
    return resultados
