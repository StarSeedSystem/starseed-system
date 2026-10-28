"""Pruebas de automejora_pasarela.py: destino falso local y socket en un tmp."""
import http.client, json, os, socket, sys, tempfile, threading, time, unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from automejora_pasarela import Pasarela, cuerpo_sano, tokens_del_uso

RESPUESTA = json.dumps({"choices": [{"message": {"role": "assistant", "content": "hola"}}],
                        "usage": {"total_tokens": 7}}).encode("utf-8")
PETICIONES = []

class DestinoFalso(BaseHTTPRequestHandler):
    def do_POST(self):
        crudo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        PETICIONES.append({"camino": self.path, "cabeceras": dict(self.headers),
                           "cuerpo": json.loads(crudo or b"{}")})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(RESPUESTA)))
        self.end_headers()
        self.wfile.write(RESPUESTA)
    def log_message(self, format, *args): pass

class ConexionUNIX(http.client.HTTPConnection):
    def __init__(self, ruta, *resto, **claves):
        super().__init__("127.0.0.1", *resto, **claves)
        self._ruta = ruta

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self._ruta)

class TestPuro(unittest.TestCase):
    def test_sano_y_tokens(self):
        sucio = {"model": "m1", "messages": [], "provider": "x", "transforms": [],
                 "usage": {}, "raro": 1}
        self.assertEqual(cuerpo_sano(sucio, ["m1"]), {"model": "m1", "messages": []})
        self.assertEqual(cuerpo_sano({"model": "ajeno", "messages": []}, ["bueno"]),
                         {"model": "bueno", "messages": []})
        self.assertEqual(tokens_del_uso({"usage": {"total_tokens": "7"}}), 7)
        self.assertEqual(tokens_del_uso(None), 0)

class TestCaja(unittest.TestCase):
    def setUp(self):
        PETICIONES.clear()
        self.falso = ThreadingHTTPServer(("127.0.0.1", 0), DestinoFalso)
        threading.Thread(target=self.falso.serve_forever, daemon=True).start()
        self.carcel = tempfile.mkdtemp()
        self.ruta = os.path.join(self.carcel, "pasarela.sock")
        os.environ["CLAVE_PRUEBA_PASARELA"] = "palabra-de-prueba"

    def tearDown(self):
        if getattr(self, "pasarela", None): self.pasarela.parar()
        self.falso.shutdown(); self.falso.server_close()

    def puerta(self, tope_llamadas=50, tope_tokens=50):
        destino_falso = {"nombre": "falso",
                         "url": "http://127.0.0.1:%d/v1" % self.falso.server_address[1],
                         "clave_env": "CLAVE_PRUEBA_PASARELA"}
        destinos = [{"nombre": "caido", "url": "http://127.0.0.1:9/v1"}, destino_falso]
        self.pasarela = Pasarela(self.ruta, destinos, ["modelo-1"], tope_llamadas, tope_tokens)
        threading.Thread(target=self.pasarela.servir, daemon=True).start()
        for _ in range(200):
            if os.path.exists(self.ruta): return self.pasarela
            time.sleep(0.02)
        raise AssertionError("el socket de la pasarela no apareció")

    def pedir(self, metodo, camino, cuerpo=None):
        cola = ConexionUNIX(self.ruta, timeout=10)
        cola.request(metodo, camino, body=json.dumps(cuerpo) if cuerpo is not None else None)
        respuesta = cola.getresponse()
        contenido = json.loads(respuesta.read() or b"null")
        cola.close()
        return respuesta.status, contenido

    def test_get_models(self):
        self.puerta()
        codigo, cuerpo = self.pedir("GET", "/v1/models")
        self.assertEqual(codigo, 200)
        self.assertEqual([m["id"] for m in cuerpo["data"]], ["modelo-1"])

    def test_post_reenvia_limpio_y_con_clave(self):
        self.puerta()
        sucio = {"model": "ajeno", "messages": [{"role": "user", "content": "di"}],
                 "provider": "x", "transforms": [], "usage": {}}
        codigo, contenido = self.pedir("POST", "/v1/chat/completions", sucio)
        self.assertEqual(codigo, 200)
        self.assertEqual(contenido["choices"][0]["message"]["content"], "hola")
        pido = PETICIONES[-1]
        self.assertEqual(pido["cuerpo"]["model"], "modelo-1")
        self.assertNotIn("provider", pido["cuerpo"])
        self.assertNotIn("usage", pido["cuerpo"])
        self.assertEqual(pido["cabeceras"]["Authorization"], "Bearer palabra-de-prueba")
        self.assertEqual(len(PETICIONES), 1)  # el caído cayó: solo contestó el falso
        self.assertEqual(os.stat(self.ruta).st_mode & 0o777, 0o666)

    def test_otra_ruta_y_otro_metodo_403(self):
        self.puerta()
        self.assertEqual(self.pedir("GET", "/v1/otro")[0], 403)
        self.assertEqual(self.pedir("DELETE", "/v1/chat/completions")[0], 403)

    def test_tope_de_llamadas(self):
        self.puerta(tope_llamadas=1)
        lleno = {"model": "modelo-1", "messages": []}
        self.assertEqual(self.pedir("POST", "/v1/chat/completions", lleno)[0], 200)
        self.assertEqual(self.pedir("POST", "/v1/chat/completions", lleno)[0], 429)
        self.assertEqual(len(PETICIONES), 1)  # el 429 no reenvía

    def test_tope_de_tokens(self):
        self.puerta(tope_tokens=7)
        lleno = {"model": "modelo-1", "messages": []}
        self.assertEqual(self.pedir("POST", "/v1/chat/completions", lleno)[0], 200)
        self.assertEqual(self.pedir("POST", "/v1/chat/completions", lleno)[0], 429)

    def test_resumen_de_la_noche(self):
        self.puerta()
        self.pedir("POST", "/v1/chat/completions", {"model": "modelo-1", "messages": []})
        self.assertEqual(self.pasarela.resumen(),
                         {"llamadas": 1, "tokens": 7, "tope_llamadas": 50, "tope_tokens": 50})
if __name__ == "__main__": unittest.main()
