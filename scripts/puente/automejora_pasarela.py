#!/usr/bin/env python3
"""Pasarela de la caja de Meta^n (architecture/automejora-meta-n.md §3): socket UNIX en
carpeta 0700 con socket 0666; SOLO POST /v1/chat/completions y GET /v1/models; lo demás,
403. Reenvía al primer destino que responda, deja el cuerpo solo con campos de OpenAI,
cambia un modelo no permitido por el primero y lleva el tope nocturno de llamadas y
tokens (429 al pasarse). La clave va del entorno por el NOMBRE de su variable (destino["clave_env"]), jamás impresa."""
import http.client, json, os, threading, urllib.parse
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingUnixStreamServer

CAMPOS_OPENAI = {"model", "messages", "temperature", "top_p", "n", "stream", "stop", "seed",
    "max_tokens", "max_completion_tokens", "frequency_penalty", "presence_penalty", "user",
    "logit_bias", "logprobs", "top_logprobs", "response_format", "tools", "tool_choice",
    "parallel_tool_calls", "function_call", "functions"}

def cuerpo_sano(cuerpo, modelos_permitidos):
    """PURA: solo campos de OpenAI; un modelo de fuera va cambiado por el primero."""
    sano = {c: v for c, v in cuerpo.items() if c in CAMPOS_OPENAI}
    if modelos_permitidos and sano.get("model") not in modelos_permitidos:
        sano["model"] = modelos_permitidos[0]
    return sano

def tokens_del_uso(cuerpo):
    """PURA: total_tokens del usage de una respuesta, o 0 si falta."""
    uso = cuerpo.get("usage") if isinstance(cuerpo, dict) else None
    return int(uso.get("total_tokens") or 0) if isinstance(uso, dict) else 0

class Manejador(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def mandar(self, codigo, cuerpo):
        crudo = cuerpo if isinstance(cuerpo, bytes) else json.dumps(cuerpo).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(crudo)))
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(crudo)

    def atender(self):
        p = getattr(self.server, "pasarela")
        ruta = self.path.rstrip("/")
        if self.command == "POST" and ruta == "/v1/chat/completions":
            self.mandar(*p.completar(self))
        elif self.command == "GET" and ruta == "/v1/models":
            self.mandar(200, {"object": "list",
                              "data": [{"id": m, "object": "model"} for m in p.modelos_permitidos]})
        else:
            self.mandar(403, {"error": "ruta o metodo no permitidos"})

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = atender

    def log_message(self, format, *args): pass  # silencio: a la caja no llegan logs

class Pasarela:
    def __init__(self, ruta_socket, destinos, modelos_permitidos, tope_llamadas, tope_tokens):
        self.ruta_socket = ruta_socket
        self.destinos, self.modelos_permitidos = list(destinos), list(modelos_permitidos)
        self.tope_llamadas, self.tope_tokens = int(tope_llamadas), int(tope_tokens)
        self.llamadas, self.tokens, self._servidor = 0, 0, None
        self._cerradura = threading.Lock()

    def autorizar_llamada(self):
        """Átomo: si aún cabe una llamada la gasta y dice sí; si no, toca 429."""
        with self._cerradura:
            cabe = self.llamadas < self.tope_llamadas and self.tokens < self.tope_tokens
            self.llamadas += 1 if cabe else 0
            return cabe

    def completar(self, manejador):
        """Atiende una llamada de la caja; devuelve (codigo, cuerpo) para mandar."""
        try:
            cuerpo = json.loads(manejador.rfile.read(
                int(manejador.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return 400, {"error": "el cuerpo no es JSON"}
        if not self.autorizar_llamada(): return 429, {"error": "tope de la noche alcanzado"}
        envio = self.reenviar(cuerpo_sano(cuerpo, self.modelos_permitidos))
        if envio is None: return 502, {"error": "ningun destino contesto"}
        codigo, respuesta = envio
        with self._cerradura: self.tokens += tokens_del_uso(respuesta)
        return codigo, respuesta

    def reenviar(self, cuerpo):
        """Al primer destino que responda: (codigo, dict). Si cae todo, None."""
        texto = json.dumps(cuerpo).encode("utf-8")
        for destino in self.destinos:
            trozos = urllib.parse.urlsplit(destino["url"])
            cabeceras = {"Content-Type": "application/json"}
            clave = os.environ.get(destino.get("clave_env") or "")
            if clave: cabeceras["Authorization"] = "Bearer " + clave
            conexion = http.client.HTTPConnection(trozos.hostname, trozos.port or 80, timeout=120)
            try:
                conexion.request("POST", trozos.path.rstrip("/") + "/chat/completions", texto, cabeceras)
                respuesta = conexion.getresponse()
                datos, codigo = respuesta.read(), respuesta.status
            except (OSError, http.client.HTTPException): continue
            finally: conexion.close()
            try: contenido = json.loads(datos or b"{}")
            except ValueError: contenido = {"contenido": datos.decode("utf-8", "replace")}
            return codigo, contenido
        return None

    def servir(self):
        """Carpeta 0700, socket 0666 y a servir hasta parar(). El arranque de la noche."""
        carpeta = os.path.dirname(self.ruta_socket) or "."
        os.makedirs(carpeta, exist_ok=True); os.chmod(carpeta, 0o700)
        if os.path.exists(self.ruta_socket): os.unlink(self.ruta_socket)
        self._servidor = ThreadingUnixStreamServer(self.ruta_socket, Manejador)
        self._servidor.daemon_threads = True; setattr(self._servidor, "pasarela", self)
        os.chmod(self.ruta_socket, 0o666)
        self._servidor.serve_forever()

    def parar(self):
        if self._servidor: self._servidor.shutdown(); self._servidor.server_close()
        self._servidor = None

    def resumen(self):
        """Para el informe de la noche: llamadas y tokens gastados, con sus topes."""
        return {"llamadas": self.llamadas, "tokens": self.tokens,
                "tope_llamadas": self.tope_llamadas, "tope_tokens": self.tope_tokens}
