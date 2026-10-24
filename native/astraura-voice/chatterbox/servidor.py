#!/usr/bin/env python3
"""
Servidor local Chatterbox TTS — StarSeed OS · VZR1011A + VOZ1024C. Motor MIT (github.com/resemble-ai/chatterbox).

Levanta DE VERDAD un servidor HTTP (biblioteca estándar, `ThreadingHTTPServer`) que escucha SOLO en
127.0.0.1, en el puerto 4505 o el que se le dé por argumento. Antes (VZR1011A) este archivo solo
definía las funciones de los endpoints y nadie abría el puerto: el cliente
`src/lib/aurora/tts-oss/chatterbox.ts` lo encontraba siempre cerrado y saltaba a los Spaces públicos.

Contrato (el del cliente, `CHATTERBOX_LOCAL_BASE`, `saludLocalChatterbox` y `sintetizarLocal`):

  GET  /salud    200 {disponible: true, dispositivo: "cpu"|"mps"|"cuda", ...} si puede hablar.
                 503 {disponible: false, motivo, dispositivo, ...} si no puede (paquete sin instalar,
                 memoria que no alcanza, pesos que no están en la caché local). El cliente toma todo lo
                 que no sea 2xx como «no hay servicio local» y salta a los Spaces sin gastar un /generar.
  POST /generar  cuerpo JSON {texto, idioma?, exageracion?, cfg_weight?} con Content-Type application/json.
                 200 {audio_base64: WAV RIFF (PCM 16 bits, mono) en base64, factor_tiempo_real, ...}
                 400 cuerpo malo · 413 texto o cuerpo demasiado grandes · 415 no es JSON ·
                 503 sin motor, sin memoria u ocupado · 504 pasó del tiempo máximo · 500 el motor falló.
                 Nunca un 200 sin audio: el «modo simulado» que contestaba sin audio ya no existe.

Reglas del área que este archivo cumple:
  · Nunca descarga pesos por su cuenta: fuerza `HF_HUB_OFFLINE=1` antes de importar nada de Hugging
    Face, así que el modelo solo se carga si sus pesos ya están en la caché (los trae la persona, con
    permiso y comprobando el espacio; ver README).
  · Carga perezosa y una sola copia del modelo; se descarga tras `CHATTERBOX_INACTIVIDAD_S` sin uso
    para ceder la memoria (Mac de 8 GB con el enjambre vivo). Antes de cargar mide la memoria libre y
    la presión del sistema: si no cabe, lo dice y no lo intenta.
  · Límite de texto, de cuerpo y de tiempo por petición; una síntesis a la vez y, si está ocupado,
    503 a los pocos segundos (el cliente tiene 60 s de presupuesto y aún puede ir a los Spaces).
  · CORS con la MISMA lista de orígenes que el demonio de voz (`lib.mjs · isAllowedOrigin`), Host
    de loopback obligatorio (contra el «DNS rebinding») y nunca `Allow-Credentials`.
  · La clonación de voz no va por esta puerta: exige consentimiento (`src/lib/voces/clonacion.ts`).

Arranque: `python3 servidor.py [puerto] [--simulado]` (ver README). Pruebas: `test_servidor.py`.
"""
from __future__ import annotations

import argparse
import base64
import gc
import importlib.util
import io
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import wave
from array import array
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlsplit

# Nunca descargar pesos por nuestra cuenta: Hugging Face lee estas variables al importarse.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# ── Constantes ───────────────────────────────────────────────────────────────

HOST = "127.0.0.1"  # solo loopback, sin opción de cambiarlo
PUERTO_DEFECTO = 4505  # el que espera chatterbox.ts (rango del demonio de voz, ver daemon.mjs)


def _entero_env(nombre: str, defecto: int) -> int:
    try:
        return int(os.environ.get(nombre, "") or defecto)
    except ValueError:
        return defecto


def _real_env(nombre: str, defecto: float) -> float:
    try:
        return float(os.environ.get(nombre, "") or defecto)
    except ValueError:
        return defecto


TEXTO_MAX = _entero_env("CHATTERBOX_TEXTO_MAX", 1000)  # caracteres por petición
CUERPO_MAX_BYTES = 64 * 1024
TIEMPO_MAX_S = _real_env("CHATTERBOX_TIEMPO_MAX_S", 55.0)  # por debajo de los 60 s del cliente
ESPERA_TURNO_S = 5.0  # cuánto espera una petición si otra está sintetizando
MEMORIA_MIN_MB = _entero_env("CHATTERBOX_MEMORIA_MIN_MB", 2500)  # libre para CARGAR el modelo
INACTIVIDAD_S = _real_env("CHATTERBOX_INACTIVIDAD_S", 5 * 60.0)  # sin uso → descarga (cede memoria)
REINTENTO_CARGA_S = 10 * 60.0  # tras una carga fallida (lo mismo que el cliente aparta el local)
PRESION_AVISO = 2  # kern.memorystatus_vm_pressure_level: 1 normal · 2 aviso · 4 crítica

