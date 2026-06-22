#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
local_brain.py — Servidor de cerebro de REFERENCIA para StarSeed OS.

Convierte ESTE equipo en un "cerebro": un pequeño servidor HTTP, sin dependencias
(solo biblioteca estándar de Python), que implementa el contrato de servidor de
cerebro que StarSeed OS (sección "Cerebros") sabe usar.

Contrato:
  - GET  /health            → {"ok": true, "name": "..."}
  - POST /run   {task, context?}  → {"ok": true, "result": ...}
  - POST /sync  {bundle}          → {"ok": true, "stored": ...}

CORS permisivo (Access-Control-Allow-Origin: *) + manejo de OPTIONS para que el
navegador pueda contactarlo directamente desde StarSeed OS (localhost está exento
del bloqueo de contenido mixto).

Uso:
    python3 local_brain.py
Escucha en http://127.0.0.1:8800

Luego, en StarSeed OS → Cerebros → añade un servidor de tipo "Servidor local"
con la URL  http://localhost:8800

Es software libre: cópialo, modifícalo y conéctale tu propia IA/agente local.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ------------------------------------------------------------------ #
# Configuración                                                       #
# ------------------------------------------------------------------ #

HOST = os.environ.get("STARSEED_BRAIN_HOST", "127.0.0.1")
PORT = int(os.environ.get("STARSEED_BRAIN_PORT", "8800"))
NAME = os.environ.get("STARSEED_BRAIN_NAME", "Cerebro local")

# Carpeta donde se guarda el último bundle sincronizado. Puedes apuntar aquí una
# carpeta de Syncthing para sincronizar tu cerebro entre varios dispositivos.
BRAIN_DIR = os.environ.get(
    "STARSEED_BRAIN_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed_brain"),
)
BUNDLE_PATH = os.path.join(BRAIN_DIR, "bundle.json")


# ------------------------------------------------------------------ #
# Lógica del cerebro                                                  #
# ------------------------------------------------------------------ #

def handle_run(task, context):
    """
    Procesa una tarea. Por defecto solo hace eco/acuse de recibo.

    # TODO: conecta aquí tu IA/agente local.
    # Aquí es donde enchufarías tu modelo local (Ollama, llama.cpp, etc.),
    # un agente, herramientas, RAG sobre el bundle sincronizado, etc.
    # Debes devolver un dict (será el campo "result").
    """
    return {
        "echo": task,
        "got_context": context is not None,
        "note": "Servidor de cerebro de referencia: edita handle_run() para conectar tu IA.",
        "brain": NAME,
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
        if self.path.rstrip("/") in ("/health", ""):
            self._json({"ok": True, "name": NAME})
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
                result = handle_run(task, context)
            except Exception as exc:  # noqa: BLE001  (servidor de referencia: errores amables)
                self._json({"ok": False, "error": "fallo en /run: %s" % exc}, status=500)
                return
            self._json({"ok": True, "result": result})
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
    print("Contrato: GET /health · POST /run · POST /sync")
    print("Bundle sincronizado → %s" % BUNDLE_PATH)
    print("Regístralo en StarSeed OS → Cerebros como servidor 'local' con la URL http://localhost:%d" % PORT)
    print("Ctrl+C para detener.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo…")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
