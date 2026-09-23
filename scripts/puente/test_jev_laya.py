"""Pruebas unitarias para Laya local en Jev con servidor HTTP falso en hilo."""

import http.server
import json
import os
import sys
import tempfile
import threading
import time
import unittest

import jev


class LayaHandler(http.server.BaseHTTPRequestHandler):
    """Manejador HTTP configurable para simular Laya (SystemOne)."""

    codigo_respuesta = 200
    cuerpo_respuesta = {"answers": {"q": {"type": "noul", "noul": 0.85}}}

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 0:
            self.rfile.read(length)
        self.send_response(self.codigo_respuesta)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if self.codigo_respuesta == 200:
            self.wfile.write(json.dumps(self.cuerpo_respuesta).encode("utf-8"))

    def log_message(self, format, *args):
        pass  # Silenciar logs HTTP durante tests


class TestJevLaya(unittest.TestCase):
    """Pruebas de la capa Laya local en Jev."""

    @classmethod
    def setUpClass(cls):
        cls.server = http.server.HTTPServer(("127.0.0.1", 0), LayaHandler)
        cls.puerto = cls.server.server_address[1]
        cls.url = f"http://127.0.0.1:{cls.puerto}/v1/systemone"
        cls.hilo = threading.Thread(target=cls.server.serve_forever)
        cls.hilo.daemon = True
        cls.hilo.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        LayaHandler.codigo_respuesta = 200
        LayaHandler.cuerpo_respuesta = {
            "answers": {"q": {"type": "noul", "noul": 0.85}}
        }

    def test_laya_devuelve_respuestas_con_motor_laya_local(self):
        res = jev.decidir_con_laya(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            url=self.url,
        )
        self.assertIsNotNone(res)
        self.assertEqual(res.get("motor"), "laya-local")
        self.assertAlmostEqual(res.get("q", {}).get("noul"), 0.85)

    def test_laya_503_devuelve_none(self):
        LayaHandler.codigo_respuesta = 503
        res = jev.decidir_con_laya(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            url=self.url,
        )
        self.assertIsNone(res)

    def test_conversacion_activa_devuelve_none(self):
        with open(jev.CONCESION, "w", encoding="utf-8") as f:
            json.dump({"hasta": time.time() + 100}, f)
        res = jev.decidir_con_laya(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            url=self.url,
        )
        self.assertIsNone(res)

    def test_laya_no_disponible_puerto_cerrado_devuelve_none(self):
        res = jev.decidir_con_laya(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            timeout=0.2,
            url="http://127.0.0.1:59999/v1/systemone",
        )
        self.assertIsNone(res)

    def test_decidir_integra_laya_antes_de_openrouter(self):
        os.environ["STARSEED_LAYA_URL"] = self.url
        try:
            res = jev.decidir(
                {"texto": "prueba"},
                {"q": {"type": "noul", "instructions": "?"}},
                usar_cache=False,
            )
            self.assertIsNotNone(res)
            self.assertEqual(res.get("medio"), "laya-local")
            self.assertEqual(res.get("motor"), "laya-local")
        finally:
            os.environ.pop("STARSEED_LAYA_URL", None)


if __name__ == "__main__":
    unittest.main()