#: Los 23 idiomas de Chatterbox Multilingual (los mismos que `IDIOMAS_MTL` del cliente).
IDIOMAS_MTL = frozenset((
    "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja",
    "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
))

#: Campos que piden clonar una voz: no van por aquí (consentimiento en `clonacion.ts`).
CAMPOS_CLONACION = ("referencia_voz", "audio_prompt_path")

CARPETA = os.path.dirname(os.path.abspath(__file__))


def _sin_rutas(texto: str) -> str:
    """Quita la carpeta personal de un mensaje (nunca rutas del usuario en lo que sale)."""
    casa = os.path.expanduser("~")
    salida = texto.replace(casa, "~") if casa and casa != "~" else texto
    return salida[:300]


# ── Dispositivo y memoria ────────────────────────────────────────────────────


def detectar_dispositivo() -> str:
    """Dispositivo PREVISTO sin importar torch (barato: lo usa /salud, que el cliente corta a 2,5 s)."""
    forzado = os.environ.get("CHATTERBOX_DISPOSITIVO", "").strip().lower()
    if forzado in ("cpu", "mps", "cuda"):
        return forzado
    if sys.platform == "darwin" and platform.machine() == "arm64":
        return "mps"
    if shutil.which("nvidia-smi"):
        return "cuda"
    return "cpu"


def detectar_dispositivo_torch(torch: Any) -> str:
    """Dispositivo REAL, ya con torch importado (solo al cargar el modelo)."""
    forzado = os.environ.get("CHATTERBOX_DISPOSITIVO", "").strip().lower()
    if forzado in ("cpu", "mps", "cuda"):
        return forzado
    try:
        if torch.cuda.is_available():
            return "cuda"
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def _leer_meminfo() -> Optional[float]:
    try:
        with open("/proc/meminfo", encoding="ascii") as f:
            for linea in f:
                if linea.startswith("MemAvailable:"):
                    return int(linea.split()[1]) / 1024.0
    except (OSError, ValueError, IndexError):
        return None
    return None


def _leer_vm_stat() -> Optional[float]:
    """macOS: páginas libres + inactivas + especulativas de `vm_stat`, en MB."""
    try:
        salida = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=2).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    tam = 4096
    paginas = 0
    for linea in salida.splitlines():
        if "page size of" in linea:
            try:
                tam = int(linea.split("page size of")[1].split()[0])
            except (ValueError, IndexError):
                pass
        for clave in ("Pages free:", "Pages inactive:", "Pages speculative:"):
            if linea.startswith(clave):
                try:
                    paginas += int(linea.split(":")[1].strip().rstrip("."))
                except ValueError:
                    pass
    return paginas * tam / (1024.0 * 1024.0) if paginas else None


def _leer_presion() -> Optional[int]:
    if sys.platform != "darwin":
        return None
    try:
        salida = subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"],
                                capture_output=True, text=True, timeout=2).stdout.strip()
        return int(salida) if salida else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def estado_memoria() -> Dict[str, Optional[float]]:
    """{libre_mb, presion}; None en lo que no se pudo medir (entonces no se bloquea por ello)."""
    libre = _leer_meminfo() if sys.platform.startswith("linux") else _leer_vm_stat()
    return {"libre_mb": libre, "presion": _leer_presion()}


# ── Audio: WAV RIFF PCM 16 bits mono, solo con la biblioteca estándar ────────


def _aplanar(x: Any) -> Iterable[float]:
    if isinstance(x, (list, tuple)):
        for v in x:
            yield from _aplanar(v)
    else:
        yield float(x)


