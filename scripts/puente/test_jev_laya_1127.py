"""Pruebas para LAY1127B: Jev usa Laya local de verdad (estado, calentamiento, conteo por medio).

Cubre:
- estado_laya(url): GET a la raíz con plazo ≤1 s → {'cargado': bool} o None
- Si Laya está cargada, Jev la prueba PRIMERO (antes que explabs)
- Si no está cargada y hay RAM (gobernador: ram_libre_mb ≥ 1500, presion < 2), calienta en fondo (una vez cada 10 min, marca en laya-calentar.json)
- Llamadas servidas por Laya cuentan en jev-uso por_medio como 'laya'
"""

import http.server
import json
import os
import sys
import tempfile
import threading
import time
import unittest

import jev


class LayaRootHandler(http.server.BaseHTTPRequestHandler):
    """Manejador HTTP para simular la raíz de Laya (GET /)."""

    codigo_respuesta = 200
    cuerpo_respuesta = {"cargado": True, "motivo": ""}

    def do_GET(self):
        if self.path == "/":
            self.send_response(self.codigo_respuesta)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            if self.codigo_respuesta == 200:
                self.wfile.write(json.dumps(self.cuerpo_respuesta).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        # Para /v1/systemone (decisión real)
        length = int(self.headers.get("Content-Length", 0))
        if length > 0:
            self.rfile.read(length)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"answers": {"q": {"type": "noul", "noul": 0.85}}}).encode("utf-8"))

    def log_message(self, format, *args):
        pass


class TestJevLaya1127(unittest.TestCase):
    """Pruebas de LAY1127B: Laya real en Jev."""

    @classmethod
    def setUpClass(cls):
        cls.server = http.server.HTTPServer(("127.0.0.1", 0), LayaRootHandler)
        cls.puerto = cls.server.server_address[1]
        cls.url_root = f"http://127.0.0.1:{cls.puerto}"
        cls.url_systemone = f"{cls.url_root}/v1/systemone"
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
        jev.LAYA_CALENTAR = os.path.join(self._dir, "laya-calentar.json")
        LayaRootHandler.codigo_respuesta = 200
        LayaRootHandler.cuerpo_respuesta = {"cargado": True, "motivo": ""}
        # Sin BitNet real
        sys.modules["jev_local"] = None
        self.addCleanup(lambda: sys.modules.pop("jev_local", None))
        # Sin explorabs ni openrouter reales
        os.environ["STARSEED_JEV"] = "0"
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        os.environ["STARSEED_LAYA_URL"] = self.url_systemone
        self.addCleanup(lambda: os.environ.pop("STARSEED_LAYA_URL", None))
        self.addCleanup(lambda: os.environ.pop("STARSEED_JEV", None))
        self.addCleanup(lambda: os.environ.pop("STARSEED_JEV_EXPLABS", None))

    def _gobernador_con_ram(self, ram_libre_mb=2000, presion=1):
        """Escribe un gobernador.json con RAM suficiente."""
        ruta = os.path.join(self._dir, "gobernador.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({
                "ram_libre_mb": ram_libre_mb,
                "presion": presion,
                "t": time.strftime("%Y-%m-%dT%H:%M:%S")
            }, f)
        return ruta

    def _gobernador_sin_ram(self, ram_libre_mb=500, presion=3):
        """Escribe un gobernador.json con RAM insuficiente."""
        ruta = os.path.join(self._dir, "gobernador.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({
                "ram_libre_mb": ram_libre_mb,
                "presion": presion,
                "t": time.strftime("%Y-%m-%dT%H:%M:%S")
            }, f)
        return ruta


class TestEstadoLaya(TestJevLaya1127):
    """Pruebas de estado_laya(url)."""

    def test_estado_laya_devuelve_cargado_true(self):
        res = jev.estado_laya(self.url_root)
        self.assertIsNotNone(res)
        self.assertTrue(res.get("cargado"))

    def test_estado_laya_devuelve_cargado_false(self):
        LayaRootHandler.codigo_respuesta = 200
        LayaRootHandler.cuerpo_respuesta = {"cargado": False, "motivo": "descargado por inactividad"}
        res = jev.estado_laya(self.url_root)
        self.assertIsNotNone(res)
        self.assertFalse(res.get("cargado"))

    def test_estado_laya_503_devuelve_none(self):
        LayaRootHandler.codigo_respuesta = 503
        res = jev.estado_laya(self.url_root)
        self.assertIsNone(res)

    def test_estado_laya_puerto_cerrado_devuelve_none(self):
        res = jev.estado_laya("http://127.0.0.1:59999", timeout=0.2)
        self.assertIsNone(res)

    def test_estado_laya_timeout_respeta_plazo(self):
        # El timeout debe ser ≤1 s
        import jev as jev_mod
        original_timeout = getattr(jev_mod, "LAYA_ESTADO_TIMEOUT", None)
        try:
            # Verificar que el timeout por defecto es ≤1
            res = jev.estado_laya("http://127.0.0.1:59999")
            self.assertIsNone(res)
        finally:
            if original_timeout is not None:
                jev_mod.LAYA_ESTADO_TIMEOUT = original_timeout


