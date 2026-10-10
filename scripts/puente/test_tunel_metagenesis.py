# -*- coding: utf-8 -*-
"""Túnel de MetaGenesis: la URL nunca sale a la luz, solo pasa /api/mando, la petición del túnel
nunca parece local, y la fila del motor dice la verdad (encendida, latido, apagada)."""
import contextlib
import http.client
import http.server
import io
import json
import os
import plistlib
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tunel_metagenesis as T  # noqa: E402

URL = "https://ala-bosque-rio-mar.trycloudflare.com"
AQUI = os.path.dirname(os.path.abspath(__file__))


class Piezas(unittest.TestCase):
    def test_url_de_la_salida_de_cloudflared(self):
        self.assertEqual(T.url_de_linea("|  %s  |" % URL), URL)
        self.assertIsNone(T.url_de_linea('Post "https://api.trycloudflare.com/tunnel": EOF'))
        self.assertIsNone(T.url_de_linea("INF Requesting new quick Tunnel on trycloudflare.com..."))

    def test_tachar(self):
        self.assertEqual(T.tachar("listo en %s ya" % URL), "listo en [túnel] ya")
        self.assertTrue(T.url_valida(URL))
        self.assertFalse(T.url_valida(URL + "/api"))
        self.assertFalse(T.url_valida("https://api.trycloudflare.com"))

    def test_limite_de_cloudflare(self):
        self.assertTrue(T.es_limite("ERR 429 Too Many Requests"))
        self.assertTrue(T.es_limite("error code: 1015"))
        self.assertFalse(T.es_limite("INF Registered tunnel connection"))

    def test_solo_pasa_el_mando(self):
        for ok in ("/api/mando", "/api/mando/estado", "/api/mando/medidores?clave=a", "/api/mando/agentes/a%2Fb/log"):
            self.assertTrue(T.ruta_permitida(ok), ok)
        for no in ("/", "/genesis", "/api/ai/openrouter", "/api/mandos/x", "/api/mando/../ai/openrouter",
                   "/api/mando/%2e%2e/ai/openrouter", "/api/mando/%2E%2E/x", "/api/mando\\..\\ai",
                   "/api/mando/%5c..", "http://otro/api/mando/estado", "", None):
            self.assertFalse(T.ruta_permitida(no), no)

    def test_vigilancia(self):
        self.assertEqual(T.decidir_vigilancia(False, False, True, 3), ("relanzar", 0))
        self.assertEqual(T.decidir_vigilancia(True, True, True, 3), ("latir", 0))
        self.assertEqual(T.decidir_vigilancia(True, False, False, 2), ("seguir", 2))  # Genesis local caído: no cuenta
        self.assertEqual(T.decidir_vigilancia(True, False, True, 3), ("seguir", 4))
        self.assertEqual(T.decidir_vigilancia(True, False, True, 4), ("relanzar", 0))

    def test_espera_creciente(self):
        self.assertEqual([T.espera_relanzar(i) for i in range(6)], [30, 60, 120, 240, 480, 600])

    def test_filas(self):
        f = T.fila_encendida(URL, "2026-10-10T10:00:00+00:00", "Mac")
        self.assertEqual((f["url"], f["encendido"], f["motivo"]), (URL, True, None))
        self.assertEqual(T.fila_apagada("x" * 300)["url"], None)
        self.assertEqual(len(T.fila_apagada("x" * 300)["motivo"]), 200)
        self.assertNotIn("url", T.fila_latido("t"))

    def test_orden_sin_cambiar_el_host(self):
        orden = T.orden_cloudflared("/opt/homebrew/bin/cloudflared", 9012)
        self.assertNotIn("--http-host-header", orden)
        self.assertEqual(orden[-2:], ["--url", "http://127.0.0.1:9012"])
        # El pkill del túnel viejo de Genesis no puede confundirla con la suya.
        self.assertNotIn("cloudflared tunnel --url http://127.0.0.1:9002", " ".join(orden))


