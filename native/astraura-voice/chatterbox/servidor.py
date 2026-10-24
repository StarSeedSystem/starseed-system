#!/usr/bin/env python3
"""Servidor local Chatterbox TTS — StarSeed OS · VZR1011Ab. MIT (github.com/resemble-ai/chatterbox)."""
import argparse
import importlib.util
import os, time, threading, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional, Dict, List, Any, Tuple
from urllib.parse import urlparse

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
# Memoria libre por debajo de la cual ni se intenta cargar el modelo (8 GB justos).
MEMORIA_MINIMA_MB = int(os.environ.get("CHATTERBOX_MEMORIA_MIN_MB", "1024"))
# Tope del cuerpo JSON aceptado por POST /generar (el texto de un chat cabe de sobra).
MAX_CUERPO_BYTES = 256 * 1024
# Orígenes web que pueden llamar al servicio local (CORS); el resto no recibe permiso.
ORIGENES_FIJOS = {"https://starseed-os.vercel.app", "tauri://localhost", "http://tauri.localhost"}
_CARGA_LOCK = threading.Lock()

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


def paquete_chatterbox_instalado() -> bool:
    """¿Está instalado el paquete `chatterbox-tts`? No lo importa ni descarga nada."""
    try:
        return importlib.util.find_spec("chatterbox") is not None
    except (ImportError, ValueError):
        return False


