#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
local_brain.py — Servidor de cerebro de REFERENCIA para StarSeed OS.

Convierte ESTE equipo en un "cerebro": un pequeño servidor HTTP, sin dependencias
(solo biblioteca estándar de Python), que implementa el contrato de servidor de
cerebro que StarSeed OS (sección "Cerebros") sabe usar.

Contrato:
  - GET  /                  → banner JSON con info del servidor
  - GET  /health            → {"ok": true, "name": "..."}
  - POST /run   {task, context?}  → {"ok": true, "result": ..., "via": "ollama|stub"}
  - POST /sync  {bundle}          → {"ok": true, "stored": ...}

CORS permisivo (Access-Control-Allow-Origin: *) + manejo de OPTIONS para que el
navegador pueda contactarlo directamente desde StarSeed OS (localhost está exento
del bloqueo de contenido mixto).

IA libre opcional (Ollama):
  Si defines la variable de entorno OLLAMA_URL (por defecto se prueba
  http://127.0.0.1:11434) y Ollama está accesible, /run reenvía la tarea como
  prompt a Ollama (modelo OLLAMA_MODEL o "llama3") y devuelve su respuesta.
  Si Ollama no está configurado o no responde, /run cae al stub de eco.

Uso:
    python3 local_brain.py
Por defecto escucha en http://0.0.0.0:8800 (apto para VPS) — en local visítalo
como http://localhost:8800

Luego, en StarSeed OS → Servidores / Cerebros → añade un servidor con la URL
http://localhost:8800 (local) o http://IP_DE_TU_VPS:8800 (remoto).

Es software libre: cópialo, modifícalo y conéctale tu propia IA/agente local.
"""

import json
import os
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ------------------------------------------------------------------ #
# Configuración                                                       #
# ------------------------------------------------------------------ #

# HOST=0.0.0.0 por defecto para que funcione en un VPS (Hostinger, etc.).
# Acepta tanto las variables genéricas (HOST/PORT, las que usan Docker/VPS)
# como las históricas con prefijo STARSEED_BRAIN_*.
HOST = os.environ.get("HOST", os.environ.get("STARSEED_BRAIN_HOST", "0.0.0.0"))
PORT = int(os.environ.get("PORT", os.environ.get("STARSEED_BRAIN_PORT", "8800")))
NAME = os.environ.get("STARSEED_BRAIN_NAME", "Cerebro local")

# Carpeta donde se guarda el último bundle sincronizado. Puedes apuntar aquí una
# carpeta de Syncthing para sincronizar tu cerebro entre varios dispositivos.
BRAIN_DIR = os.environ.get(
    "STARSEED_BRAIN_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed_brain"),
)
BUNDLE_PATH = os.path.join(BRAIN_DIR, "bundle.json")

# ----- IA libre opcional vía Ollama (https://ollama.com) ----------- #
# OLLAMA_URL: base del servidor Ollama. Por defecto se intenta el local.
# OLLAMA_MODEL: modelo a usar (debes haberlo descargado: `ollama pull llama3`).
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3")
# Timeout corto: si Ollama no responde rápido, caemos al stub sin colgar StarSeed.
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "120"))


# ------------------------------------------------------------------ #
# Hook de IA libre (Ollama) — solo biblioteca estándar (urllib)       #
# ------------------------------------------------------------------ #

def _ollama_generate(task, context):
    """
    Reenvía la tarea como prompt a Ollama (POST {OLLAMA_URL}/api/generate).

    Devuelve el texto de respuesta (str) si todo va bien, o None si Ollama no
    está configurado/accesible o falla por cualquier motivo (nunca lanza).
    """
    if not OLLAMA_URL:
        return None

    prompt = task if isinstance(task, str) else json.dumps(task, ensure_ascii=False)
    # Si llega contexto, lo anteponemos como pista para el modelo.
    if context:
        try:
            ctx = context if isinstance(context, str) else json.dumps(context, ensure_ascii=False)
        except (TypeError, ValueError):
            ctx = str(context)
        prompt = "Contexto:\n%s\n\nTarea:\n%s" % (ctx, prompt)

    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL + "/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        # La API de Ollama devuelve el texto en la clave "response".
        return data.get("response")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError,
            ValueError, json.JSONDecodeError):
        # Ollama no disponible o respuesta inválida → caemos al stub.
        return None


# ------------------------------------------------------------------ #
# Lógica del cerebro                                                  #
# ------------------------------------------------------------------ #

def handle_run(task, context):
    """
    Procesa una tarea.

    1) Si Ollama (IA libre) está configurado y accesible, reenvía la tarea y
       devuelve {"ok": true, "result": <texto>, "via": "ollama"}.
    2) Si no, hace eco/acuse de recibo con {"via": "stub"}.

    Devuelve un dict completo de respuesta (incluye "ok" y "via"). Así el
    servidor puede distinguir si usó la IA o el stub.

    # Puedes editar esta función para conectar otra IA/agente local
    # (llama.cpp, un agente con herramientas, RAG sobre el bundle, etc.).
    """
    answer = _ollama_generate(task, context)
    if answer is not None:
        return {
            "ok": True,
            "via": "ollama",
            "result": answer,
        }

    # --- Fallback: stub de eco (sin IA configurada) ---------------- #
    return {
        "ok": True,
        "via": "stub",
        "result": {
            "echo": task,
            "got_context": context is not None,
            "note": "Stub de referencia (sin IA). Define OLLAMA_URL + `ollama pull llama3` para respuestas reales, o edita handle_run().",
            "brain": NAME,
        },
    }


def handle_sync(bundle):
    """
    Guarda el bundle recibido en disco (BUNDLE_PATH). Esta carpeta puede ser una
    carpeta de Syncthing para tener el cerebro replicado en varios dispositivos.
    Devuelve metadatos de almacenamiento.
    """
    os.makedirs(BRAIN_DIR, exist_ok=True)
    with open(BUNDLE_PATH, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    return {
        "path": BUNDLE_PATH,
        "bytes": os.path.getsize(BUNDLE_PATH),
        "keys": sorted(list(bundle.keys())) if isinstance(bundle, dict) else None,
    }


# ------------------------------------------------------------------ #
# Servidor HTTP                                                       #
# ------------------------------------------------------------------ #

class BrainHandler(BaseHTTPRequestHandler):
    # --- utilidades de respuesta ---------------------------------- #

    def _cors(self):
        # CORS permisivo: imprescindible para que el navegador pueda llamar
        # directamente a este servidor local desde StarSeed OS.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except (TypeError, ValueError):
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    # --- métodos HTTP --------------------------------------------- #

    def do_OPTIONS(self):  # noqa: N802  (nombre exigido por http.server)
        # Respuesta al preflight de CORS.
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        path = self.path.rstrip("/")
        if path == "/health":
            self._json({"ok": True, "name": NAME})
            return
        if path == "":
            # Banner JSON en la raíz: útil para comprobar que el server vive.
            self._json({
                "ok": True,
                "name": NAME,
                "service": "starseed-brain",
                "endpoints": ["GET /health", "POST /run", "POST /sync"],
                "ai": "ollama" if OLLAMA_URL else "stub",
                "model": OLLAMA_MODEL,
            })
            return
        self._json({"ok": False, "error": "ruta no encontrada"}, status=404)

    def do_POST(self):  # noqa: N802
        path = self.path.rstrip("/")
        try:
            body = self._read_json_body()
        except (ValueError, json.JSONDecodeError):
            self._json({"ok": False, "error": "JSON inválido"}, status=400)
            return

        if path == "/run":
            task = body.get("task", "")
            context = body.get("context")
            try:
                # handle_run ya devuelve un dict completo con "ok"/"via"/"result".
                response = handle_run(task, context)
            except Exception as exc:  # noqa: BLE001  (servidor de referencia: errores amables)
                self._json({"ok": False, "error": "fallo en /run: %s" % exc}, status=500)
                return
            self._json(response)
            return

        if path == "/sync":
            bundle = body.get("bundle")
            try:
                stored = handle_sync(bundle)
            except Exception as exc:  # noqa: BLE001
                self._json({"ok": False, "error": "fallo en /sync: %s" % exc}, status=500)
                return
            self._json({"ok": True, "stored": stored})
            return

        self._json({"ok": False, "error": "ruta no encontrada"}, status=404)

    # Silencia el log por defecto (descomenta para depurar).
    def log_message(self, fmt, *args):  # noqa: A003
        return


def main():
    os.makedirs(BRAIN_DIR, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), BrainHandler)
    print("StarSeed · %s escuchando en http://%s:%d" % (NAME, HOST, PORT))
    print("Contrato: GET / · GET /health · POST /run · POST /sync")
    if OLLAMA_URL:
        print("IA libre: Ollama en %s (modelo: %s) — fallback a stub si no responde" % (OLLAMA_URL, OLLAMA_MODEL))
    else:
        print("IA libre: deshabilitada (define OLLAMA_URL para activarla)")
    print("Bundle sincronizado → %s" % BUNDLE_PATH)
    print("Regístralo en StarSeed OS → Servidores con la URL http://localhost:%d (o http://IP:%d en VPS)" % (PORT, PORT))
    print("Ctrl+C para detener.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo…")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
