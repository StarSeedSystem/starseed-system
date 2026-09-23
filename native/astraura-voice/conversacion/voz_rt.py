# -*- coding: utf-8 -*-
"""Voz en tiempo real de Astraura · servidor local (127.0.0.1:4460).

Alex (2026-09-22): «debe ser una respuesta de voz por cada mensaje continuo sin
interrupciones y con la misma voz… que responda inmediatamente con la voz en tiempo real
como una conversación con un humano». Ver `voz_rt_logica.py` para lo medido.

Qué hace:
  · Carga Supertonic 3 UNA vez y lo deja residente (~0,5 GB): nada de «recargar el modelo»
    entre frases ni entre mensajes.
  · Una voz fija por conversación (estilo F1…M5): el timbre no depende de semillas.
  · Ajusta la calidad al procesador: mide el RTF de cada frase y sube o baja los pasos de
    difusión para que el cálculo vaya siempre por delante de lo que se oye.
  · Mantiene la CONCESIÓN de conversación (`~/.starseed/conversacion.json`): mientras dura,
    el guardia de memoria no congela la voz ni BitNet y congela en su lugar al enjambre
    (`scripts/puente/prioridad_conversacion.py`). Cada frase y cada latido la alargan.

Rutas:  GET /status · POST /tts {texto, voz?, velocidad?, lang?} → audio/wav
        POST /latido {quien?, segundos?} · POST /fin
"""
import collections
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voz_rt_logica as L  # noqa: E402