def memoria_disponible_mb() -> Optional[int]:
    """Memoria libre del aparato en MB, si el sistema la sabe decir. Nunca lanza."""
    try:
        if "SC_AVPHYS_PAGES" in os.sysconf_names and "SC_PAGE_SIZE" in os.sysconf_names:
            paginas = os.sysconf("SC_AVPHYS_PAGES")
            tamano = os.sysconf("SC_PAGE_SIZE")
            return int(paginas * tamano // (1024 * 1024))
    except (ValueError, OSError):
        pass
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for linea in f:
                if linea.startswith("MemAvailable:"):
                    return int(linea.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    return None


def _rutas_cache_hf() -> List[str]:
    """Sitios donde Hugging Face guarda los pesos ya descargados."""
    rutas: List[str] = []
    for clave in ("HF_HUB_CACHE", "TRANSFORMERS_CACHE"):
        valor = os.environ.get(clave)
        if valor:
            rutas.append(valor)
    home = os.environ.get("HF_HOME")
    if home:
        rutas.append(os.path.join(home, "hub"))
    rutas.append(os.path.expanduser("~/.cache/huggingface/hub"))
    rutas.append(os.path.expanduser("~/Library/Caches/huggingface/hub"))
    return rutas


def pesos_en_cache() -> bool:
    """¿Hay pesos de Chatterbox ya en disco? Si no, este servicio NO los descarga solo."""
    if os.environ.get("CHATTERBOX_PERMITIR_DESCARGA", "0") == "1":
        return True
    ruta_local = os.environ.get("CHATTERBOX_PESOS")
    if ruta_local and os.path.isdir(ruta_local) and os.listdir(ruta_local):
        return True
    for ruta in _rutas_cache_hf():
        try:
            for nombre in os.listdir(ruta):
                if "chatterbox" in nombre.lower() and os.path.isdir(os.path.join(ruta, nombre)):
                    return True
        except OSError:
            continue
    return False


def disponibilidad_modelo() -> Tuple[bool, Optional[str]]:
    """¿Se puede sintetizar de verdad ahora mismo? Devuelve (disponible, motivo)."""
    if not TORCH_DISPONIBLE:
        return False, "torch no está instalado"
    if not paquete_chatterbox_instalado():
        return False, "chatterbox-tts no está instalado"
    if not NUMPY_DISPONIBLE or not SCIPY_DISPONIBLE:
        return False, "faltan numpy o scipy para convertir el audio a WAV"
    libre = memoria_disponible_mb()
    if libre is not None and libre < MEMORIA_MINIMA_MB:
        return False, f"memoria insuficiente: {libre} MB libres (mínimo {MEMORIA_MINIMA_MB} MB)"
    if not pesos_en_cache():
        return False, (
            "los pesos no están en la caché local y este servicio no los descarga solo "
            "(define CHATTERBOX_PERMITIR_DESCARGA=1 para permitirlo)"
        )
    return True, None


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
    Nunca descarga pesos: si no están en disco devuelve el modo simulado con el motivo.
    """
    global ULTIMO_USO, MODELOS_CARGADOS
    ULTIMO_USO = time.time()

    # Clave única para el modelo: tipo + idioma + dispositivo
    dispositivo = detectar_dispositivo()
    clave = f"chatterbox:{modelo_type}:{idioma}:{dispositivo}"
    if clave in MODELOS_CARGADOS:
        return MODELOS_CARGADOS[clave]

    disponible, motivo = disponibilidad_modelo()
    if not disponible:
        return {
            "simulado": True,
            "tipo": modelo_type,
            "idioma": idioma,
            "dispositivo": dispositivo,
            "razon": motivo or "modelo no disponible",
        }

    with _CARGA_LOCK:
        if clave in MODELOS_CARGADOS:
            return MODELOS_CARGADOS[clave]
        try:
            # Intentamos importar y usar el modelo real de Chatterbox
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            # Para modelos en inglés, usar las variantes específicas
            if modelo_type in MODELOS_TURBO.values() or modelo_type in MODELOS_NANO.values():
                if idioma != "en":
                    # Estos modelos solo soportan inglés: multilingüe como respaldo
                    modelo_type = "v3"

            MODELOS_CARGADOS[clave] = ChatterboxMultilingualTTS.from_pretrained(
                device=dispositivo,
                t3_model=modelo_type,
            )
        except ImportError:
            MODELOS_CARGADOS[clave] = {
                "simulado": True,
                "tipo": modelo_type,
                "idioma": idioma,
                "dispositivo": dispositivo,
                "razon": "chatterbox-tts no está instalado",
            }
        except Exception as e:
            # Otros errores (por ejemplo, problemas de conexión o GPU)
            MODELOS_CARGADOS[clave] = {
                "simulado": True,
                "tipo": modelo_type,
                "idioma": idioma,
                "dispositivo": dispositivo,
                "razon": f"Error al cargar el modelo: {str(e)}",
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
    Endpoint GET /salud: responde al instante y sin cargar ni descargar el modelo.
    `disponible` dice si /generar podrá sintetizar de verdad; si no, `motivo` lo explica.
    """
    disponible, motivo = disponibilidad_modelo()
    return {
        "dispositivo": detectar_dispositivo(),
        "modelos_cargados": list(MODELOS_CARGADOS.keys()),
        "marca_agua_perth": PERTH_WATERMARK,
        "estado": "activo",
        "disponible": disponible,
        "motivo": motivo,
        "memoria_libre_mb": memoria_disponible_mb(),
        "pesos_en_cache": pesos_en_cache(),
    }

def endpoint_generar(texto: str, idioma: str = "es", referencia_voz: Optional[str] = None,
                     exageracion: float = 0.5, cfg_weight: Optional[float] = None) -> Dict[str, Any]:
    """
    Endpoint POST /generar
    Genera audio completo para el texto proporcionado. Si el modelo no está
    disponible devuelve `audio_base64: None` y el motivo, sin cargar ni descargar nada.
    """
    inicio_total = time.time()
    cfg = cfg_weight if isinstance(cfg_weight, (int, float)) else exageracion

    resultado: Dict[str, Any] = {
        "texto": texto,
        "idioma": idioma,
        "referencia_voz": referencia_voz,
        "exageracion": exageracion,
        "cfg_weight": cfg,
        "dispositivo": detectar_dispositivo(),
        "marca_agua_perth": PERTH_WATERMARK,
        "tiempo_carga_s": 0.0,
        "tiempo_generacion_s": 0.0,
        "factor_tiempo_real": 0.0,
        "audio_base64": None,
    }

    disponible, motivo = disponibilidad_modelo()
    if not disponible:
        resultado["motivo"] = motivo
        resultado["mensaje"] = f"Marca de agua Perth conservada. Modelo no disponible: {motivo}."
        resultado["tiempo_total_s"] = time.time() - inicio_total
        return resultado

    # Determinar modelo apropiado para el idioma y medir su carga
    modelo_type = determinar_modelo(idioma)
    inicio_carga = time.time()
    modelo = cargar_modelo(modelo_type, idioma)
    resultado["tiempo_carga_s"] = time.time() - inicio_carga

    if isinstance(modelo, dict) and modelo.get("simulado", False):
        resultado["motivo"] = modelo.get("razon") or "modelo simulado"
        resultado["mensaje"] = (
            "Marca de agua Perth conservada. "
            f"Modelo no disponible: {resultado['motivo']}."
        )
        resultado["tiempo_total_s"] = time.time() - inicio_total
        return resultado

    inicio_generacion = time.time()
    try:
        # - exaggeration: controla la expresividad (0.0-1.0, default 0.5)
        # - cfg_weight: peso de la guía clasificadora (0.0-1.0, default 0.5)
        wav = modelo.generate(
            texto,
            language_id=idioma,
            audio_prompt_path=referencia_voz,
            exaggeration=exageracion,
            cfg_weight=cfg,
        )

        wav_bytes = generar_audio_wav(wav)
        resultado["audio_base64"] = base64.b64encode(wav_bytes).decode("utf-8")
        resultado["mensaje"] = "Marca de agua Perth conservada. Audio generado por Chatterbox."
        tiempo_generacion = time.time() - inicio_generacion
        resultado["tiempo_generacion_s"] = tiempo_generacion

        # Factor de tiempo real: duración del audio / tiempo de generación
        if hasattr(wav, "shape"):
            duration_samples = wav.shape[-1] if len(wav.shape) > 0 else len(wav)
            audio_duration = duration_samples / 24000  # Chatterbox usa 24 kHz
            resultado["factor_tiempo_real"] = (
                audio_duration / tiempo_generacion if tiempo_generacion > 0 else 0.0
            )
    except Exception as e:
        resultado["audio_base64"] = None
        resultado["motivo"] = f"error de generación: {e}"
        resultado["mensaje"] = f"Error en generación: {e}. Verifique la instalación de chatterbox-tts."
        resultado["tiempo_generacion_s"] = 0.0
        resultado["factor_tiempo_real"] = 0.0

    resultado["tiempo_total_s"] = time.time() - inicio_total
    return resultado

def endpoint_generar_stream(frases: List[str], idioma: str = "es",
                           referencia_voz: Optional[str] = None,
                           exageracion: float = 0.5,
                           cfg_weight: Optional[float] = None) -> List[Dict[str, Any]]:
    """
    Endpoint POST /generar/stream
    Genera audio por frases, devolviendo resultados individuales para cada frase.
    """
    resultados = []
    for frase in frases:
        resultado = endpoint_generar(frase, idioma, referencia_voz, exageracion, cfg_weight)
        resultado["frase"] = frase
        resultados.append(resultado)
    return resultados


# ── Servidor HTTP local (solo 127.0.0.1) ─────────────────────────────────────

def _origen_permitido(origen: Optional[str]) -> bool:
    """Orígenes web con permiso CORS: la nube del OS, Tauri y cualquier localhost."""
    if not origen:
        return False
    if origen in ORIGENES_FIJOS:
        return True
    try:
        u = urlparse(origen)
        return u.scheme in ("http", "https") and u.hostname in ("localhost", "127.0.0.1", "::1")
    except ValueError:
        return False


class ManejadorChatterbox(BaseHTTPRequestHandler):
    """GET /salud · POST /generar · POST /generar/stream. Escucha solo en 127.0.0.1."""

    server_version = "ChatterboxLocal/1.0"
    protocol_version = "HTTP/1.1"
    timeout = 30

    def log_message(self, formato: str, *args: Any) -> None:
        """Silencio: el latido de salud no llena la terminal cada minuto."""
        return

    def _enviar_json(self, codigo: int, cuerpo: Dict[str, Any]) -> None:
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        origen = self.headers.get("Origin")
        if _origen_permitido(origen):
            self.send_header("Access-Control-Allow-Origin", origen or "")
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(datos)

    def _leer_json(self) -> Dict[str, Any]:
        try:
            largo = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            raise ValueError("Content-Length inválido")
        if largo <= 0:
            raise ValueError("cuerpo JSON vacío")
        if largo > MAX_CUERPO_BYTES:
            raise ValueError("cuerpo demasiado grande")
        try:
            datos = json.loads(self.rfile.read(largo).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("JSON inválido")
        if not isinstance(datos, dict):
            raise ValueError("el cuerpo debe ser un objeto JSON")
        return datos

    def _parametros(
        self, datos: Dict[str, Any], requiere_texto: bool = True
    ) -> Tuple[str, str, Optional[str], float, Optional[float]]:
        texto = datos.get("texto")
        if requiere_texto and (not isinstance(texto, str) or not texto.strip()):
            raise ValueError("texto vacío")
        idioma = datos.get("idioma")
        if not isinstance(idioma, str) or not idioma.strip():
            idioma = "es"
        referencia = datos.get("referencia_voz")
        referencia = referencia if isinstance(referencia, str) and referencia else None
        exageracion = datos.get("exageracion", 0.5)
        exageracion = float(exageracion) if isinstance(exageracion, (int, float)) else 0.5
        cfg = datos.get("cfg_weight")
        cfg = float(cfg) if isinstance(cfg, (int, float)) else None
        limpio = texto.strip() if isinstance(texto, str) else ""
        return limpio, idioma, referencia, exageracion, cfg

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Content-Length", "0")
        origen = self.headers.get("Origin")
        if _origen_permitido(origen):
            self.send_header("Access-Control-Allow-Origin", origen or "")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/salud":
            self._enviar_json(404, {"error": "ruta desconocida"})
            return
        descargar_modelos_inactivos()
        self._enviar_json(200, endpoint_salud())

    def do_POST(self) -> None:
        ruta = urlparse(self.path).path
        if ruta not in ("/generar", "/generar/stream"):
            self._enviar_json(404, {"error": "ruta desconocida"})
            return
        try:
            datos = self._leer_json()
            if ruta == "/generar":
                self._responder_generar(datos)
            else:
                self._responder_stream(datos)
        except ValueError as e:
            self._enviar_json(400, {"error": str(e)})
        except Exception as e:  # una petición mala no tumba el servicio
            self._enviar_json(500, {"error": f"fallo interno: {e}"})

    def _responder_generar(self, datos: Dict[str, Any]) -> None:
        texto, idioma, referencia, exageracion, cfg = self._parametros(datos)
        resultado = endpoint_generar(texto, idioma, referencia, exageracion, cfg)
        if not resultado.get("audio_base64"):
            self._enviar_json(503, resultado)
            return
        self._enviar_json(200, resultado)

    def _responder_stream(self, datos: Dict[str, Any]) -> None:
        frases = datos.get("frases")
        if not isinstance(frases, list) or not frases:
            raise ValueError("frases debe ser una lista no vacía")
        _, idioma, referencia, exageracion, cfg = self._parametros(datos, requiere_texto=False)
        frases_limpias = [f.strip() for f in frases if isinstance(f, str) and f.strip()]
        if not frases_limpias:
            raise ValueError("frases no contiene texto")
        resultados = endpoint_generar_stream(frases_limpias, idioma, referencia, exageracion, cfg)
        if any(not r.get("audio_base64") for r in resultados):
            self._enviar_json(503, {"resultados": resultados, "motivo": resultados[0].get("motivo")})
            return
        self._enviar_json(200, {"resultados": resultados})


class ServidorChatterbox(ThreadingHTTPServer):
    """Servidor multihilo local; jamás se enlaza a otra interfaz que no sea 127.0.0.1."""

    daemon_threads = True
    allow_reuse_address = True


def crear_servidor(puerto: int = PORT) -> ThreadingHTTPServer:
    """Crea y enlaza el servidor HTTP local. Puerto 0 pide uno libre al sistema."""
    puerto = int(puerto)
    if not 0 <= puerto <= 65535:
        raise ValueError(f"puerto fuera de rango: {puerto}")
    return ServidorChatterbox((HOST, puerto), ManejadorChatterbox)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Servicio local Chatterbox TTS (127.0.0.1)")
    parser.add_argument("--puerto", "-p", type=int, default=PORT,
                        help=f"puerto de escucha en 127.0.0.1 (por defecto {PORT})")
    args = parser.parse_args(argv)

    servidor = crear_servidor(args.puerto)
    disponible, motivo = disponibilidad_modelo()
    aviso = "sí" if disponible else f"no ({motivo})"
    print(
        f"Chatterbox local en http://{HOST}:{servidor.server_address[1]} · modelo disponible: {aviso}",
        flush=True,
    )
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
