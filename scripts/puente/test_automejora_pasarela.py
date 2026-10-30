# -*- coding: utf-8 -*-
"""Pruebas de automejora_pasarela.py (MTN1027E): la pasarela de la caja.

Destino falso local de HTTP y socket UNIX en una carpeta temporal;
topes, permisos y el cambio de modelo no permitido."""
import http.client
import json
import os
import socket
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import importlib.util
from pathlib import Path

_especie = importlib.util.spec_from_file_location(
    "automejora_pasarela",
    Path(__file__).resolve().parent / "automejora_pasarela.py")
assert _especie is not None and _especie.loader is not None
pasarela = importlib.util.module_from_spec(_especie)
_especie.loader.exec_module(pasarela)

COSPEA = json.dumps({"choices": [{"message": {"role": "assistant", "content": "hola"}}],
                     "usage": {"total_tokens": 37}}).encode()

REGISTRO: dict = {"n": 0}


def destino_falso(contesta_asi, el_codigo=200) -> ThreadingHTTPServer:
    """Un servidor HTTP local que registra y contesta igual siempre."""
    class Trato(BaseHTTPRequestHandler):
        def do_POST(self):
            REGISTRO["n"] += 1
            cuerpo = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            REGISTRO["ultimo"] = {"ruta": self.path, "cuerpo": json.loads(cuerpo),
                                  "autorizacion": self.headers.get("Authorization")}
            self.send_response(el_codigo)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(contesta_asi if isinstance(contesta_asi, bytes)
                             else json.dumps(contesta_asi).encode())

        def log_message(self, format, *args):
            pass

    servidor = ThreadingHTTPServer(("127.0.0.1", 0), Trato)
    threading.Thread(target=servidor.serve_forever, args=(0.05,), daemon=True).start()
    return servidor


class HTTPunix(http.client.HTTPConnection):
    """HTTP sobre socket UNIX, para hablarle a la pasarela como un cliente."""

    def __init__(self, ruta_socket: str):
        super().__init__("localhost")
        self._ruta = ruta_socket

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self._ruta)


class TestPruebasPuras(unittest.TestCase):
    def test_limpieza_del_cuerpo(self):
        crudo = json.dumps({"model": "m1", "messages": [{"role": "x", "content": "y"}],
                            "provider": "pepe", "transforms": ["t"], "usage": {"x": 1},
                            "viene_de_no_se_sabe": 3, "temperature": 0.2}).encode()
        limpio = pasarela.limpiar_cuerpo(crudo)
        self.assertTrue(limpio["ok"])
        self.assertEqual(limpio["cuerpo"], {"model": "m1", "temperature": 0.2,
                                            "messages": [{"role": "x", "content": "y"}]})

    def test_cuerpo_errado(self):
        self.assertFalse(pasarela.limpiar_cuerpo(b"no es json")["ok"])
        self.assertFalse(pasarela.limpiar_cuerpo(b"[1,2]")["ok"])

    def test_elegir_modelo_y_sitio(self):
        self.assertEqual(pasarela.elegir_modelo("suyo", ["a", "b"]), "a")
        self.assertEqual(pasarela.elegir_modelo("a", ["a", "b"]), "a")
        self.assertTrue(pasarela.hay_sitio(9, 100, 10, 500))
        self.assertFalse(pasarela.hay_sitio(10, 100, 10, 500))
        self.assertFalse(pasarela.hay_sitio(9, 500, 10, 500))

    def test_tokens_de(self):
        self.assertEqual(pasarela.tokens_de(COSPEA), 37)
        self.assertEqual(pasarela.tokens_de("no"), 0)