PUERTO = int(os.environ.get("STARSEED_VOZ_RT_PUERTO", "4460"))
RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
CONCESION = os.path.expanduser(os.environ.get("STARSEED_CONCESION", "~/.starseed/conversacion.json"))
VOZ_POR_DEFECTO = os.environ.get("STARSEED_VOZ_RT_VOZ", "F1")
HILOS = int(os.environ.get("STARSEED_VOZ_RT_HILOS", str(max(2, (os.cpu_count() or 4) // 2))))

ESTADO = {
    "listo": False,
    "error": None,
    "cargado_ms": None,
    "pasos": 6,
    "rtf": None,
    "frases": 0,
    "ultima_ms": None,
    "desde": time.time(),
}
_tts = None
_estilos = {}
_cerrojo = threading.Lock()
_cache = collections.OrderedDict()
_CACHE_MAX = 96


def log(msg):
    print("[%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


def cargar():
    global _tts
    t0 = time.time()
    try:
        from supertonic import TTS

        _tts = TTS(auto_download=True, intra_op_num_threads=HILOS)
        estilo(VOZ_POR_DEFECTO)
        # Calentamiento: la primera síntesis paga la preparación de ONNX; mejor aquí.
        _tts.synthesize("Hola.", voice_style=estilo(VOZ_POR_DEFECTO), lang="es", total_steps=4)
        ESTADO["listo"] = True
        ESTADO["cargado_ms"] = int((time.time() - t0) * 1000)
        log("Supertonic listo en %d ms · voces %s · %d hilos" % (ESTADO["cargado_ms"], ",".join(voces()), HILOS))
    except Exception as e:  # el servidor sigue vivo y lo dice en /status
        ESTADO["error"] = "%s: %s" % (type(e).__name__, e)
        log("no se pudo cargar Supertonic: %s" % ESTADO["error"])


def voces():
    try:
        return list(_tts.voice_style_names)
    except Exception:
        return []


def estilo(nombre):
    nombre = nombre if nombre in voces() else VOZ_POR_DEFECTO
    if nombre not in _estilos:
        _estilos[nombre] = _tts.get_voice_style(voice_name=nombre)
    return _estilos[nombre]


def sintetizar(texto, voz, velocidad, lang):
    """Devuelve (wav_bytes, calculo_ms, duracion_ms, pasos). Cachea por texto+voz+velocidad."""
    import numpy as np

    clave = (texto, voz, round(velocidad, 2), lang)
    if clave in _cache:
        _cache.move_to_end(clave)
        wav, dur_ms = _cache[clave]
        return wav, 0, dur_ms, ESTADO["pasos"]
    with _cerrojo:
        pasos = ESTADO["pasos"]
        t0 = time.time()
        audio, duracion = _tts.synthesize(
            texto, voice_style=estilo(voz), lang=lang, total_steps=pasos, speed=velocidad
        )
        calculo = time.time() - t0
    muestras = np.clip(np.asarray(audio, dtype=np.float32).reshape(-1), -1.0, 1.0)
    datos = (muestras * 32767).astype("<i2").tobytes()
    wav = L.cabecera_wav(len(datos), _tts.sample_rate) + datos
    dur_s = max(1e-3, len(muestras) / float(_tts.sample_rate))
    rtf = calculo / dur_s
    ESTADO["rtf"] = round(L.media_movil(ESTADO["rtf"], rtf), 3)
    ESTADO["pasos"] = L.ajustar_pasos(ESTADO["rtf"], pasos)
    ESTADO["frases"] += 1
    ESTADO["ultima_ms"] = int(calculo * 1000)
    _cache[clave] = (wav, int(dur_s * 1000))
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return wav, int(calculo * 1000), int(dur_s * 1000), pasos


def escribir_concesion(c):
    os.makedirs(os.path.dirname(CONCESION), exist_ok=True)
    tmp = CONCESION + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(c, f)
    os.replace(tmp, CONCESION)


def aplicar_prioridad():
    """Sin esperar: congela el enjambre y despierta los motores YA, sin aguardar al guardia."""
    guion = os.path.join(RAIZ, "scripts", "puente", "prioridad_conversacion.py")
    if os.path.exists(guion):
        try:
            subprocess.Popen(["/usr/bin/env", "python3", guion, "aplicar"], cwd=RAIZ,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
        except OSError:
            pass


def renovar(quien, segundos=L.CONCESION_S):
    anterior = L.leer_json(CONCESION)
    estaba = L.concesion_activa(anterior)
    nueva = L.renovar_concesion(anterior, quien, segundos=segundos)
    escribir_concesion(nueva)
    if not estaba:
        log("conversación EMPIEZA (%s): prioridad a la voz y a BitNet" % nueva["quien"])
        aplicar_prioridad()
    return nueva


class ServidorVoz(ThreadingHTTPServer):
    """El navegador corta a propósito las frases que ya no hacen falta (pausar, detener,
    interrumpir): eso no es un error y no debe llenar el log de trazas."""

    daemon_threads = True

    def handle_error(self, request, client_address):
        tipo = sys.exc_info()[0]
        if tipo is not None and issubclass(tipo, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


class Manejador(BaseHTTPRequestHandler):
    server_version = "StarSeedVozRT/1"

    def log_message(self, *args):  # silencio: el log propio ya dice lo que importa
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Expose-Headers",
                         "X-Calculo-Ms, X-Duracion-Ms, X-Pasos, X-Voz, X-Rtf")

    def _json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _cuerpo(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n).decode("utf-8") or "{}") if n else {}
        except (ValueError, OSError):
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] != "/status":
            return self._json(404, {"error": "ruta desconocida"})
        c = L.leer_json(CONCESION)
        self._json(200, {
            "ok": True,
            "motor": "supertonic-3",
            "listo": ESTADO["listo"],
            "error": ESTADO["error"],
            "voces": voces(),
            "voz": VOZ_POR_DEFECTO,
            "pasos": ESTADO["pasos"],
            "rtf": ESTADO["rtf"],
            "frases": ESTADO["frases"],
            "ultimaMs": ESTADO["ultima_ms"],
            "cargadoMs": ESTADO["cargado_ms"],
            "hilos": HILOS,
            "conversacion": {"activa": L.concesion_activa(c), "hasta": c.get("hasta"), "desde": c.get("desde")},
        })

    def do_POST(self):
        ruta = self.path.split("?")[0]
        datos = self._cuerpo()
        if ruta == "/latido":
            c = renovar(datos.get("quien") or "astraura", float(datos.get("segundos") or L.CONCESION_S))
            return self._json(200, {"ok": True, "conversacion": c})
        if ruta == "/fin":
            c = L.leer_json(CONCESION)
            if L.concesion_activa(c):
                c["hasta"] = time.time()
                escribir_concesion(c)
                log("conversación TERMINA: el enjambre vuelve")
                aplicar_prioridad()
            return self._json(200, {"ok": True})
        if ruta != "/tts":
            return self._json(404, {"error": "ruta desconocida"})
        if not ESTADO["listo"]:
            return self._json(503, {"error": ESTADO["error"] or "cargando el modelo"})
        texto = L.limpiar_para_voz(datos.get("texto") or datos.get("text") or "")
        if not texto:
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        voz = str(datos.get("voz") or VOZ_POR_DEFECTO)
        try:
            velocidad = min(1.6, max(0.8, float(datos.get("velocidad") or 1.05)))
        except (TypeError, ValueError):
            velocidad = 1.05
        lang = str(datos.get("lang") or "es")[:5]
        try:
            wav, calculo, dur, pasos = sintetizar(texto, voz, velocidad, lang)
        except Exception as e:
            log("síntesis falló: %s: %s" % (type(e).__name__, e))
            return self._json(500, {"error": "%s: %s" % (type(e).__name__, e)})
        renovar(datos.get("quien") or "astraura")
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.send_header("X-Calculo-Ms", str(calculo))
        self.send_header("X-Duracion-Ms", str(dur))
        self.send_header("X-Pasos", str(pasos))
        self.send_header("X-Voz", voz)
        self.send_header("X-Rtf", str(ESTADO["rtf"]))
        self.end_headers()
        self.wfile.write(wav)


def main():
    threading.Thread(target=cargar, daemon=True).start()
    servidor = ServidorVoz(("127.0.0.1", PUERTO), Manejador)
    log("Voz en tiempo real escuchando en http://127.0.0.1:%d (cargando Supertonic…)" % PUERTO)
    servidor.serve_forever()


if __name__ == "__main__":
    main()