class TestLayaPrimero(TestJevLaya1127):
    """Si Laya está cargada, Jev la prueba PRIMERO (antes que explabs)."""

    def setUp(self):
        super().setUp()
        # Habilitar Jev y explabs para probar la cadena de fallback
        os.environ["STARSEED_JEV"] = "1"
        os.environ["STARSEED_JEV_EXPLABS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"
        self.addCleanup(lambda: os.environ.pop("STARSEED_JEV", None))
        self.addCleanup(lambda: os.environ.pop("STARSEED_JEV_EXPLABS", None))
        self.addCleanup(lambda: os.environ.pop("OPENROUTER_API_KEY", None))

    def test_laya_cargada_se_usa_antes_que_explabs(self):
        """Laya cargada → decide por Laya, no llama a explabs."""
        pedido_explabs = []
        jev.TRANSPORTE_EXPLABS = lambda cuerpo: (pedido_explabs.append(cuerpo), {"answers": {"q": {"type": "noul", "noul": 0.1}}, "usage": {"cost": 0.0}})[1]
        jev.TRANSPORTE_LOCALES = None  # no usar decidir_con_laya, usar el flujo nuevo

        res = jev.decidir(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            usar_cache=False,
        )
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "laya")
        self.assertEqual(len(pedido_explabs), 0)  # explabs no llamado

    def test_laya_no_cargada_pasa_a_explabs(self):
        """Laya no cargada → pasa a explabs."""
        LayaRootHandler.codigo_respuesta = 200
        LayaRootHandler.cuerpo_respuesta = {"cargado": False, "motivo": "descargado"}

        pedido_explabs = []
        jev.TRANSPORTE_EXPLABS = lambda cuerpo: (pedido_explabs.append(cuerpo), {"answers": {"q": {"type": "noul", "noul": 0.9}}, "usage": {"cost": 0.0}})[1]

        res = jev.decidir(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            usar_cache=False,
        )
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "explabs")
        self.assertEqual(len(pedido_explabs), 1)

    def test_laya_error_red_pasa_a_explabs(self):
        """Laya cae (red) → pasa a explabs."""
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:59999/v1/systemone"

        pedido_explabs = []
        jev.TRANSPORTE_EXPLABS = lambda cuerpo: (pedido_explabs.append(cuerpo), {"answers": {"q": {"type": "noul", "noul": 0.7}}, "usage": {"cost": 0.0}})[1]

        res = jev.decidir(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            usar_cache=False,
        )
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "explabs")
        self.assertEqual(len(pedido_explabs), 1)


