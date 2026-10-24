#!/usr/bin/env python3
"""Servidor HTTP local Chatterbox TTS — StarSeed OS · VOZ1024C.

Referencia del motor: https://github.com/resemble-ai/chatterbox (MIT).

Contrato EXACTO que espera `src/lib/aurora/tts-oss/chatterbox.ts`:
  GET  /salud   → 200 {disponible, dispositivo, motivo?, modelos_cargados,
                        marca_agua_perth, estado}
  POST /generar → JSON {texto, idioma?, referencia_voz?, exageracion?, cfg_weight?}
                  → 200 {audio_base64 (WAV RIFF), factor_tiempo_real, ...}
                  → 503 {disponible: false, motivo} si no hay paquete o memoria,
                    SIN descargar pesos y SIN colgarse.
  POST /generar/stream → lista de resultados por frase.

Solo escucha en 127.0.0.1. Puerto: `--puerto N`, `-p N`, argumento posicional,
`CHATTERBOX_PORT` o 4505. Nunca descarga modelos por su cuenta: si los pesos no
están en disco (o no se autorizó con `CHATTERBOX_PERMITIR_DESCARGA=1`), /salud
lo dice y /generar responde 503 al instante.
"""

import argparse
import base64
import importlib.util
import io
import json
import os
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

HOST = "127.0.0.1"
PORT: int = int(os.environ.get("CHATTERBOX_PORT", "4505"))
MUESTREO_HZ = 24000
PERTH_WATERMARK = True
TIEMPO_DESCARGA_MIN = 5
MAX_CUERPO = 128 * 1024
MEMORIA_MIN_MB = int(os.environ.get("CHATTERBOX_MEM_MIN_MB", "2500"))

MODELOS_MULTILINGUAL = {"v3": "multilingual-v3"}
MODELOS_TURBO = {"turbo": "turbo"}
MODELOS_NANO = {"nano": "nano"}

MODELOS_CARGADOS: Dict[str, Any] = {}
ULTIMO_USO = time.time()
_ERROR_CARGA: Optional[str] = None
_CANDADO = threading.Lock()


def _modulo_instalado(nombre: str) -> bool:
    """¿Está instalado el módulo, sin importarlo (importar torch cuesta memoria)?"""
    try:
        return importlib.util.find_spec(nombre) is not None
    except (ImportError, ValueError):
        return False