class Entorno(unittest.TestCase):
    def test_solo_los_nombres_pedidos_y_sin_imprimir(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, ".env.local")
            with open(ruta, "w") as f:
                f.write("# comentario\nNEXT_PUBLIC_SUPABASE_URL=https://proyecto.supabase.co\n"
                        "export SUPABASE_SERVICE_ROLE_KEY='clave-de-prueba'\nOTRA_COSA=no\n")
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                cred = T.credenciales([ruta])
            self.assertEqual(cred, ("https://proyecto.supabase.co", "clave-de-prueba"))
            self.assertEqual(salida.getvalue(), "")
            self.assertNotIn("OTRA_COSA", T.leer_env(["NEXT_PUBLIC_SUPABASE_URL"], [ruta]))

    def test_sin_clave_no_hay_credenciales(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, ".env.local")
            with open(ruta, "w") as f:
                f.write("NEXT_PUBLIC_SUPABASE_URL=https://proyecto.supabase.co\n")
            viejo = os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
            try:
                self.assertIsNone(T.credenciales([ruta]))
            finally:
                if viejo is not None:
                    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = viejo

    def test_escribir_fila_upsert_minimo(self):
        vistas = []

        class R:
            status = 204

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def abrir(req, timeout=0):
            vistas.append(req)
            return R()

        ok = T.escribir_fila(("https://proyecto.supabase.co", "clave"), T.fila_latido("t"), abrir=abrir)
        self.assertTrue(ok)
        req = vistas[0]
        self.assertIn("/rest/v1/metagenesis_motor?on_conflict=id", req.full_url)
        self.assertIn("return=minimal", req.get_header("Prefer"))
        cuerpo = json.loads(req.data)
        self.assertEqual(cuerpo["id"], 1)
        self.assertNotIn("clave", json.dumps(cuerpo))


