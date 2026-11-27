"""Pruebas unitarias para Laya local en Jev (LAY1127B): estado, calentamiento y pirámide de decisión."""

import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

import jev


class TestEstadoLaya(unittest.TestCase):
    """Pruebas para la función estado_laya."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")

    def test_estado_laya_cargada_devuelve_true(self):
        """Laya responde {'cargado': true} → estado_laya devuelve {'cargado': True}."""
        def transporte_falso(url, timeout):
            assert timeout <= 1.0
            return 200, json.dumps({"cargado": True})

        res = jev.estado_laya("http://127.0.0.1:4470", transporte=transporte_falso)
        self.assertEqual(res, {"cargado": True})

    def test_estado_laya_descargada_devuelve_false(self):
        """Laya responde {'cargado': false} → estado_laya devuelve {'cargado': False}."""
        def transporte_falso(url, timeout):
            return 200, json.dumps({"cargado": False})

        res = jev.estado_laya("http://127.0.0.1:4470", transporte=transporte_falso)
        self.assertEqual(res, {"cargado": False})

    def test_estado_laya_timeout_devuelve_none(self):
        """Timeout o error de red → estado_laya devuelve None."""
        def transporte_falso(url, timeout):
            raise OSError("timeout")

        res = jev.estado_laya("http://127.0.0.1:4470", transporte=transporte_falso)
        self.assertIsNone(res)

    def test_estado_laya_codigo_no_200_devuelve_none(self):
        """Código HTTP != 200 → estado_laya devuelve None."""
        def transporte_falso(url, timeout):
            return 503, "service unavailable"

        res = jev.estado_laya("http://127.0.0.1:4470", transporte=transporte_falso)
        self.assertIsNone(res)

    def test_estado_laya_json_invalido_devuelve_none(self):
        """Respuesta no es JSON válido → estado_laya devuelve None."""
        def transporte_falso(url, timeout):
            return 200, "no es json"

        res = jev.estado_laya("http://127.0.0.1:4470", transporte=transporte_falso)
        self.assertIsNone(res)


class TestCalentamientoLaya(unittest.TestCase):
    """Pruebas para el calentamiento de Laya en segundo plano."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        self.gobernador_path = os.path.join(self._dir, "gobernador.json")
        os.environ["STARSEED_GOBERNADOR"] = self.gobernador_path

    def tearDown(self):
        os.environ.pop("STARSEED_GOBERNADOR", None)

    def test_calentar_laya_con_ram_suficiente_lanza_peticion_en_fondo(self):
        """RAM libre ≥1500 y presión <2 → lanza calentamiento en segundo plano (no bloquea)."""
        with open(self.gobernador_path, "w") as f:
            json.dump({"ram_libre_mb": 2000, "presion": 1}, f)

        peticiones = []
        def transporte_falso(url, timeout):
            peticiones.append(url)
            return 200, json.dumps({"cargado": False})

        # Primera llamada: Laya está fría, hay RAM → debe calentar en fondo
        jev.maybe_calentar_laya(transporte=transporte_falso, ahora=time.time())

        # La petición de calentamiento se hizo (a /v1/systemone, no a la raíz)
        self.assertEqual(len(peticiones), 1)
        self.assertIn("/v1/systemone", peticiones[0])

    def test_calentar_laya_sin_ram_no_lanza_peticion(self):
        """RAM libre <1500 o presión ≥2 → NO lanza calentamiento."""
        with open(self.gobernador_path, "w") as f:
            json.dump({"ram_libre_mb": 1000, "presion": 1}, f)

        peticiones = []
        def transporte_falso(url, timeout):
            peticiones.append(url)
            return 200, json.dumps({"cargado": False})

        jev.maybe_calentar_laya(transporte=transporte_falso, ahora=time.time())
        self.assertEqual(len(peticiones), 0)

    def test_calentar_laya_throttle_10_minutos(self):
        """Máximo una vez cada 10 minutos: segundo intento dentro de 10 min no calienta."""
        with open(self.gobernador_path, "w") as f:
            json.dump({"ram_libre_mb": 2000, "presion": 1}, f)

        # Archivo de control de calentamiento
        calentar_path = os.path.join(self._dir, "laya-calentar.json")
        os.environ["STARSEED_LAYA_CALENTAR"] = calentar_path

        peticiones = []
        def transporte_falso(url, timeout):
            peticiones.append(url)
            return 200, json.dumps({"cargado": False})

        ahora = time.time()
        jev.maybe_calentar_laya(transporte=transporte_falso, ahora=ahora)
        self.assertEqual(len(peticiones), 1)

        # Segundo intento dentro de 10 min → NO calienta
        jev.maybe_calentar_laya(transporte=transporte_falso, ahora=ahora + 300)
        self.assertEqual(len(peticiones), 1)

        # Tercer intento después de 10 min → SÍ calienta
        jev.maybe_calentar_laya(transporte=transporte_falso, ahora=ahora + 610)
        self.assertEqual(len(peticiones), 2)

        os.environ.pop("STARSEED_LAYA_CALENTAR", None)

    def test_calentar_laya_sin_gobernador_no_lanza(self):
        """Sin archivo gobernador → no lanza calentamiento."""
        peticiones = []
        def transporte_falso(url, timeout):
            peticiones.append(url)
            return 200, json.dumps({"cargado": False})

        jev.maybe_calentar_laya(transporte=transporte_falso, ahora=time.time())
        self.assertEqual(len(peticiones), 0)