def memoria_disponible_mb() -> Optional[int]:
    """Memoria libre estimada en MB; None si el sistema no la expone."""
    try:
        import psutil  # type: ignore

        return int(psutil.virtual_memory().available / (1024 * 1024))
    except Exception:
        pass
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as fichero:
            for linea in fichero:
                if linea.startswith("MemAvailable:"):
                    return int(linea.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    try:
        paginas = os.sysconf("SC_AVPHYS_PAGES")
        tamano = os.sysconf("SC_PAGE_SIZE")
        return int(paginas * tamano / (1024 * 1024))
    except (AttributeError, ValueError, OSError):
        return None


def pesos_en_disco() -> bool:
    """¿Hay pesos de Chatterbox ya descargados (o el usuario autorizó bajarlos)?"""
    if os.environ.get("CHATTERBOX_PERMITIR_DESCARGA", "").strip() == "1":
        return True
    raices = [
        os.environ.get("HF_HUB_CACHE"),
        os.environ.get("HUGGINGFACE_HUB_CACHE"),
        os.path.join(os.environ.get("HF_HOME", ""), "hub") if os.environ.get("HF_HOME") else None,
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub"),
    ]
    for raiz in raices:
        if not raiz:
            continue
        try:
            if any("chatterbox" in nombre.lower() for nombre in os.listdir(raiz)):
                return True
        except OSError:
            continue
    return False


def motivo_no_disponible() -> Optional[str]:
    """Motivo honesto por el que este servicio no puede sintetizar ahora mismo."""
    if not _modulo_instalado("chatterbox"):
        return "chatterbox-tts no está instalado (pip install chatterbox-tts); no se descargan modelos solos"
    if _ERROR_CARGA:
        return _ERROR_CARGA
    if not pesos_en_disco():
        return "pesos de Chatterbox no descargados; define CHATTERBOX_PERMITIR_DESCARGA=1 para autorizar la primera descarga"
    disponible = memoria_disponible_mb()
    if disponible is not None and disponible < MEMORIA_MIN_MB:
        return f"memoria insuficiente: {disponible} MB libres < {MEMORIA_MIN_MB} MB; se cede la memoria al enjambre"
    return None


def disponible() -> bool:
    return motivo_no_disponible() is None


def detectar_dispositivo() -> str:
    """Mejor dispositivo disponible para inferencia, sin importar torch si falta."""
    if not _modulo_instalado("torch"):
        return "cpu"
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def determinar_modelo(idioma: str) -> str:
    """Español/otros → multilingüe v3; inglés → turbo (baja latencia)."""
    return "turbo" if idioma == "en" else "v3"


def cargar_modelo(modelo_type: str = "v3", idioma: str = "es") -> Any:
    """Carga perezosa y cacheada. Devuelve un marcador si no se puede cargar."""
    global ULTIMO_USO, _ERROR_CARGA
    ULTIMO_USO = time.time()
    motivo = motivo_no_disponible()
    if motivo:
        return {"simulado": True, "disponible": False, "motivo": motivo}
    dispositivo = detectar_dispositivo()
    clave = f"chatterbox:{modelo_type}:{idioma}:{dispositivo}"
    with _CANDADO:
        if clave in MODELOS_CARGADOS:
            return MODELOS_CARGADOS[clave]
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # type: ignore

            modelo = ChatterboxMultilingualTTS.from_pretrained(
                device=dispositivo,
                t3_model=modelo_type,
            )
            MODELOS_CARGADOS[clave] = modelo
            _ERROR_CARGA = None
            return modelo
        except Exception as error:  # noqa: BLE001 — jamás tumba el servidor
            _ERROR_CARGA = f"no se pudo cargar el modelo Chatterbox: {error}"
            MODELOS_CARGADOS[clave] = {
                "simulado": True,
                "disponible": False,
                "motivo": _ERROR_CARGA,
            }
            return MODELOS_CARGADOS[clave]


def descargar_modelos_inactivos() -> None:
    """Libera modelos tras 5 minutos sin uso (cesión de memoria al enjambre)."""
    global MODELOS_CARGADOS
    if (time.time() - ULTIMO_USO) > (TIEMPO_DESCARGA_MIN * 60):
        with _CANDADO:
            MODELOS_CARGADOS = {}


def _muestras(wav_tensor: Any) -> List[float]:
    """Tensor/numpy/lista → lista de floats en [-1, 1]."""
    datos = wav_tensor
    if hasattr(datos, "detach"):
        datos = datos.detach().cpu()
    if hasattr(datos, "numpy"):
        datos = datos.numpy()
    try:
        import numpy as np  # type: ignore

        return np.asarray(datos, dtype="float32").reshape(-1).tolist()
    except Exception:
        pass
    if hasattr(datos, "tolist"):
        datos = datos.tolist()
    if isinstance(datos, (list, tuple)) and datos and isinstance(datos[0], (list, tuple)):
        datos = [valor for fila in datos for valor in fila]
    return [float(valor) for valor in datos]


def generar_audio_wav(wav_tensor: Any, sample_rate: int = MUESTREO_HZ) -> bytes:
    """Convierte la salida del modelo a bytes WAV RIFF mono 16 bits (sin scipy)."""
    muestras = _muestras(wav_tensor)
    pcm = bytearray()
    for valor in muestras:
        acotado = max(-1.0, min(1.0, valor))
        pcm += int(acotado * 32767).to_bytes(2, "little", signed=True)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as salida:
        salida.setnchannels(1)
        salida.setsampwidth(2)
        salida.setframerate(sample_rate)
        salida.writeframes(bytes(pcm))
    return buffer.getvalue()


def endpoint_salud() -> Dict[str, Any]:
    """GET /salud — estado real del servicio y de sus dependencias."""
    motivo = motivo_no_disponible()
    salud: Dict[str, Any] = {
        "dispositivo": detectar_dispositivo(),
        "disponible": motivo is None,
        "modelos_cargados": list(MODELOS_CARGADOS.keys()),
        "marca_agua_perth": PERTH_WATERMARK,
        "estado": "activo",
        "memoria_libre_mb": memoria_disponible_mb(),
    }
    if motivo:
        salud["motivo"] = motivo
    return salud


def endpoint_generar(
    texto: str,
    idioma: str = "es",
    referencia_voz: Optional[str] = None,
    exageracion: float = 0.5,
    cfg_weight: Optional[float] = None,
) -> Dict[str, Any]:
    """POST /generar — un WAV completo en base64, o el motivo por el que no hay."""
    inicio = time.time()
    cfg = exageracion if cfg_weight is None else cfg_weight
    resultado: Dict[str, Any] = {
        "texto": texto,
        "idioma": idioma,
        "referencia_voz": referencia_voz,
        "exageracion": exageracion,
        "cfg_weight": cfg,
        "dispositivo": detectar_dispositivo(),
        "marca_agua_perth": PERTH_WATERMARK,
        "audio_base64": None,
        "factor_tiempo_real": 0.0,
        "tiempo_carga_s": 0.0,
        "tiempo_generacion_s": 0.0,
    }
    motivo = motivo_no_disponible()
    if motivo:
        resultado["disponible"] = False
        resultado["motivo"] = motivo
        resultado["mensaje"] = f"Sin audio: {motivo}. Marca de agua Perth conservada."
        resultado["tiempo_total_s"] = time.time() - inicio
        return resultado

    inicio_carga = time.time()
    modelo = cargar_modelo(determinar_modelo(idioma), idioma)
    resultado["tiempo_carga_s"] = time.time() - inicio_carga
    if isinstance(modelo, dict) and modelo.get("simulado"):
        motivo = str(modelo.get("motivo") or "modelo no disponible")
        resultado["disponible"] = False
        resultado["motivo"] = motivo
        resultado["mensaje"] = f"Sin audio: {motivo}. Marca de agua Perth conservada."
        resultado["tiempo_total_s"] = time.time() - inicio
        return resultado

    inicio_generacion = time.time()
    try:
        wav = modelo.generate(
            texto,
            language_id=idioma,
            audio_prompt_path=referencia_voz,
            exaggeration=exageracion,
            cfg_weight=cfg,
        )
        wav_bytes = generar_audio_wav(wav)
        resultado["audio_base64"] = base64.b64encode(wav_bytes).decode("ascii")
        resultado["disponible"] = True
        resultado["mensaje"] = "Marca de agua Perth conservada. Audio generado por Chatterbox."
        duracion = max(0, len(wav_bytes) - 44) / (2 * MUESTREO_HZ)
        generacion = time.time() - inicio_generacion
        resultado["tiempo_generacion_s"] = generacion
        resultado["factor_tiempo_real"] = (duracion / generacion) if generacion > 0 else 0.0
    except Exception as error:  # noqa: BLE001 — se informa, no se tumba el servicio
        resultado["disponible"] = True
        resultado["mensaje"] = f"Error en generación: {error}"
        resultado["tiempo_generacion_s"] = time.time() - inicio_generacion
    resultado["tiempo_total_s"] = time.time() - inicio
    return resultado


def endpoint_generar_stream(
    frases: List[str],
    idioma: str = "es",
    referencia_voz: Optional[str] = None,
    exageracion: float = 0.5,
    cfg_weight: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """POST /generar/stream — un resultado por frase, con la misma marca de agua."""
    respuestas: List[Dict[str, Any]] = []
    for frase in frases:
        respuesta = endpoint_generar(frase, idioma, referencia_voz, exageracion, cfg_weight)
        respuesta["frase"] = frase
        respuestas.append(respuesta)
    return respuestas


def _flotante(valor: Any, defecto: float) -> float:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return defecto
    if numero != numero:  # NaN
        return defecto
    return max(0.0, min(1.0, numero))


def _origen_permitido(origen: Optional[str]) -> Optional[str]:
    if not origen:
        return None
    try:
        partes = urlsplit(origen)
    except ValueError:
        return None
    host = (partes.hostname or "").lower()
    if partes.scheme not in ("http", "https"):
        return None
    if host in ("localhost", "127.0.0.1", "::1") or host.endswith(".vercel.app"):
        return origen
    return None


class _Manejador(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ChatterboxLocal-VOZ1024C"

    def log_message(self, formato: str, *args: Any) -> None:
        pass

    def _cabeceras_cors(self) -> None:
        permitido = _origen_permitido(self.headers.get("Origin"))
        if permitido:
            self.send_header("Access-Control-Allow-Origin", permitido)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, estado: int, datos: Any) -> None:
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self._cabeceras_cors()
        self.end_headers()
        self.wfile.write(cuerpo)

    def _ruta(self) -> str:
        return urlsplit(self.path).path.rstrip("/") or "/"

    def _cuerpo_json(self) -> "tuple[Optional[Dict[str, Any]], Optional[str]]":
        cabecera = self.headers.get("Content-Length")
        if cabecera is None:
            return None, "falta Content-Length"
        try:
            largo = int(cabecera)
        except ValueError:
            return None, "Content-Length no es un entero"
        if largo < 0 or largo > MAX_CUERPO:
            return None, "cuerpo demasiado grande"
        bruto = self.rfile.read(largo)
        if len(bruto) != largo:
            return None, "cuerpo incompleto"
        try:
            datos = json.loads(bruto.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None, "JSON inválido"
        if not isinstance(datos, dict):
            return None, "se espera un objeto JSON"
        return datos, None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cabeceras_cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self._ruta() in ("/salud", "/"):
            self._json(200, endpoint_salud())
        else:
            self._json(404, {"error": "No encontrado", "rutas": ["/salud", "/generar"]})

    def do_POST(self) -> None:
        ruta = self._ruta()
        if ruta not in ("/generar", "/generar/stream"):
            self._json(404, {"error": "No encontrado", "rutas": ["/salud", "/generar"]})
            return
        datos, error = self._cuerpo_json()
        if error or datos is None:
            self._json(400, {"error": error or "cuerpo inválido"})
            return
        texto = str(datos.get("texto") or datos.get("text") or "").strip()
        idioma = str(datos.get("idioma") or "es").strip().lower().split("-")[0].split("_")[0] or "es"
        exageracion = _flotante(datos.get("exageracion"), 0.5)
        cfg_weight = _flotante(datos.get("cfg_weight"), 0.5)
        referencia = datos.get("referencia_voz")
        referencia_voz = referencia if isinstance(referencia, str) and referencia else None

        if ruta == "/generar/stream":
            frases = datos.get("frases")
            if not isinstance(frases, list) or not frases:
                self._json(400, {"error": "se espera 'frases' como lista no vacía"})
                return
            limpias = [str(frase).strip() for frase in frases if str(frase).strip()]
            if not limpias:
                self._json(400, {"error": "se espera 'frases' con texto"})
                return
        elif not texto:
            self._json(400, {"error": "falta 'texto'"})
            return

        motivo = motivo_no_disponible()
        if motivo:
            self._json(
                503,
                {
                    "disponible": False,
                    "motivo": motivo,
                    "error": motivo,
                    "marca_agua_perth": PERTH_WATERMARK,
                },
            )
            return

        if ruta == "/generar/stream":
            self._json(200, {"resultados": endpoint_generar_stream(limpias, idioma, referencia_voz, exageracion, cfg_weight)})
            return

        resultado = endpoint_generar(texto, idioma, referencia_voz, exageracion, cfg_weight)
        if resultado.get("audio_base64"):
            self._json(200, resultado)
        elif resultado.get("disponible") is False:
            self._json(503, resultado)
        else:
            self._json(500, resultado)


class _Servidor(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def puerto_configurado(argv: Optional[List[str]] = None) -> int:
    """Resuelve el puerto: argumento (--puerto/-p/posicional) > entorno > 4505."""
    analizador = argparse.ArgumentParser(description="Servicio local Chatterbox TTS (127.0.0.1)")
    analizador.add_argument("puerto_posicional", nargs="?", type=int, default=None)
    analizador.add_argument("--puerto", "--port", "-p", dest="puerto", type=int, default=None)
    argumentos, _ = analizador.parse_known_args(argv)
    elegido = argumentos.puerto if argumentos.puerto is not None else argumentos.puerto_posicional
    return PORT if elegido is None else elegido


def crear_servidor(puerto: Optional[int] = None, host: str = HOST) -> ThreadingHTTPServer:
    """Crea el servidor HTTP (puerto 0 = libre, útil en pruebas)."""
    return _Servidor((host, PORT if puerto is None else puerto), _Manejador)


def main(argv: Optional[List[str]] = None) -> int:
    puerto = puerto_configurado(argv)
    servidor = crear_servidor(puerto)
    real = servidor.server_address[1]
    print(f"Servidor Chatterbox en http://{HOST}:{real}", flush=True)
    motivo = motivo_no_disponible()
    print(f"Disponible: {'sí' if motivo is None else 'no'} — {motivo or 'modelo listo'}", flush=True)
    print("Ctrl+C para detener", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