class Eco(http.server.BaseHTTPRequestHandler):
    """Genesis de mentira: devuelve lo que recibió. `/api/mando/troceado` responde sin largo."""

    protocol_version = "HTTP/1.1"
    vistas = []

    def log_message(self, *_a):
        pass

    def _eco(self):
        largo = int(self.headers.get("Content-Length") or 0)
        cuerpo = self.rfile.read(largo) if largo else b""
        Eco.vistas.append(self.path)
        datos = json.dumps({"metodo": self.command, "ruta": self.path, "cuerpo": cuerpo.decode(),
                            "cabeceras": {k.lower(): v for k, v in self.headers.items()}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        if self.path.startswith("/api/mando/troceado"):
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(datos)
            self.close_connection = True
        else:
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

    do_GET = do_POST = do_OPTIONS = _eco


class PuertaDeVerdad(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.eco = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Eco)
        threading.Thread(target=cls.eco.serve_forever, daemon=True).start()
        cls.puerta = T.arrancar_puerta(0, destino=("127.0.0.1", cls.eco.server_address[1]))
        cls.puerto = cls.puerta.server_address[1]

    @classmethod
    def tearDownClass(cls):
        for s in (cls.puerta, cls.eco):
            s.shutdown()
            s.server_close()

    def pedir(self, metodo, ruta, cuerpo=None, cabeceras=None):
        c = http.client.HTTPConnection("127.0.0.1", self.puerto, timeout=10)
        c.request(metodo, ruta, body=cuerpo, headers=cabeceras or {})
        r = c.getresponse()
        datos = r.read()
        c.close()
        return r.status, datos

    def test_reenvia_el_mando_con_las_cabeceras_del_tunel(self):
        cab = {"Host": URL[8:], "cf-connecting-ip": "203.0.113.7", "cf-ray": "8c1f-MAD",
               "Authorization": "Bearer t", "X-Real-IP": "127.0.0.1"}
        estado, datos = self.pedir("GET", "/api/mando/estado?x=1", cabeceras=cab)
        self.assertEqual(estado, 200)
        vista = json.loads(datos)
        self.assertEqual(vista["ruta"], "/api/mando/estado?x=1")
        h = vista["cabeceras"]
        self.assertEqual(h["host"], URL[8:])                    # el Host del túnel llega tal cual
        self.assertEqual(h["cf-connecting-ip"], "203.0.113.7")
        self.assertEqual(h["authorization"], "Bearer t")
        self.assertEqual(h["x-real-ip"], "203.0.113.7")          # nunca el que mande quien llama
        self.assertIn("_metagenesis-tunel", h["forwarded"])

    def test_post_con_cuerpo(self):
        estado, datos = self.pedir("POST", "/api/mando/reintentar", cuerpo='{"ids":["a"]}',
                                   cabeceras={"Content-Type": "application/json"})
        self.assertEqual(estado, 200)
        self.assertEqual(json.loads(datos)["cuerpo"], '{"ids":["a"]}')

    def test_lo_demas_no_pasa(self):
        Eco.vistas.clear()
        for ruta in ("/api/ai/openrouter", "/genesis", "/api/mando/../ai/openrouter", "/api/mando/%2e%2e/voz/hablar"):
            estado, datos = self.pedir("GET", ruta)
            self.assertEqual(estado, 404, ruta)
            self.assertIn("solo pasa el motor", json.loads(datos)["error"])
        self.assertEqual(Eco.vistas, [])

    def test_respuesta_sin_largo_llega_entera(self):
        estado, datos = self.pedir("GET", "/api/mando/troceado")
        self.assertEqual(estado, 200)
        self.assertEqual(json.loads(datos)["ruta"], "/api/mando/troceado")

    def test_genesis_caido_da_502(self):
        p = T.arrancar_puerta(0, destino=("127.0.0.1", 1))
        try:
            c = http.client.HTTPConnection("127.0.0.1", p.server_address[1], timeout=10)
            c.request("GET", "/api/mando/estado")
            self.assertEqual(c.getresponse().status, 502)
            c.close()
        finally:
            p.shutdown()
            p.server_close()


class TunelFalso:
    def __init__(self, url, vive=True):
        self.url, self._vive, self.ultimas, self.paradas = url, vive, [], 0

    def arrancar(self):
        pass

    def esperar_url(self, _tope, _parar):
        return self.url

    def vivo(self):
        return self._vive

    def parar(self):
        self.paradas += 1


class Bucle(unittest.TestCase):
    def _correr(self, tuneles, contesta, vueltas):
        """Corre `ejecutar` con relojes falsos: cada espera cuenta una vuelta; tras `vueltas`, se para."""
        escrito, registro = [], []
        parar = threading.Event()
        cuenta = {"n": 0}
        real_wait = parar.wait

        def esperar(_s=None):
            cuenta["n"] += 1
            if cuenta["n"] >= vueltas:
                parar.set()
            return real_wait(0)

        parar.wait = esperar
        pila = list(tuneles)
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            T.ejecutar({
                "crear_tunel": lambda: pila.pop(0) if pila else TunelFalso(URL),
                "contesta": contesta,
                "contesta_local": lambda: True,
                "escribir": lambda d: escrito.append(d) or True,
                "parar": parar,
                "log": lambda t: registro.append(T.tachar(t)) or T._log(t),
                "ahora": lambda: "2026-10-10T10:00:00+00:00",
                "maquina": "Mac",
            })
        return escrito, registro, salida.getvalue()

    def test_publica_late_y_al_parar_apaga_sin_imprimir_la_url(self):
        escrito, registro, salida = self._correr([TunelFalso(URL)], lambda u: True, vueltas=3)
        self.assertEqual(escrito[0]["url"], URL)
        self.assertTrue(escrito[0]["encendido"])
        self.assertIn({"encendido": True, "ultimo_latido": "2026-10-10T10:00:00+00:00", "motivo": None}, escrito)
        self.assertEqual(escrito[-1]["encendido"], False)
        self.assertIsNone(escrito[-1]["url"])
        self.assertNotIn("trycloudflare", salida)
        self.assertNotIn("trycloudflare", " ".join(registro))

    def test_cloudflared_muerto_relanza_y_marca_apagada_entre_medias(self):
        muerto = TunelFalso(URL)
        estados = iter([True, False])  # contesta al publicar; luego cloudflared muere
        muerto.vivo = lambda: next(estados, False)
        escrito, _r, _s = self._correr([muerto, TunelFalso(URL)], lambda u: True, vueltas=4)
        motivos = [d.get("motivo") for d in escrito if d.get("encendido") is False]
        self.assertIn("el túnel se cayó; relanzando", motivos)

    def test_sin_url_no_publica_nada_encendido(self):
        escrito, _r, salida = self._correr([TunelFalso(None)], lambda u: True, vueltas=1)
        self.assertTrue(all(d.get("encendido") is not True for d in escrito))
        self.assertIn("cloudflared no dio túnel", salida)


class Plist(unittest.TestCase):
    def test_plist_valido_con_rutas_absolutas(self):
        with open(os.path.join(AQUI, "com.starseed.tunel-metagenesis.plist"), "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.tunel-metagenesis")
        self.assertTrue(all(a.startswith("/") for a in p["ProgramArguments"]))
        self.assertTrue(p["ProgramArguments"][1].endswith("scripts/puente/tunel_metagenesis.py"))
        self.assertTrue(p["KeepAlive"])


if __name__ == "__main__":
    unittest.main()