class TestPiramideDecisionLaya(unittest.TestCase):
    """Pruebas de la pirámide de decisión: Laya antes que explabs."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        jev.EXPLABS_PROMOS = os.path.join(self._dir, "promos.json")
        jev.TRANSPORTE = None
        jev.TRANSPORTE_LOCALES = None
        jev.TRANSPORTE_EXPLABS = None
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:4470"
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"
        os.environ["STARSEED_JEV_EXPLABS"] = "1"
        sys.modules["jev_local"] = None

    def tearDown(self):
        jev.TRANSPORTE = None
        jev.TRANSPORTE_LOCALES = None
        jev.TRANSPORTE_EXPLABS = None
        os.environ.pop("STARSEED_LAYA_URL", None)
        os.environ.pop("STARSEED_JEV", None)
        os.environ.pop("OPENROUTER_API_KEY", None)
        os.environ.pop("STARSEED_JEV_EXPLABS", None)
        sys.modules.pop("jev_local", None)

    def test_laya_cargada_primero_antes_explabs(self):
        """Laya cargada → decide por Laya, NO toca explabs ni openrouter."""
        laya_respuestas = {"q": {"type": "noul", "noul": 0.9}}
        explabs_llamado = []
        openrouter_llamado = []

        def transporte_laya(estado, preguntas):
            return laya_respuestas

        def transporte_explabs(cuerpo):
            explabs_llamado.append(cuerpo)
            raise OSError("no debe llamarse")

        def transporte_openrouter(cuerpo):
            openrouter_llamado.append(cuerpo)
            raise OSError("no debe llamarse")

        jev.TRANSPORTE_LOCALES = lambda ep, cuerpo, to: (200, json.dumps({"answers": laya_respuestas}))
        jev.TRANSPORTE_EXPLABS = transporte_explabs
        jev.TRANSPORTE = transporte_openrouter

        # Mock estado_laya para decir que está cargada
        original_estado = jev.estado_laya
        jev.estado_laya = lambda url, transporte=None, ahora=None: {"cargado": True}

        try:
            r = jev.decidir({"texto": "prueba"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)
            self.assertIsNotNone(r)
            self.assertEqual(r.get("medio"), "laya")
            self.assertEqual(explabs_llamado, [])
            self.assertEqual(openrouter_llamado, [])
        finally:
            jev.estado_laya = original_estado

    def test_laya_fria_con_ram_calienta_y_cae_a_explabs(self):
        """Laya fría pero hay RAM → calienta en fondo y cae a explabs (no bloquea)."""
        explabs_respuestas = {"q": {"type": "noul", "noul": 0.7}}
        explabs_llamado = []

        def transporte_explabs(cuerpo):
            explabs_llamado.append(cuerpo)
            return {"answers": explabs_respuestas, "usage": {"cost": 0.0}}

        jev.TRANSPORTE_EXPLABS = transporte_explabs
        jev.TRANSPORTE = lambda c: {"answers": {"q": {"noul": 0.1}}, "usage": {"cost": 1e-6}}

        # Mock estado_laya para decir que está fría
        original_estado = jev.estado_laya
        jev.estado_laya = lambda url, transporte=None, ahora=None: {"cargado": False}

        # Mock gobernador con RAM
        gobernador_path = os.path.join(self._dir, "gobernador.json")
        with open(gobernador_path, "w") as f:
            json.dump({"ram_libre_mb": 2000, "presion": 1}, f)
        os.environ["STARSEED_GOBERNADOR"] = gobernador_path

        # Mock maybe_calentar_laya para no hacer red real
        original_calentar = getattr(jev, 'maybe_calentar_laya', None)
        jev.maybe_calentar_laya = lambda transporte=None, ahora=None: None

        try:
            r = jev.decidir({"texto": "prueba"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)
            self.assertIsNotNone(r)
            self.assertEqual(r.get("medio"), "explabs")
            self.assertEqual(len(explabs_llamado), 1)
        finally:
            jev.estado_laya = original_estado
            if original_calentar:
                jev.maybe_calentar_laya = original_calentar
            os.environ.pop("STARSEED_GOBERNADOR", None)

    def test_laya_fria_sin_ram_no_calienta_cae_a_explabs(self):
        """Laya fría y sin RAM → NO calienta, cae directo a explabs."""
        explabs_respuestas = {"q": {"type": "noul", "noul": 0.7}}
        explabs_llamado = []

        def transporte_explabs(cuerpo):
            explabs_llamado.append(cuerpo)
            return {"answers": explabs_respuestas, "usage": {"cost": 0.0}}

        jev.TRANSPORTE_EXPLABS = transporte_explabs
        jev.TRANSPORTE = lambda c: {"answers": {"q": {"noul": 0.1}}, "usage": {"cost": 1e-6}}

        original_estado = jev.estado_laya
        jev.estado_laya = lambda url, transporte=None, ahora=None: {"cargado": False}

        # Sin gobernador o con RAM baja
        gobernador_path = os.path.join(self._dir, "gobernador.json")
        with open(gobernador_path, "w") as f:
            json.dump({"ram_libre_mb": 500, "presion": 3}, f)
        os.environ["STARSEED_GOBERNADOR"] = gobernador_path

        original_calentar = getattr(jev, 'maybe_calentar_laya', None)
        jev.maybe_calentar_laya = lambda transporte=None, ahora=None: None

        try:
            r = jev.decidir({"texto": "prueba"}, {"q": {"type": "noul", "instructions": "?"}}, usar_cache=False)
            self.assertIsNotNone(r)
            self.assertEqual(r.get("medio"), "explabs")
            self.assertEqual(len(explabs_llamado), 1)
        finally:
            jev.estado_laya = original_estado
            if original_calentar:
                jev.maybe_calentar_laya = original_calentar
            os.environ.pop("STARSEED_GOBERNADOR", None)


class TestUsoLaya(unittest.TestCase):
    """Pruebas de anotación de uso por medio 'laya'."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")

    def test_uso_anotado_como_laya(self):
        """Llamada servida por Laya se anota en jev-uso por_medio como 'laya'."""
        jev._anotar_uso({}, 0.5, medio="laya", ms=150.0, quien="test", tipos=["noul"])

        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f)

        self.assertEqual(uso["por_medio"]["laya"]["llamadas"], 1)
        self.assertEqual(uso["por_medio"]["laya"]["coste_usd"], 0.0)
        self.assertIn(150.0, uso["por_medio"]["laya"]["ms"])
        self.assertEqual(uso["dias"][time.strftime("%Y-%m-%d")]["por_medio"]["laya"]["llamadas"], 1)


if __name__ == "__main__":
    unittest.main()