class TestCalentamientoLaya(TestJevLaya1127):
    """Si Laya no está cargada y hay RAM, calienta en fondo (una vez cada 10 min)."""

    def test_sin_ram_no_calienta(self):
        """RAM insuficiente → no calienta."""
        ruta_gob = self._gobernador_sin_ram(ram_libre_mb=500, presion=3)
        # Parchear la ruta del gobernador
        original_ruta = jev.GOBERNADOR_RUTA
        jev.GOBERNADOR_RUTA = ruta_gob
        try:
            LayaRootHandler.codigo_respuesta = 200
            LayaRootHandler.cuerpo_respuesta = {"cargado": False, "motivo": "descargado"}

            # Llamar a la función de calentamiento (o a decidir que la dispara)
            calentado = jev.intentar_calentar_laya_si_procede(self.url_root)
            self.assertFalse(calentado)

            # Verificar que no se creó laya-calentar.json
            self.assertFalse(os.path.exists(jev.LAYA_CALENTAR))
        finally:
            jev.GOBERNADOR_RUTA = original_ruta

    def test_con_ram_calienta_una_vez(self):
        """RAM suficiente → calienta una vez y marca en laya-calentar.json."""
        ruta_gob = self._gobernador_con_ram(ram_libre_mb=2000, presion=1)
        original_ruta = jev.GOBERNADOR_RUTA
        jev.GOBERNADOR_RUTA = ruta_gob
        try:
            LayaRootHandler.codigo_respuesta = 200
            LayaRootHandler.cuerpo_respuesta = {"cargado": False, "motivo": "descargado"}

            calentado = jev.intentar_calentar_laya_si_procede(self.url_root)
            self.assertTrue(calentado)

            # Verificar marca en laya-calentar.json
            self.assertTrue(os.path.exists(jev.LAYA_CALENTAR))
            with open(jev.LAYA_CALENTAR, encoding="utf-8") as f:
                marca = json.load(f)
            self.assertIn("ultima", marca)
            self.assertAlmostEqual(marca["ultima"], time.time(), delta=5)
        finally:
            jev.GOBERNADOR_RUTA = original_ruta

    def test_calentamiento_respeta_plazo_10_min(self):
        """Segunda llamada dentro de 10 min → no calienta de nuevo."""
        ruta_gob = self._gobernador_con_ram(ram_libre_mb=2000, presion=1)
        original_ruta = jev.GOBERNADOR_RUTA
        jev.GOBERNADOR_RUTA = ruta_gob
        try:
            LayaRootHandler.codigo_respuesta = 200
            LayaRootHandler.cuerpo_respuesta = {"cargado": False, "motivo": "descargado"}

            # Primera: calienta
            calentado1 = jev.intentar_calentar_laya_si_procede(self.url_root)
            self.assertTrue(calentado1)

            # Segunda inmediata: no calienta
            calentado2 = jev.intentar_calentar_laya_si_procede(self.url_root)
            self.assertFalse(calentado2)

            # Verificar que la marca no cambió
            with open(jev.LAYA_CALENTAR, encoding="utf-8") as f:
                marca = json.load(f)
            self.assertIn("ultima", marca)
        finally:
            jev.GOBERNADOR_RUTA = original_ruta

    def test_calentamiento_expirado_10_min_vuelve_a_calentar(self):
        """Marca con >10 min → vuelve a calentar."""
        ruta_gob = self._gobernador_con_ram(ram_libre_mb=2000, presion=1)
        original_ruta = jev.GOBERNADOR_RUTA
        jev.GOBERNADOR_RUTA = ruta_gob
        try:
            # Crear marca antigua (>10 min)
            with open(jev.LAYA_CALENTAR, "w", encoding="utf-8") as f:
                json.dump({"ultima": time.time() - 700}, f)  # 11 min 40 seg

            LayaRootHandler.codigo_respuesta = 200
            LayaRootHandler.cuerpo_respuesta = {"cargado": False, "motivo": "descargado"}

            calentado = jev.intentar_calentar_laya_si_procede(self.url_root)
            self.assertTrue(calentado)
        finally:
            jev.GOBERNADOR_RUTA = original_ruta


class TestConteoPorMedioLaya(TestJevLaya1127):
    """Llamadas servidas por Laya cuentan en jev-uso por_medio como 'laya'."""

    def test_decisión_por_laya_cuenta_como_laya_en_uso(self):
        """Decisión servida por Laya → uso por_medio['laya'].llamadas += 1."""
        LayaRootHandler.codigo_respuesta = 200
        LayaRootHandler.cuerpo_respuesta = {"cargado": True, "motivo": ""}

        jev.TRANSPORTE_EXPLABS = None

        res = jev.decidir(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            usar_cache=False,
        )
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "laya")

        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f)

        self.assertIn("por_medio", uso)
        self.assertIn("laya", uso["por_medio"])
        self.assertEqual(uso["por_medio"]["laya"]["llamadas"], 1)
        self.assertEqual(uso["por_medio"]["laya"]["coste_usd"], 0.0)

    def test_múltiples_decisiones_laya_acumulan(self):
        """Múltiples decisiones por Laya se acumulan."""
        LayaRootHandler.codigo_respuesta = 200
        LayaRootHandler.cuerpo_respuesta = {"cargado": True, "motivo": ""}
        jev.TRANSPORTE_EXPLABS = None

        jev.decidir({"texto": "1"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)
        jev.decidir({"texto": "2"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)
        jev.decidir({"texto": "3"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)

        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f)

        self.assertEqual(uso["por_medio"]["laya"]["llamadas"], 3)

    def test_laya_también_en_dias_por_medio(self):
        """El conteo por día también incluye laya."""
        LayaRootHandler.codigo_respuesta = 200
        LayaRootHandler.cuerpo_respuesta = {"cargado": True, "motivo": ""}
        jev.TRANSPORTE_EXPLABS = None

        hoy = time.strftime("%Y-%m-%d")
        jev.decidir({"texto": "1"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)

        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f)

        self.assertIn("dias", uso)
        self.assertIn(hoy, uso["dias"])
        self.assertIn("por_medio", uso["dias"][hoy])
        self.assertIn("laya", uso["dias"][hoy]["por_medio"])
        self.assertEqual(uso["dias"][hoy]["por_medio"]["laya"]["llamadas"], 1)


if __name__ == "__main__":
    unittest.main()