class TestPasarelaViva(unittest.TestCase):
    """La pasarela entera: socket UNIX en carpeta temporal y destinos falsos."""

    def setUp(self):
        REGISTRO.update(n=0, ultimo=None)
        self.carpeta = tempfile.TemporaryDirectory()
        self.ruta = os.path.join(self.carpeta.name, "run", "llm.sock")
        self.vivo = destino_falso(COSPEA)
        servidores = [self.vivo]
        self.http_puerto = self.vivo.server_address[1]
        self.servidor = pasarela.montar(
            self.ruta,
            [{"url": "http://127.0.0.1:%d/v1" % self.http_puerto, "clave_de": None}],
            ["colibri-razon", "otro-gratis"], 5, 40
        )
        threading.Thread(target=self.servidor.serve_forever, args=(0.05,),
                         daemon=True).start()

    def tearDown(self):
        self.servidor.shutdown()
        self.servidor.server_close()
        self.vivo.shutdown()
        self.vivo.server_close()
        self.carpeta.cleanup()
        os.environ.pop("FREELLMAPI_KEY", None)

    def _post(self, cuerpo: bytes) -> http.client.HTTPResponse:
        con = HTTPunix(self.ruta)
        con.request("POST", "/v1/chat/completions", cuerpo,
                    {"Content-Type": "application/json"})
        respuesta = con.getresponse()
        self.leido = respuesta.read()
        con.close()
        return respuesta

    def _get(self, ruta: str) -> http.client.HTTPResponse:
        con = HTTPunix(self.ruta)
        con.request("GET", ruta)
        respuesta = con.getresponse()
        self.leido = respuesta.read()
        con.close()
        return respuesta

    def test_post_salto_y_cuenta(self):
        respuesta = self._post(json.dumps(
            {"model": "suyo-extranjero", "messages": [], "provider": "pepe",
             "garlick": 1}).encode())
        self.assertEqual(respuesta.status, 200)
        self.assertEqual(pasarela.tokens_de(self.leido.decode()), 37)
        ultimo = REGISTRO["ultimo"]
        self.assertEqual(ultimo["ruta"], "/v1/chat/completions")
        self.assertEqual(ultimo["cuerpo"]["model"], "colibri-razon")
        self.assertNotIn("provider", ultimo["cuerpo"])
        self.assertNotIn("garlick", ultimo["cuerpo"])
        self.assertEqual(self.servidor.pasarela.cuenta,  # type: ignore
                         {"llamadas": 1, "tokens": 37})

    def test_models_y_prohibida(self):
        self.assertEqual(self._get("/v1/models").status, 200)
        lista = json.loads(self.leido.decode())
        self.assertEqual([m["id"] for m in lista["data"]],
                         ["colibri-razon", "otro-gratis"])
        self.assertEqual(self._get("/v1/otra").status, 403)
        con = HTTPunix(self.ruta)
        con.request("POST", "/v1/juguetes", b"{}",
                    {"Content-Type": "application/json"})
        otra = con.getresponse()
        con.close()
        self.assertEqual(otra.status, 403)

    def test_clave_del_entorno_y_destino_muerto(self):
        os.environ["FREELLMAPI_KEY"] = "falsilli-de-test"
        muerto = {"url": "http://127.0.0.1:9/v1", "clave_de": None}
        con_clave = {"url": "http://127.0.0.1:%d/v1" % self.http_puerto,
                     "clave_de": "FREELLMAPI_KEY"}
        antes = self.servidor.pasarela.destinos  # type: ignore
        self.servidor.pasarela.destinos = [muerto, con_clave]  # type: ignore
        try:
            self.assertEqual(self._post(b"{\"messages\":[]}").status, 200)
            self.assertEqual(REGISTRO["ultimo"]["autorizacion"], "Bearer falsilli-de-test")
            self.assertEqual(REGISTRO["ultimo"]["cuerpo"]["model"], "colibri-razon")
        finally:
            self.servidor.pasarela.destinos = antes  # type: ignore

    def test_topes(self):
        self._post(json.dumps({"messages": []}).encode())
        self._post(json.dumps({"messages": []}).encode())
        self.servidor.pasarela.cuenta["tokens"] = 40  # type: ignore
        self.assertEqual(REGISTRO["n"], 2)
        respuesta = self._post(json.dumps({"messages": []}).encode())
        self.assertEqual(respuesta.status, 429)
        self.assertEqual(REGISTRO["n"], 2)  # sin reenviar de verdad

    def test_permisos_y_resumen(self):
        self.assertEqual(os.stat(self.ruta).st_mode & 0o777, 0o666)
        self.assertEqual(os.stat(os.path.dirname(self.ruta)).st_mode & 0o777, 0o700)
        self.servidor.pasarela.cuenta.update(llamadas=3, tokens=20)  # type: ignore
        ficha = self.servidor.pasarela.resumen()  # type: ignore
        self.assertEqual(ficha["llamadas"], 3)
        self.assertEqual(ficha["tokens"], 20)
        self.assertFalse(ficha["agotado"])
        self.assertIn("colibri-razon", ficha["modelos"])


if __name__ == "__main__":
    unittest.main()