def pcm16_desde(muestras: Any) -> bytes:
    """Muestras en [-1, 1] (tensor de torch, ndarray o lista, anidada o no) → PCM 16 bits little-endian."""
    x = muestras
    for metodo in ("detach", "cpu"):
        if hasattr(x, metodo):
            x = getattr(x, metodo)()
    if hasattr(x, "numpy") and not isinstance(x, (list, tuple)):
        try:
            x = x.numpy()
        except Exception:  # torch sin numpy: lista de Python
            x = x.tolist()
    try:
        import numpy as np  # opcional: solo acelera
    except ImportError:
        np = None  # type: ignore[assignment]
    if np is not None and isinstance(x, np.ndarray):
        a = np.nan_to_num(x.astype(np.float32).reshape(-1), nan=0.0, posinf=1.0, neginf=-1.0)
        return (np.clip(a, -1.0, 1.0) * 32767.0).round().astype("<i2").tobytes()
    if hasattr(x, "tolist"):
        x = x.tolist()
    pcm = array("h")
    for v in _aplanar(x):
        if v != v:  # NaN
            v = 0.0
        pcm.append(int(round(max(-1.0, min(1.0, v)) * 32767.0)))
    if sys.byteorder == "big":
        pcm.byteswap()
    return pcm.tobytes()


def wav_desde_pcm16(pcm: bytes, frecuencia_hz: int) -> bytes:
    """Cabecera RIFF/WAVE con el módulo `wave` (el cliente comprueba «RIFF» y ≥ 44 bytes)."""
    salida = io.BytesIO()
    with wave.open(salida, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(frecuencia_hz))
        w.writeframes(pcm)
    return salida.getvalue()


# ── Motores ──────────────────────────────────────────────────────────────────


class MotorChatterbox:
    """Chatterbox Multilingual de verdad (una sola copia en memoria para los 23 idiomas)."""

    nombre = "chatterbox-multilingual"
    marca_agua = True  # Chatterbox pone la marca de agua Perth en todo lo que genera (no se quita)
    necesita_memoria = True  # antes de cargar se mide la memoria libre y la presión

    def __init__(self, buscar_paquete: Callable[[str], Any] = importlib.util.find_spec) -> None:
        self._buscar = buscar_paquete
        self._modelo: Any = None
        self._dispositivo: Optional[str] = None
        self._frecuencia = 24000
        self.idiomas = IDIOMAS_MTL

    def instalado(self) -> Tuple[bool, str]:
        """¿Está el paquete chatterbox-tts? Sin importarlo (importarlo trae torch: segundos y memoria)."""
        try:
            spec = self._buscar("chatterbox")
        except (ImportError, ValueError):
            spec = None
        origen = getattr(spec, "origin", None) if spec is not None else None
        # Esta carpeta también se llama «chatterbox»: vista desde su padre es un paquete de espacio
        # de nombres SIN __init__.py (origin None). Eso no es el paquete instalado.
        if not origen or not str(origen).endswith("__init__.py") or os.path.dirname(str(origen)) == CARPETA:
            return False, "el paquete chatterbox-tts no está instalado en esta neurona (pip install chatterbox-tts)"
        carpetas = list(getattr(spec, "submodule_search_locations", None) or [])
        if carpetas and not any(os.path.isfile(os.path.join(c, "mtl_tts.py")) for c in carpetas):
            return False, "chatterbox-tts está instalado sin el modelo multilingüe (actualízalo: pip install -U chatterbox-tts)"
        return True, ""

    def cargado(self) -> bool:
        return self._modelo is not None

    def dispositivo(self) -> Tuple[str, bool]:
        """(dispositivo, medido): medido solo cuando el modelo está cargado."""
        if self._modelo is not None and self._dispositivo:
            return self._dispositivo, True
        return detectar_dispositivo(), False

    def cargar(self) -> None:
        import torch  # noqa: F401 — solo aquí: /salud nunca lo importa
        from chatterbox import mtl_tts
        disp = detectar_dispositivo_torch(torch)
        self._modelo = mtl_tts.ChatterboxMultilingualTTS.from_pretrained(device=disp)
        self._dispositivo = disp
        self._frecuencia = int(getattr(self._modelo, "sr", 24000) or 24000)
        soportados = getattr(mtl_tts, "SUPPORTED_LANGUAGES", None)
        if isinstance(soportados, (dict, set, frozenset, list, tuple)) and soportados:
            self.idiomas = frozenset(str(k).lower() for k in soportados)

    def generar(self, texto: str, idioma: str, exageracion: float, cfg_weight: float) -> Tuple[Any, int]:
        wav = self._modelo.generate(texto, language_id=idioma, exaggeration=exageracion, cfg_weight=cfg_weight)
        return wav, self._frecuencia

    def descargar(self) -> None:
        self._modelo = None
        gc.collect()
        torch = sys.modules.get("torch")
        for vaciar in ("cuda", "mps"):
            try:
                getattr(getattr(torch, vaciar), "empty_cache")()
            except Exception:
                pass


