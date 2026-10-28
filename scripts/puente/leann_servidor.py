# -*- coding: utf-8 -*-
"""Servidor HTTP del recuerdo semántico LEANN en el A1 (contrato §3, LNN1028B).

stdlib `http.server`: escucha SOLO en 127.0.0.1 (`STARSEED_LEANN_PUERTO`, 4495)
y exige el token de `~/.starseed/leann.token` en la cabecera `X-StarSeed-Token`:
403 sin ese token correcto, con un `Host` distinto de 127.0.0.1 o con `Origin`
(nada de navegador). La lógica vive en `leann_recuerdo.py`, que no habla HTTP.
"""

import hmac
import http.server
import json
import os
import re

from leann_recuerdo import (PeticionMala, RE_NOMBRE, buscar_indice,
                            indices_disponibles, poner_en_indice)

PUERTO_DEFECTO = 4495
CABECERA_TOKEN = "X-StarSeed-Token"
RE_RUTA = re.compile(r"^/indices/([^/]+)/([a-z_]+)$")
_TOKEN_RUTA = None  # las pruebas apuntan aquí a un token temporal


def ruta_token():
    return _TOKEN_RUTA or os.path.join(os.path.expanduser("~"), ".starseed", "leann.token")


def leer_token(ruta=None):
    """Token del A1; si el fichero no existe, 32 bytes de urandom en hex (0600)."""
    uso = ruta or ruta_token()
    try:
        with open(uso, encoding="ascii") as fichero:
            existente = fichero.read().strip()
        if existente:
            return existente
        token = os.urandom(32).hex()
        os.makedirs(os.path.dirname(uso), exist_ok=True)
        descriptor = os.open(uso, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as fichero:
            fichero.write(token)
        os.chmod(uso, 0o600)
        return token
    except OSError:
        return ""


class Manejador(http.server.BaseHTTPRequestHandler):
    """Un guardia para todo: sin token, Host ajeno u Origin, 403 sin mirar rutas."""

    protocol_version = "HTTP/1.0"  # cada petición cierra su conexión; aquí no se reusa

    def log_message(self, format=None, *args):  # noqa: A002 — firma base de http.server
        pass

    def _json(self, estado, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _guardia(self):
        """403 sin el token correcto, con un Host ajeno a 127.0.0.1 o con Origin."""
        token = leer_token()
        dado = self.headers.get(CABECERA_TOKEN) or ""
        anfitrion = (self.headers.get("Host") or "").split(":", 1)[0] == "127.0.0.1"
        if (not anfitrion or self.headers.get("Origin") or not token
                or not hmac.compare_digest(dado.encode("utf-8"), token.encode("utf-8"))):
            self._json(403, {"error": "solo 127.0.0.1, sin Origin y con X-StarSeed-Token"})
            return False
        return True

    def _atender(self):
        """Rutas del §3 y sus fallas, todas tras el guardia."""
        try:
            if not self._guardia():
                return
            ruta = self.path.split("?", 1)[0]
            if self.command == "GET":
                if ruta == "/salud":
                    self._json(200, {"estado": "ok", "servicio": "leann-recuerdo"})
                elif ruta == "/indices":
                    self._json(200, {"indices": indices_disponibles()})
                else:
                    raise PeticionMala(404, "ruta desconocida")
                return
            encontrado = RE_RUTA.match(ruta)
            if not encontrado or encontrado.group(2) not in ("buscar", "poner"):
                raise PeticionMala(404, "ruta desconocida")
            nombre = encontrado.group(1)
            if not RE_NOMBRE.match(nombre):
                raise PeticionMala(400, "nombre de índice no admitido: [a-z0-9-]")
            try:
                cuerpo = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                datos = json.loads(cuerpo.decode("utf-8") or "{}")
            except ValueError:
                raise PeticionMala(400, "el cuerpo ha de ser JSON")
            if not isinstance(datos, dict):
                raise PeticionMala(400, "el cuerpo ha de ser un objeto")
            funcion = buscar_indice if encontrado.group(2) == "buscar" else poner_en_indice
            self._json(200, funcion(nombre, datos))
        except PeticionMala as fallo:
            self._json(fallo.estado, {"error": fallo.args[0] or "petición rechazada"})
        except Exception:
            self._json(500, {"error": "fallo interno del servidor"})

    do_GET = do_POST = _atender


if __name__ == "__main__":
    puerto = int(os.environ.get("STARSEED_LEANN_PUERTO") or PUERTO_DEFECTO)
    http.server.ThreadingHTTPServer.daemon_threads = True
    http.server.ThreadingHTTPServer(("127.0.0.1", puerto), Manejador).serve_forever()

