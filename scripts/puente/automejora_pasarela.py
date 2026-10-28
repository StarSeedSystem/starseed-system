#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La pasarela de la caja de automejora Meta^n (MTN1027E).

Solo stdlib. Un ThreadingUnixStreamServer con http.server que reenvía
POST /v1/chat/completions al primer destino que responda: Colibri si está,
y FreeLLMAPI con la clave del entorno. Cuenta llamadas/tokens y aplica tope.
"""
from __future__ import annotations

import http.client
import http.server
import json
import os
import socket
import socketserver
import threading
from typing import Any
from urllib.parse import urlparse


CAMPOS_PROHIBIDOS = ("provider", "transforms", "usage")


def leer_clave_freellmapi() -> str:
    """Lee FREELLMAPI_KEY del entorno del proceso. Nunca la imprime."""
    return os.environ.get("FREELLMAPI_KEY", "") or ""


def limpiar_cuerpo(cuerpo: dict) -> dict:
    """Quita provider, transforms, usage y cualquier campo que no sea de OpenAI."""
    limpio = {}
    for k, v in cuerpo.items():
        if k in CAMPOS_PROHIBIDOS:
            continue
        limpio[k] = v
    return limpio


def normalizar_modelo(modelo: Any, modelos_permitidos: list[str]) -> str:
    """Cambia un model no permitido por el primero permitido."""
    if not modelos_permitidos:
        return modelo
    if modelo in modelos_permitidos:
        return modelo
    return modelos_permitidos[0]


def extraer_tokens(datos_respuesta: dict) -> int:
    """Extrae tokens de una respuesta OpenAI si los lleva."""
    usage = datos_respuesta.get("usage")
    if isinstance(usage, dict):
        total = usage.get("total_tokens")
        if isinstance(total, int):
            return total
        # Suma por si acaso
        prompt = usage.get("prompt_tokens") or 0
        completion = usage.get("completion_tokens") or 0
        if isinstance(prompt, int) and isinstance(completion, int) and (prompt or completion):
            return prompt + completion
    return 0


class Pasarela:
    def __init__(self, ruta_socket: str, destinos: list[str],
                 modelos_permitidos: list[str], tope_llamadas: int,
                 tope_tokens: int):
        self.ruta_socket = ruta_socket
        self.destinos = destinos
        self.modelos_permitidos = modelos_permitidos or []
        self.tope_llamadas = tope_llamadas
        self.tope_tokens = tope_tokens
        self.llamadas = 0
        self.tokens = 0
        self._lock = threading.Lock()
        self._servidor = None

    def resumen(self) -> dict:
        with self._lock:
            return {
                "llamadas": self.llamadas,
                "tokens": self.tokens,
                "tope_llamadas": self.tope_llamadas,
                "tope_tokens": self.tope_tokens,
            }

    def _crear_carpeta_y_socket(self):
        """Crea la carpeta 0700 y el socket con permisos 0666."""
        carpeta = os.path.dirname(os.path.abspath(self.ruta_socket))
        if carpeta:
            # Crear con permisos restrictivos
            os.makedirs(carpeta, mode=0o700, exist_ok=True)
            try:
                os.chmod(carpeta, 0o700)
            except OSError:
                pass
        # Eliminar socket viejo si existe
        try:
            if os.path.exists(self.ruta_socket):
                os.unlink(self.ruta_socket)
        except OSError:
            pass

    def _enviar_a_destino(self, destino: str, cuerpo_bytes: bytes, headers_extra=None):
        """Envía la petición al destino."""
        parsed = urlparse(destino)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        path = parsed.path or ""
        if path.endswith("/"):
            path = path[:-1]
        ruta = path + "/chat/completions"

        conn = http.client.HTTPConnection(host, port, timeout=60)
        try:
            cabeceras = {"Content-Type": "application/json"}
            if headers_extra:
                cabeceras.update(headers_extra)
            conn.request("POST", ruta, body=cuerpo_bytes, headers=cabeceras)
            resp = conn.getresponse()
            datos = resp.read()
            return resp.status, resp.getheaders(), datos
        finally:
            conn.close()

    def arrancar(self):
        self._crear_carpeta_y_socket()
        pasarela = self

        class Manejador(http.server.BaseHTTPRequestHandler):
            server_version = "PasarelaAutomejora/1.0"
            sys_version = ""

            def log_message(self, *args):
                pass  # Silencioso

            def _enviar_json(self, codigo, obj):
                datos = json.dumps(obj).encode("utf-8")
                self.send_response(codigo)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(datos)))
                self.end_headers()
                self.wfile.write(datos)

            def _responder_403(self):
                self._enviar_json(403, {"error": {"message": "forbidden"}})

            def do_GET(self):
                if self.path in ("/v1/models", "/models"):
                    modelos = pasarela.modelos_permitidos
                    data = {"object": "list", "data": [{"id": m, "object": "model"} for m in modelos]}
                    self._enviar_json(200, data)
                    return
                self._responder_403()

            def do_POST(self):
                if self.path not in ("/v1/chat/completions", "/chat/completions"):
                    self._responder_403()
                    return

                # Comprobar tope
                with pasarela._lock:
                    if pasarela.tope_llamadas and pasarela.llamadas >= pasarela.tope_llamadas:
                        self._enviar_json(429, {"error": {"message": "rate limit exceeded"}})
                        return
                    if pasarela.tope_tokens and pasarela.tokens >= pasarela.tope_tokens:
                        self._enviar_json(429, {"error": {"message": "rate limit exceeded"}})
                        return

                try:
                    longitud = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    longitud = 0
                cuerpo_bruto = self.rfile.read(longitud) if longitud > 0 else b"{}"
                try:
                    cuerpo = json.loads(cuerpo_bruto)
                except Exception:
                    cuerpo = {}

                if isinstance(cuerpo, dict):
                    cuerpo = limpiar_cuerpo(cuerpo)
                    cuerpo["model"] = normalizar_modelo(cuerpo.get("model"), pasarela.modelos_permitidos)
                cuerpo_bytes = json.dumps(cuerpo).encode("utf-8")

                # Intentar destinos en orden
                ultimo_error = None
                for destino in pasarela.destinos:
                    try:
                        cabeceras_extra = {}
                        if "freellmapi" in destino or "3001" in destino:
                            clave = leer_clave_freellmapi()
                            if clave:
                                cabeceras_extra["Authorization"] = f"Bearer {clave}"
                        status, headers_resp, datos = pasarela._enviar_a_destino(destino, cuerpo_bytes, cabeceras_extra)
                        if status >= 200 and status < 300:
                            # Actualizar contadores
                            try:
                                resp_json = json.loads(datos)
                                tokens_add = extraer_tokens(resp_json)
                            except Exception:
                                tokens_add = 0
                            with pasarela._lock:
                                pasarela.llamadas += 1
                                pasarela.tokens += tokens_add
                            # Reenviar respuesta
                            self.send_response(status)
                            for k, v in headers_resp:
                                if k.lower() in ("content-type", "content-length"):
                                    self.send_header(k, v)
                            self.end_headers()
                            self.wfile.write(datos)
                            return
                        else:
                            ultimo_error = (status, datos)
                    except Exception as e:
                        ultimo_error = e
                        continue
                # Si ningún destino respondió bien
                self._enviar_json(502, {"error": {"message": "bad gateway"}})

            def do_PUT(self):
                self._responder_403()

            def do_DELETE(self):
                self._responder_403()

            def do_PATCH(self):
                self._responder_403()

        class Servidor(socketserver.ThreadingUnixStreamServer):
            allow_reuse_address = True

            def server_bind(self):
                socketserver.UnixStreamServer.server_bind(self)
                try:
                    os.chmod(self.server_address, 0o666)
                except OSError:
                    pass

        self._servidor = Servidor(self.ruta_socket, Manejador)
        return self._servidor

    def servir_forever(self):
        srv = self.arrancar()
        try:
            srv.serve_forever()
        finally:
            srv.server_close()


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--destino", action="append", dest="destinos")
    parser.add_argument("--modelo-permitido", action="append", dest="modelos_permitidos")
    parser.add_argument("--tope-llamadas", type=int, default=0)
    parser.add_argument("--tope-tokens", type=int, default=0)
    args = parser.parse_args()

    destinos = args.destinos or ["http://127.0.0.1:4480/v1", "http://127.0.0.1:3001/v1"]
    modelos = args.modelos_permitidos or []
    pasarela = Pasarela(args.socket, destinos, modelos, args.tope_llamadas, args.tope_tokens)
    pasarela.servir_forever()


if __name__ == "__main__":
    main()