class MotorSimulado:
    """Motor de PRUEBA sin modelo: un tono suave de 440 Hz cuya duración sigue al texto.

    Solo con `--simulado` (para comprobar el cableado desde el navegador sin pesos) y en las pruebas.
    /salud dice `motor: "simulado"` y `marca_agua_perth: false`: nunca se hace pasar por una voz.
    """

    nombre = "simulado"
    marca_agua = False
    necesita_memoria = False

    def __init__(self, frecuencia_hz: int = 16000) -> None:
        self._cargado = False
        self._frecuencia = frecuencia_hz
        self.idiomas = IDIOMAS_MTL
        self.llamadas: List[Dict[str, Any]] = []

    def instalado(self) -> Tuple[bool, str]:
        return True, ""

    def cargado(self) -> bool:
        return self._cargado

    def dispositivo(self) -> Tuple[str, bool]:
        return "cpu", True

    def cargar(self) -> None:
        self._cargado = True

    def generar(self, texto: str, idioma: str, exageracion: float, cfg_weight: float) -> Tuple[Any, int]:
        self.llamadas.append({"texto": texto, "idioma": idioma, "exageracion": exageracion, "cfg_weight": cfg_weight})
        segundos = max(0.2, min(5.0, len(texto) * 0.03))
        n = int(segundos * self._frecuencia)
        tono = [0.2 * math.sin(2 * math.pi * 440.0 * i / self._frecuencia) for i in range(n)]
        return tono, self._frecuencia

    def descargar(self) -> None:
        self._cargado = False


# ── Servicio (lógica sin red: lo prueba test_servidor.py) ────────────────────


class ErrorPeticion(Exception):
    def __init__(self, codigo: int, motivo: str) -> None:
        super().__init__(motivo)
        self.codigo = codigo
        self.motivo = motivo


def _numero(cuerpo: Dict[str, Any], campo: str, defecto: float, minimo: float, maximo: float) -> float:
    v = cuerpo.get(campo, defecto)
    if v is None:
        return defecto
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ErrorPeticion(400, f"«{campo}» debe ser un número")
    if not minimo <= v <= maximo:
        raise ErrorPeticion(400, f"«{campo}» debe estar entre {minimo:g} y {maximo:g}")
    return float(v)


