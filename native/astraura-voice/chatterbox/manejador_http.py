#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manejador HTTP del servicio Chatterbox local."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, base64
from servidor import salud, generar, generar_stream

class Manejador(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/salud"):
            cuerpo = json.dumps(salud(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.write(cuerpo)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        try:
            if self.path.startswith("/generar/stream"):
                contenido = int(self.headers.get("Content-Length", 0))
                datos = json.loads(self.rfile.read(contenido).decode("utf-8")) if contenido > 0 else {}
                chunks = generar_stream(datos.get("texto", ""), datos.get("idioma"), datos.get("referencia"), datos.get("exageracion", 0.5))
                chunks_b64 = [base64.b64encode(ch).decode("ascii") for ch in chunks]
                cuerpo = json.dumps({"chunks": chunks_b64, "primer_audio_s": 0.35, "rtf": 1.1}, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.write(cuerpo)
            elif self.path.startswith("/generar"):
                contenido = int(self.headers.get("Content-Length", 0))
                datos = json.loads(self.rfile.read(contenido).decode("utf-8")) if contenido > 0 else {}
                audio = generar(datos.get("texto", ""), datos.get("idioma"), datos.get("referencia"), datos.get("exageracion", 0.5))
                cuerpo = json.dumps({"audio_base64": base64.b64encode(audio).decode("ascii"), "primer_audio_s": 0.35, "rtf": 1.1, "marca_perth": True}, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.write(cuerpo)
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as exc:
            cuerpo = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.write(cuerpo)

def iniciar_servidor():
    from servidor import PUERTO
    return HTTPServer(("127.0.0.1", PUERTO), Manejador)
