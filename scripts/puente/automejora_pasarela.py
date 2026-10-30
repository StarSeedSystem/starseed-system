#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pasarela de la caja de automejora Meta^n (MTN1027E · contrato §3): socket
UNIX del anfitrión que SOLO pasa POST /v1/chat/completions (reenviado al
primer destino vivo: Colibri 4480, si no FreeLLMAPI del A1 con SU clave del
entorno, jamás impresa) y GET /v1/models; cuenta llamadas y tokens, y al
pasar un tope responde 429 SIN reenviar; otra ruta o método: 403. A la caja
no llega clave ni ruta del anfitrión: solo el socket, 0666 en carpeta 0700."""
import http.client, json, os, socketserver  # noqa: E401
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

# Campos del esquema OpenAI que pasan: lo demás (provider, transforms,
# usage, invenciones) se quita del cuerpo antes de reenviar.
CAMPOS_ABIERTOS = ("model", "messages", "temperature", "top_p", "n", "stop",
                   "max_tokens", "seed", "presence_penalty", "frequency_penalty",
                   "response_format", "stream")


def limpiar_cuerpo(bruto: bytes) -> dict:
    """Quita provider, transforms, usage y toda invención (ok, cuerpo, motivo)."""
    try:
        crudo = json.loads(bruto.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {"ok": False, "cuerpo": {}, "motivo": "el cuerpo no es JSON"}
    if not isinstance(crudo, dict):
        return {"ok": False, "cuerpo": {}, "motivo": "el cuerpo no es objeto"}
    limpio = {k: v for k, v in crudo.items() if k in CAMPOS_ABIERTOS}
    return {"ok": True, "cuerpo": limpio, "motivo": ""}


def elegir_modelo(modelo: str | None, permitidos: list[str]) -> str:
    return modelo if modelo in permitidos else permitidos[0]  # o el 1.° permitido


def hay_sitio(llamadas: int, tokens: int,
              tope_llamadas: int, tope_tokens: int) -> bool:
    """¿Cabe una llamada más sin pasar los topes? (sin efectos)"""
    return llamadas < tope_llamadas and tokens < tope_tokens


def tokens_de(texto: str) -> int:
    """usage.total_tokens de una respuesta; 0 si no se puede leer."""
    try:
        return int(json.loads(texto).get("usage", {}).get("total_tokens") or 0)
    except (ValueError, AttributeError, TypeError):
        return 0


def destinos_defecto() -> list[dict]:
    """Colibri primero (razón local); si no, FreeLLMAPI del A1."""
    return [{"url": "http://127.0.0.1:4480/v1", "clave_de": None},
            {"url": "http://127.0.0.1:3001/v1", "clave_de": "FREELLMAPI_KEY"}]


class Pasarela:
    """Cuenta llamadas y tokens, y reenvía al primer destino vivo."""

    def __init__(self, destinos: list[dict], modelos: list[str],
                 tope_llamadas: int, tope_tokens: int) -> None:
        self.destinos, self.modelos = destinos, modelos
        self.tope_llamadas, self.tope_tokens = tope_llamadas, tope_tokens
        self.cuenta = {"llamadas": 0, "tokens": 0}

    def reenvia(self, cuerpo: dict) -> dict:
        """Cambia un model no permitido por el primero y prueba cada destino:
        la primera respuesta viva, o 502 si nadie respondió. La clave del
        entorno se pone en la cabecera: jamás impresa ni guardada."""
        cuerpo = dict(cuerpo)
        cuerpo["model"] = elegir_modelo(cuerpo.get("model"), self.modelos)
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        for destino in self.destinos:
            piezas = urlsplit(destino["url"])
            cabecera = {"Content-Type": "application/json"}
            nombre = destino.get("clave_de")
            if nombre and os.environ.get(nombre):
                cabecera["Authorization"] = "Bearer " + os.environ[nombre]
            conn = http.client.HTTPConnection(piezas.hostname, piezas.port, timeout=120)
            try:
                conn.request("POST", piezas.path.rstrip("/") + "/chat/completions",
                             datos, cabecera)
                respuesta = conn.getresponse()
                texto = respuesta.read().decode("utf-8", "replace")
            except OSError:
                conn.close()
                continue  # caído: se prueba el siguiente de la lista
            finally:
                conn.close()
            tipo = respuesta.getheader("Content-Type") or "application/json"
            return {"codigo": respuesta.status, "tipo": tipo,
                    "texto": texto, "tokens": tokens_de(texto)}
        return {"codigo": 502, "tipo": "application/json", "tokens": 0, "texto": json.dumps(
            {"error": {"message": "nadie respondió", "type": "pasarela", "code": 502}})}

    def resumen(self) -> dict:
        """Informe de la noche para Genesis y el director de aprendizaje."""
        c = self.cuenta
        agotado = not hay_sitio(c["llamadas"], c["tokens"],
                                self.tope_llamadas, self.tope_tokens)
        return {"fecha": datetime.now().isoformat(timespec="seconds"),
                "llamadas": c["llamadas"], "tokens": c["tokens"],
                "tope_llamadas": self.tope_llamadas, "tope_tokens": self.tope_tokens,
                "agotado": agotado, "destinos": [d["url"] for d in self.destinos],
                "modelos": list(self.modelos)}


def _manejador(pasarela: Pasarela) -> type:
    """La clase que atiende cada conexión, cerrada sobre su pasarela."""
    class Trato(BaseHTTPRequestHandler):
        def _responder(self, codigo, bruto, tipo="application/json"):
            if not isinstance(bruto, bytes):
                if isinstance(bruto, dict):
                    bruto = json.dumps(bruto, ensure_ascii=False)
                bruto = bruto.encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(bruto)))
            self.end_headers()
            self.wfile.write(bruto)

        def _error(self, codigo, mensaje):
            self._responder(codigo, {"error": {"message": mensaje,
                                               "type": "pasarela", "code": codigo}})

        def do_GET(self):
            ruta = self.path.split("?", 1)[0]
            if ruta != "/v1/models":
                return self._error(403, "ruta no permitida: %s" % ruta)
            self._responder(200, {"object": "list", "data": [
                {"id": m, "object": "model"} for m in pasarela.modelos]})

        def do_POST(self):
            ruta = self.path.split("?", 1)[0]
            if ruta != "/v1/chat/completions":
                return self._error(403, "ruta no permitida: %s" % ruta)
            c = pasarela.cuenta
            if not hay_sitio(c["llamadas"], c["tokens"],
                             pasarela.tope_llamadas, pasarela.tope_tokens):
                return self._error(429, "tope de la noche: %d llamadas · %d tokens"
                                   % (c["llamadas"], c["tokens"]))
            pedido = limpiar_cuerpo(self.rfile.read(
                int(self.headers.get("Content-Length") or 0)))
            if not pedido["ok"]:
                return self._error(400, pedido["motivo"])
            salido = pasarela.reenvia(pedido["cuerpo"])
            c["llamadas"] += 1
            c["tokens"] += salido["tokens"]
            self._responder(salido["codigo"], salido["texto"], salido["tipo"])

        def log_message(self, format, *args):
            pass  # silencio: la pasarela no registra datos en disco

    return Trato


def montar(ruta_socket: str, destinos=None, modelos_permitidos=None,
           tope_llamadas: int = 3000, tope_tokens: int = 600_000):
    """Carpeta 0700 si falta, socket 0666 y el servidor UNIX con hilos."""

    class Servidor(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
        daemon_threads = True

    carpeta = os.path.dirname(ruta_socket)
    if carpeta and not os.path.isdir(carpeta):
        os.makedirs(carpeta)
        os.chmod(carpeta, 0o700)
    if os.path.exists(ruta_socket):
        os.unlink(ruta_socket)
    puerta = Pasarela(destinos or destinos_defecto(),
                      modelos_permitidos or ["colibri-razon"],
                      tope_llamadas, tope_tokens)
    servidor = Servidor(ruta_socket, _manejador(puerta))
    os.chmod(ruta_socket, 0o666)
    servidor.pasarela = puerta  # type: ignore[attr-defined]
    return servidor


if __name__ == "__main__":
    LISTA = [m for m in os.environ.get("STARSEED_AUTOMEJORA_MODELOS", "").split(",") if m]
    montar(os.environ.get("STARSEED_AUTOMEJORA_SOCKET", "state/automejora/llm.sock"),
           None, LISTA or None).serve_forever()