class ServicioChatterbox:
    """Salud, generación y descarga por inactividad, con motor, memoria y reloj inyectables."""

    def __init__(
        self,
        motor: Any = None,
        *,
        texto_max: int = TEXTO_MAX,
        tiempo_max_s: float = TIEMPO_MAX_S,
        espera_turno_s: float = ESPERA_TURNO_S,
        memoria_min_mb: float = MEMORIA_MIN_MB,
        inactividad_s: float = INACTIVIDAD_S,
        medir_memoria: Callable[[], Dict[str, Optional[float]]] = estado_memoria,
        reloj: Callable[[], float] = time.monotonic,
    ) -> None:
        self.motor = motor if motor is not None else MotorChatterbox()
        self.texto_max = texto_max
        self.tiempo_max_s = tiempo_max_s
        self.espera_turno_s = espera_turno_s
        self.memoria_min_mb = memoria_min_mb
        self.inactividad_s = inactividad_s
        self._medir_memoria = medir_memoria
        self._reloj = reloj
        self._turno = threading.Semaphore(1)  # una carga o síntesis a la vez
        self._ocupado = False
        self._ultimo_uso = reloj()
        self._fallo_carga: Optional[Tuple[float, str]] = None
        self._ultima_carga_s: Optional[float] = None

    # Disponibilidad ----------------------------------------------------------

    def disponibilidad(self) -> Tuple[bool, str, Dict[str, Optional[float]]]:
        ok, motivo = self.motor.instalado()
        if not ok:
            return False, motivo, {}
        if self.motor.cargado():
            return True, "", {}
        if self._fallo_carga and self._reloj() - self._fallo_carga[0] < REINTENTO_CARGA_S:
            return False, self._fallo_carga[1], {}
        if not getattr(self.motor, "necesita_memoria", True):
            return True, "", {}
        mem = self._medir_memoria() or {}
        presion = mem.get("presion")
        if isinstance(presion, (int, float)) and presion >= PRESION_AVISO:
            return False, f"la memoria del sistema está en aviso (presión {int(presion)}): Chatterbox cede al enjambre", mem
        libre = mem.get("libre_mb")
        if isinstance(libre, (int, float)) and libre < self.memoria_min_mb:
            return False, (f"no cabe en memoria: hay {int(libre)} MB libres y cargar el modelo pide "
                           f"{int(self.memoria_min_mb)} MB"), mem
        return True, "", mem

    def salud(self) -> Tuple[int, Dict[str, Any]]:
        disponible, motivo, mem = self.disponibilidad()
        dispositivo, medido = self.motor.dispositivo()
        cargado = self.motor.cargado()
        cuerpo: Dict[str, Any] = {
            "servicio": "chatterbox",
            "disponible": disponible,
            "motivo": motivo or None,
            "estado": "cargado" if cargado else ("listo-para-cargar" if disponible else "no-disponible"),
            "motor": self.motor.nombre,
            "dispositivo": dispositivo,
            "dispositivo_medido": medido,
            "modelos_cargados": [self.motor.nombre] if cargado else [],
            "marca_agua_perth": bool(self.motor.marca_agua),
            "ocupado": self._ocupado,
            "idiomas": sorted(self.motor.idiomas),
            "limites": {"texto_max": self.texto_max, "tiempo_max_s": self.tiempo_max_s,
                        "cuerpo_max_bytes": CUERPO_MAX_BYTES},
            "descarga_de_pesos": "nunca automática",
        }
        if mem:
            cuerpo["memoria"] = {"libre_mb": mem.get("libre_mb"), "presion": mem.get("presion"),
                                 "necesita_mb": self.memoria_min_mb}
        if self._ultima_carga_s is not None:
            cuerpo["ultima_carga_s"] = round(self._ultima_carga_s, 3)
        return (200 if disponible else 503), cuerpo

    # Generación --------------------------------------------------------------

    def validar(self, crudo: bytes, tipo_contenido: str) -> Dict[str, Any]:
        if tipo_contenido.split(";")[0].strip().lower() != "application/json":
            raise ErrorPeticion(415, "el cuerpo debe ir como application/json")
        try:
            cuerpo = json.loads(crudo.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ErrorPeticion(400, "el cuerpo no es JSON válido en UTF-8")
        if not isinstance(cuerpo, dict):
            raise ErrorPeticion(400, "el cuerpo debe ser un objeto JSON")
        for campo in CAMPOS_CLONACION:
            if cuerpo.get(campo):
                raise ErrorPeticion(400, "la clonación de voz no va por esta puerta: pide el consentimiento "
                                         "del dueño (src/lib/voces/clonacion.ts)")
        texto = cuerpo.get("texto")
        if not isinstance(texto, str) or not texto.strip():
            raise ErrorPeticion(400, "falta «texto» (cadena no vacía)")
        texto = texto.strip()
        if len(texto) > self.texto_max:
            raise ErrorPeticion(413, f"el texto tiene {len(texto)} caracteres y el máximo es {self.texto_max}")
        idioma_crudo = cuerpo.get("idioma") or "es"
        if not isinstance(idioma_crudo, str):
            raise ErrorPeticion(400, "«idioma» debe ser un código como «es»")
        idioma = idioma_crudo.strip().lower().replace("_", "-").split("-")[0]
        if idioma not in self.motor.idiomas:
            raise ErrorPeticion(400, f"idioma «{idioma}» no soportado por Chatterbox")
        return {
            "texto": texto,
            "idioma": idioma,
            "exageracion": _numero(cuerpo, "exageracion", 0.5, 0.0, 2.0),
            "cfg_weight": _numero(cuerpo, "cfg_weight", 0.5, 0.0, 1.0),
        }

    def generar(self, crudo: bytes, tipo_contenido: str) -> Tuple[int, Dict[str, Any]]:
        inicio = self._reloj()
        try:
            p = self.validar(crudo, tipo_contenido)
        except ErrorPeticion as e:
            return e.codigo, {"error": "peticion", "motivo": e.motivo}
        disponible, motivo, _ = self.disponibilidad()
        if not disponible:
            return 503, {"error": "no-disponible", "disponible": False, "motivo": motivo}
        if not self._turno.acquire(timeout=self.espera_turno_s):
            return 503, {"error": "ocupado", "disponible": True,
                         "motivo": "otra síntesis está en curso; prueba en unos segundos"}
        self._ocupado = True
        listo = threading.Event()
        caja: Dict[str, Any] = {}

        def trabajar() -> None:
            try:
                caja["resultado"] = self._sintetizar(p)
            except BaseException as e:  # el hilo nunca muere en silencio
                caja["error"] = e
            finally:
                self._ultimo_uso = self._reloj()
                self._ocupado = False
                self._turno.release()
                listo.set()

        try:
            threading.Thread(target=trabajar, name="chatterbox-sintesis", daemon=True).start()
        except RuntimeError:  # sin hilos libres: se devuelve el turno y se dice
            self._ocupado = False
            self._turno.release()
            return 503, {"error": "ocupado", "disponible": True, "motivo": "no hay hilos libres para sintetizar"}
        restante = max(0.05, self.tiempo_max_s - (self._reloj() - inicio))
        if not listo.wait(restante):
            return 504, {"error": "tiempo", "motivo": (f"la síntesis pasó de {self.tiempo_max_s:g} s; se termina "
                                                        "por detrás (el modelo queda cargado) sin bloquear el servicio")}
        if "error" in caja:
            e = caja["error"]
            if isinstance(e, ErrorPeticion) and e.codigo == 503:
                return 503, {"error": "no-disponible", "disponible": False, "motivo": e.motivo}
            if isinstance(e, ErrorPeticion):
                return e.codigo, {"error": "motor", "motivo": e.motivo}
            return 500, {"error": "motor", "motivo": _sin_rutas(f"el motor falló: {type(e).__name__}: {e}")}
        cuerpo = caja["resultado"]
        cuerpo["tiempo_total_s"] = round(self._reloj() - inicio, 3)
        return 200, cuerpo

    def _sintetizar(self, p: Dict[str, Any]) -> Dict[str, Any]:
        """Dentro del turno: carga si hace falta y genera. Devuelve el cuerpo del 200."""
        t_carga = 0.0
        if not self.motor.cargado():
            t0 = self._reloj()
            try:
                self.motor.cargar()
            except BaseException as e:
                motivo = _motivo_de_carga(e)
                self._fallo_carga = (self._reloj(), motivo)
                raise ErrorPeticion(503, motivo)
            t_carga = self._reloj() - t0
            self._ultima_carga_s = t_carga
            self._fallo_carga = None
        t1 = self._reloj()
        muestras, frecuencia = self.motor.generar(p["texto"], p["idioma"], p["exageracion"], p["cfg_weight"])
        t_gen = self._reloj() - t1
        pcm = pcm16_desde(muestras)
        if not pcm:
            raise ErrorPeticion(500, "el motor devolvió audio vacío")
        duracion = len(pcm) / 2.0 / float(frecuencia)
        wav = wav_desde_pcm16(pcm, frecuencia)
        dispositivo, _ = self.motor.dispositivo()
        return {
            "audio_base64": base64.b64encode(wav).decode("ascii"),
            "formato": "wav",
            "frecuencia_hz": int(frecuencia),
            "duracion_s": round(duracion, 3),
            # Segundos de proceso por segundo de audio (< 1 = más rápido que el tiempo real), como
            # `factorTiempoReal` de src/lib/mejoras/calidad.ts. 0 si el reloj no llegó a medirlo.
            "factor_tiempo_real": round(t_gen / duracion, 4) if duracion > 0 and t_gen > 0 else 0.0,
            "tiempo_carga_s": round(t_carga, 3),
            "tiempo_generacion_s": round(t_gen, 3),
            "idioma": p["idioma"],
            "exageracion": p["exageracion"],
            "cfg_weight": p["cfg_weight"],
            "motor": self.motor.nombre,
            "dispositivo": dispositivo,
            "marca_agua_perth": bool(self.motor.marca_agua),
        }

    # Descarga por inactividad ------------------------------------------------

    def descargar_si_inactivo(self) -> bool:
        """Libera el modelo tras `inactividad_s` sin uso. Nunca a mitad de una síntesis."""
        if not self.motor.cargado() or self._reloj() - self._ultimo_uso < self.inactividad_s:
            return False
        if not self._turno.acquire(blocking=False):
            return False
        try:
            self.motor.descargar()
            return True
        finally:
            self._turno.release()


def _motivo_de_carga(e: BaseException) -> str:
    nombre = type(e).__name__
    texto = str(e)
    if isinstance(e, MemoryError) or "out of memory" in texto.lower():
        return "no cupo en memoria al cargar el modelo"
    if "LocalEntryNotFound" in nombre or "offline" in texto.lower() or "HF_HUB_OFFLINE" in texto:
        return ("los pesos de Chatterbox no están en la caché local y este servicio no descarga nada "
                "por su cuenta (ver README: descarga con permiso)")
    if isinstance(e, ImportError):
        return _sin_rutas(f"falta una dependencia de chatterbox-tts: {texto}")
    return _sin_rutas(f"no se pudo cargar el modelo: {nombre}: {texto}")


# ── HTTP ─────────────────────────────────────────────────────────────────────


def origen_permitido(origen: Optional[str]) -> bool:
    """La MISMA lista que el demonio de voz (`native/astraura-voice/lib.mjs · isAllowedOrigin`)."""
    if not origen or not isinstance(origen, str):
        return False
    try:
        u = urlsplit(origen)
        host = (u.hostname or "").lower()
        _ = u.port  # un puerto inválido lanza ValueError
    except ValueError:
        return False
    if u.scheme == "http" and host in ("localhost", "127.0.0.1", "::1"):
        return True
    if u.scheme == "https":
        if host == "starseed-os.vercel.app":
            return True
        if host == "starseed-os.com" or host.endswith(".starseed-os.com"):
            return True
        if host.endswith("-alexbordongarrigos-projects.vercel.app"):
            return True
    return False


def host_permitido(host: Optional[str]) -> bool:
    """El Host debe ser de loopback: una página con «DNS rebinding» llega con el suyo y se rechaza."""
    if not host:
        return True  # HTTP/1.0 sin Host: solo puede venir de esta máquina
    nombre = host.strip().lower()
    if nombre.startswith("["):
        nombre = nombre[1:].split("]")[0]
    elif nombre.count(":") == 1:
        nombre = nombre.split(":")[0]
    return nombre in ("127.0.0.1", "localhost", "::1")


class ManejadorChatterbox(BaseHTTPRequestHandler):
    servicio: ServicioChatterbox  # lo fija crear_servidor
    registrar = True
    server_version = "StarSeedChatterbox/1.0"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = 30  # un cliente que no termina de mandar el cuerpo no retiene el hilo

    def version_string(self) -> str:
        return self.server_version  # sin la versión de Python en la cabecera Server

    def log_message(self, formato: str, *args: Any) -> None:
        if self.registrar:
            sys.stderr.write("chatterbox · " + (formato % args) + "\n")

    def _cors(self) -> List[Tuple[str, str]]:
        origen = self.headers.get("Origin")
        if not origen_permitido(origen):
            return []
        return [("Access-Control-Allow-Origin", origen or ""), ("Vary", "Origin")]

    def _responder(self, codigo: int, cuerpo: Optional[Dict[str, Any]], extra: Iterable[Tuple[str, str]] = ()) -> None:
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8") if cuerpo is not None else b""
        self.send_response(codigo)
        for k, v in list(self._cors()) + list(extra):
            self.send_header(k, v)
        if cuerpo is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if codigo != 204:  # un 204 no lleva Content-Length (RFC 9110)
            self.send_header("Content-Length", str(len(datos)))
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if datos and self.command != "HEAD":
            self.wfile.write(datos)

    def _puerta(self) -> bool:
        """Origin y Host. Un Origin ajeno → 403 sin cuerpo (igual que el demonio de voz)."""
        origen = self.headers.get("Origin")
        if (origen and not origen_permitido(origen)) or not host_permitido(self.headers.get("Host")):
            self.close_connection = True
            self._responder(403, None)
            return False
        return True

    def _ruta(self) -> str:
        return urlsplit(self.path).path.rstrip("/") or "/"

    def do_OPTIONS(self) -> None:  # noqa: N802 — nombre que exige http.server
        if not self._puerta():
            return
        extra = [("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
                 ("Access-Control-Allow-Headers", "Content-Type"),
                 ("Access-Control-Max-Age", "600"),
                 ("Allow", "GET, POST, OPTIONS")]
        if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true" and self._cors():
            extra.append(("Access-Control-Allow-Private-Network", "true"))
        self._responder(204, None, extra)

    def do_GET(self) -> None:  # noqa: N802
        if not self._puerta():
            return
        ruta = self._ruta()
        if ruta == "/salud":
            codigo, cuerpo = self.servicio.salud()
            self._responder(codigo, cuerpo, [("Retry-After", "60")] if codigo == 503 else [])
        elif ruta == "/generar":
            self._responder(405, {"error": "metodo", "motivo": "usa POST"}, [("Allow", "POST, OPTIONS")])
        else:
            self._responder(404, {"error": "ruta", "motivo": "solo GET /salud y POST /generar"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._puerta():
            return
        ruta = self._ruta()
        if ruta != "/generar":
            self.close_connection = True
            if ruta == "/salud":
                self._responder(405, {"error": "metodo", "motivo": "usa GET"}, [("Allow", "GET, OPTIONS")])
            else:
                self._responder(404, {"error": "ruta", "motivo": "solo GET /salud y POST /generar"})
            return
        try:
            largo = int(self.headers.get("Content-Length", ""))
        except ValueError:
            largo = -1
        if largo < 0:
            self.close_connection = True
            self._responder(400, {"error": "peticion", "motivo": "falta Content-Length"})
            return
        if largo > CUERPO_MAX_BYTES:
            self.close_connection = True  # no leemos el cuerpo: se cierra la conexión
            self._responder(413, {"error": "peticion", "motivo": f"el cuerpo pasa de {CUERPO_MAX_BYTES} bytes"})
            return
        crudo = self.rfile.read(largo) if largo else b""
        codigo, cuerpo = self.servicio.generar(crudo, self.headers.get("Content-Type", ""))
        espera = "5" if cuerpo.get("error") == "ocupado" else "60"
        self._responder(codigo, cuerpo, [("Retry-After", espera)] if codigo == 503 else [])

    def _no_permitido(self) -> None:
        self.close_connection = True
        if self._puerta():
            self._responder(405, {"error": "metodo", "motivo": "solo GET /salud y POST /generar"},
                            [("Allow", "GET, POST, OPTIONS")])

    do_PUT = do_DELETE = do_PATCH = _no_permitido


class ServidorChatterbox(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def crear_servidor(servicio: Optional[ServicioChatterbox] = None, puerto: int = PUERTO_DEFECTO,
                   registrar: bool = True) -> ServidorChatterbox:
    """Servidor en 127.0.0.1:<puerto> (0 = uno libre, para las pruebas). No lo arranca."""
    servicio = servicio or ServicioChatterbox()
    manejador = type("Manejador", (ManejadorChatterbox,), {"servicio": servicio, "registrar": registrar})
    return ServidorChatterbox((HOST, int(puerto)), manejador)


def vigilar_inactividad(servicio: ServicioChatterbox, parar: threading.Event, cada_s: float = 30.0) -> threading.Thread:
    def bucle() -> None:
        while not parar.wait(cada_s):
            try:
                if servicio.descargar_si_inactivo():
                    sys.stderr.write("chatterbox · modelo descargado por inactividad (memoria cedida)\n")
            except Exception as e:  # el vigía no tumba el servicio
                sys.stderr.write(f"chatterbox · vigía de inactividad: {type(e).__name__}\n")

    hilo = threading.Thread(target=bucle, name="chatterbox-inactividad", daemon=True)
    hilo.start()
    return hilo


def analizar_argumentos(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Servicio local Chatterbox TTS de StarSeed OS (solo 127.0.0.1).")
    p.add_argument("puerto_posicional", nargs="?", type=int, metavar="PUERTO",
                   help=f"puerto (por defecto {PUERTO_DEFECTO} o CHATTERBOX_PORT)")
    p.add_argument("--puerto", type=int, default=None, help="igual que PUERTO")
    p.add_argument("--simulado", action="store_true",
                   help="tono de prueba sin modelo, para comprobar el cableado (nunca es una voz)")
    p.add_argument("--texto-max", type=int, default=TEXTO_MAX, help="caracteres por petición")
    p.add_argument("--tiempo-max", type=float, default=TIEMPO_MAX_S, help="segundos por petición")
    a = p.parse_args(argv)
    a.puerto = a.puerto_posicional if a.puerto_posicional is not None else (
        a.puerto if a.puerto is not None else _entero_env("CHATTERBOX_PORT", PUERTO_DEFECTO))
    if not 0 <= a.puerto <= 65535:
        p.error("el puerto va de 0 a 65535")
    if a.texto_max < 1 or a.tiempo_max <= 0:
        p.error("--texto-max y --tiempo-max deben ser positivos")
    return a


def main(argv: Optional[List[str]] = None) -> int:
    a = analizar_argumentos(argv)
    servicio = ServicioChatterbox(MotorSimulado() if a.simulado else None,
                                  texto_max=a.texto_max, tiempo_max_s=a.tiempo_max)
    try:
        srv = crear_servidor(servicio, a.puerto)
    except OSError as e:
        print(f"Chatterbox: no puedo escuchar en {HOST}:{a.puerto} ({e.strerror or e}). "
              "¿Hay otro servicio en ese puerto?", file=sys.stderr)
        return 1
    codigo, salud = servicio.salud()
    estado = "disponible" if codigo == 200 else f"NO disponible: {salud.get('motivo')}"
    print(f"Chatterbox escuchando en http://{HOST}:{srv.server_address[1]} · motor {servicio.motor.nombre} · {estado}",
          flush=True)
    parar = threading.Event()
    vigilar_inactividad(servicio, parar)
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        parar.set()
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
