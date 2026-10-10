"""servidor.py — servidor estático local del Estudio MetaGeminis (solo 127.0.0.1, solo carpetas permitidas).

Sirve a Chromium la plantilla, las escenas, las tipografías, three (desde node_modules) y los dos archivos de marca
del repositorio. Nada más: no hay forma de leer otro archivo del repositorio a través de él.
"""
from __future__ import annotations

import http.server
import mimetypes
import os
import socketserver
import threading
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ_REPO = AQUI.parent.parent.parent

MIME_EXTRA = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json", ".html": "text/html; charset=utf-8"}

# prefijo de URL -> (carpeta, archivos permitidos o None para toda la carpeta)
RUTAS = {
    "/plantilla/": (AQUI / "plantilla", None),
    "/escenas/": (AQUI / "escenas", None),
    "/fuentes/": (AQUI / "fuentes", None),
    "/vendor/three/": (RAIZ_REPO / "node_modules" / "three", None),
    "/repo/public/": (RAIZ_REPO / "public", {"starseed-symbol.png", "logo.png", "starseed-symbol-square.png"}),
}


def resolver(ruta_url: str) -> Path | None:
    """Traduce una URL a un archivo permitido, o None. Rechaza «..» y cualquier ruta fuera de las carpetas servidas."""
    ruta_url = ruta_url.split("?", 1)[0].split("#", 1)[0]
    for prefijo, (carpeta, permitidos) in RUTAS.items():
        if ruta_url.startswith(prefijo):
            resto = ruta_url[len(prefijo):]
            if not resto or ".." in resto.split("/") or resto.startswith("/"):
                return None
            if permitidos is not None and resto not in permitidos:
                return None
            destino = (carpeta / resto).resolve()
            try:
                destino.relative_to(carpeta.resolve())
            except ValueError:
                return None
            return destino if destino.is_file() else None
    return None


class _Manejador(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencio
        pass

    def do_GET(self):
        destino = resolver(self.path)
        if destino is None:
            self.send_error(404)
            return
        datos = destino.read_bytes()
        tipo = MIME_EXTRA.get(destino.suffix) or mimetypes.guess_type(str(destino))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)


class Servidor:
    def __init__(self):
        self._srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _Manejador)
        self._srv.daemon_threads = True
        self.puerto = self._srv.server_address[1]
        self._hilo = threading.Thread(target=self._srv.serve_forever, daemon=True)

    def __enter__(self):
        self._hilo.start()
        return self

    def __exit__(self, *a):
        self._srv.shutdown()
        self._srv.server_close()

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.puerto}"
