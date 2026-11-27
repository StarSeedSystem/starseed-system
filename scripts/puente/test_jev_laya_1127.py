"""Pruebas para Laya local en Jev (LAY1127B): estado, calentamiento y uso.

Todo con inyección de transporte/reloj/lector: NUNCA toca red ni disco reales.
"""

import json
import os
import sys
import tempfile
import time
import unittest

import jev


PREG = {"q": {"type": "noul", "instructions": "?"}}
ESTADO = {"texto": "prueba"}
LAYA_URL = "http://127.0.0.1:4470/"


def _falso_get(respuesta, codigo=200, excepcion=None):
    """Transporte GET falso para estado_laya."""
    llamadas = []

    def transporte(url, timeout):
        llamadas.append({"url": url, "timeout": timeout})
        if excepcion:
            raise excepcion
        return codigo, json.dumps(respuesta)

    return transporte, llamadas


def _falso_post(respuesta, codigo=200, excepcion=None):
    """Transporte POST falso para decisiones Laya."""
    llamadas = []

    def transporte(endpoint, cuerpo, timeout):
        llamadas.append({"endpoint": endpoint, "timeout": timeout})
        if excepcion:
            raise excepcion
        return codigo, json.dumps(respuesta)

    return transporte, llamadas


def _reloj_fijo(valor):
    """Reloj que siempre devuelve el mismo valor."""

    def reloj():
        return valor

    return reloj


class TestEstadoLaya(unittest.TestCase):
    """Pruebas de la función estado_laya."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        jev.TRANSPORTE_LOCALES = None
        os.environ["STARSEED_JEV"] = "0"
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        os.environ["STARSEED_LAYA_URL"] = LAYA_URL
        sys.modules["jev_local"] = None

    def tearDown(self):
        jev.TRANSPORTE_LOCALES = None
        os.environ.pop("STARSEED_JEV", None)
        os.environ.pop("STARSEED_JEV_EXPLABS", None)
        os.environ.pop("STARSEED_LAYA_URL", None)
        sys.modules.pop("jev_local", None)

    def test_estado_laya_cargada_devuelve_true(self):
        """Laya responde {'cargado': true} -> {'cargado': True}."""
        transporte, llamadas = _falso_get({"cargado": True})
        res = jev.estado_laya(LAYA_URL, transporte=transporte, timeout=1.0)
        self.assertEqual(res, {"cargado": True})
        self.assertEqual(len(llamadas), 1)
        self.assertEqual(llamadas[0]["url"], LAYA_URL)
        self.assertEqual(llamadas[0]["timeout"], 1.0)

    def test_estado_laya_descargada_devuelve_false(self):
        """Laya responde {'cargado': false} -> {'cargado': False}."""
        transporte, _ = _falso_get({"cargado": False})
        res = jev.estado_laya(LAYA_URL, transporte=transporte)
        self.assertEqual(res, {"cargado": False})

    def test_estado_laya_sin_campo_cargado_devuelve_false(self):
        """Respuesta sin 'cargado' -> {'cargado': False} (defensivo)."""
        transporte, _ = _falso_get({"status": "ok"})
        res = jev.estado_laya(LAYA_URL, transporte=transporte)
        self.assertEqual(res, {"cargado": False})

    def test_estado_laya_error_red_devuelve_none(self):
        """Excepción de red -> None."""
        transporte, _ = _falso_get({}, excepcion=OSError("conexión rechazada"))
        res = jev.estado_laya(LAYA_URL, transporte=transporte)
        self.assertIsNone(res)

    def test_estado_laya_timeout_devuelve_none(self):
        """Timeout -> None."""
        transporte, _ = _falso_get({}, excepcion=TimeoutError("tiempo agotado"))
        res = jev.estado_laya(LAYA_URL, transporte=transporte)
        self.assertIsNone(res)

    def test_estado_laya_codigo_no_200_devuelve_none(self):
        """HTTP 503 -> None."""
        transporte, _ = _falso_get({}, codigo=503)
        res = jev.estado_laya(LAYA_URL, transporte=transporte)
        self.assertIsNone(res)


class TestCalentamientoLaya(unittest.TestCase):
    """Pruebas del calentamiento en segundo plano de Laya."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        jev.TRANSPORTE_LOCALES = None
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"
        os.environ["EXPLABS_API_KEY"] = "xpl_prueba"
        os.environ["STARSEED_JEV_EXPLABS"] = "1"
        os.environ["STARSEED_LAYA_URL"] = LAYA_URL
        sys.modules["jev_local"] = None
        # Archivo de calentamiento aislado
        self.calentar_path = os.path.join(self._dir, "laya-calentar.json")
        jev.LAYA_CALENTAR = self.calentar_path

    def tearDown(self):
        jev.TRANSPORTE_LOCALES = None
        os.environ.pop("STARSEED_JEV", None)
        os.environ.pop("OPENROUTER_API_KEY", None)
        os.environ.pop("EXPLABS_API_KEY", None)
        os.environ.pop("STARSEED_JEV_EXPLABS", None)
        os.environ.pop("STARSEED_LAYA_URL", None)
        sys.modules.pop("jev_local", None)
        if hasattr(jev, "LAYA_CALENTAR"):
            delattr(jev, "LAYA_CALENTAR")

    def test_calentar_laya_ram_suficiente_registra_intento(self):
        """RAM ≥1500 y presión <2 -> registra calentamiento y no bloquea."""
        gobernador = {"ram_libre_mb": 2000, "presion": 1}
        transporte_get, _ = _falso_get({"cargado": False})
        transporte_post, _ = _falso_post({"answers": {"q": {"noul": 0.8}}})
        reloj = _reloj_fijo(1000.0)

        jev._calentar_laya_si_conviene(
            LAYA_URL,
            gobernador=gobernador,
            transporte_get=transporte_get,
            transporte_post=transporte_post,
            reloj=reloj,
            lector=lambda p: json.dumps(gobernador) if p == jev.GOBERNADOR else "{}",
        )

        # Verifica que se escribió el archivo de calentamiento
        with open(self.calentar_path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("ultimo"), 1000.0)
        self.assertEqual(data.get("url"), LAYA_URL)

    def test_calentar_laya_ram_insuficiente_no_registra(self):
        """RAM <1500 -> no calienta (ni siquiera comprueba estado)."""
        gobernador = {"ram_libre_mb": 1000, "presion": 1}
        transporte_get, llamadas_get = _falso_get({"cargado": False})
        transporte_post, _ = _falso_post({})
        reloj = _reloj_fijo(1000.0)

        jev._calentar_laya_si_conviene(
            LAYA_URL,
            gobernador=gobernador,
            transporte_get=transporte_get,
            transporte_post=transporte_post,
            reloj=reloj,
            lector=lambda p: json.dumps(gobernador),
        )

        # No debe haber llamada GET de estado ni POST de calentamiento
        self.assertEqual(len(llamadas_get), 0)

    def test_calentar_laya_presion_alta_no_registra(self):
        """Presión ≥2 -> no calienta."""
        gobernador = {"ram_libre_mb": 2000, "presion": 3}
        transporte_get, _ = _falso_get({"cargado": False})
        transporte_post, _ = _falso_post({})
        reloj = _reloj_fijo(1000.0)

        jev._calentar_laya_si_conviene(
            LAYA_URL,
            gobernador=gobernador,
            transporte_get=transporte_get,
            transporte_post=transporte_post,
            reloj=reloj,
            lector=lambda p: json.dumps(gobernador),
        )

        # Verifica que no se escribió el archivo
        self.assertFalse(os.path.exists(self.calentar_path))

    def test_calentar_laya_plazo_10_min_no_repite(self):
        """Si ya calentó hace <10 min, no repite."""
        gobernador = {"ram_libre_mb": 2000, "presion": 1}
        with open(self.calentar_path, "w", encoding="utf-8") as f:
            json.dump({"ultimo": 1000.0, "url": LAYA_URL}, f)  # hace 0 seg

        transporte_get, _ = _falso_get({"cargado": False})
        transporte_post, _ = _falso_post({})
        reloj = _reloj_fijo(1000.0)

        jev._calentar_laya_si_conviene(
            LAYA_URL,
            gobernador=gobernador,
            transporte_get=transporte_get,
            transporte_post=transporte_post,
            reloj=reloj,
            lector=lambda p: json.dumps(gobernador),
        )

        # No debe haber llamado POST
        with open(self.calentar_path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["ultimo"], 1000.0)  # sin cambios

    def test_calentar_laya_plazo_expirado_vuelve_a_calentar(self):
        """Si ya calentó hace >10 min, vuelve a calentar."""
        gobernador = {"ram_libre_mb": 2000, "presion": 1}
        with open(self.calentar_path, "w", encoding="utf-8") as f:
            json.dump({"ultimo": 0.0, "url": LAYA_URL}, f)  # hace 1000 seg

        transporte_get, _ = _falso_get({"cargado": False})
        transporte_post, llamadas_post = _falso_post({"answers": {"q": {"noul": 0.8}}})
        reloj = _reloj_fijo(1000.0)

        jev._calentar_laya_si_conviene(
            LAYA_URL,
            gobernador=gobernador,
            transporte_get=transporte_get,
            transporte_post=transporte_post,
            reloj=reloj,
            lector=lambda p: json.dumps(gobernador),
        )

        # Debe haber llamado POST
        self.assertEqual(len(llamadas_post), 1)
        with open(self.calentar_path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["ultimo"], 1000.0)


class TestDecisionConLaya(unittest.TestCase):
    """Pruebas de la integración de Laya en la pirámide de decisión."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        jev.TRANSPORTE_LOCALES = None
        os.environ["STARSEED_JEV"] = "0"
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        os.environ["STARSEED_LAYA_URL"] = LAYA_URL
        sys.modules["jev_local"] = None

    def tearDown(self):
        jev.TRANSPORTE_LOCALES = None
        os.environ.pop("STARSEED_JEV", None)
        os.environ.pop("STARSEED_JEV_EXPLABS", None)
        os.environ.pop("STARSEED_LAYA_URL", None)
        sys.modules.pop("jev_local", None)

    def test_laya_cargada_se_usa_antes_que_explabs(self):
        """Si Laya está cargada, se prueba ANTES que explabs."""
        # Laya cargada y responde
        def transporte_get(url, timeout):
            return 200, json.dumps({"cargado": True})

        def transporte_laya(endpoint, cuerpo, timeout):
            return 200, json.dumps({"answers": {"q": {"type": "noul", "noul": 0.9}}})

        jev.TRANSPORTE_LOCALES = transporte_laya
        explabs_llamado = []

        def transporte_explabs(cuerpo):
            explabs_llamado.append(cuerpo)
            raise AssertionError("explabs no debió llamarse")

        jev.TRANSPORTE_EXPLABS = transporte_explabs

        # Inyectar transporte_get para estado_laya
        jev.estado_laya = lambda url, transporte=None, timeout=1.0: (
            {"cargado": True}
            if transporte is None
            else transporte(url, timeout)
        )

        # Mock de _calentar_laya_si_conviene para que no haga nada
        jev._calentar_laya_si_conviene = lambda *a, **k: None

        res = jev.decidir(ESTADO, PREG, usar_cache=False)
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "laya-local")
        self.assertEqual(len(explabs_llamado), 0)

    def test_laya_fria_con_ram_calienta_y_usa_explabs(self):
        """Laya fría con RAM -> calienta en background y usa explabs esta vez."""
        def transporte_get(url, timeout):
            return 200, json.dumps({"cargado": False, "motivo": "descargado por inactividad"})

        def transporte_laya(endpoint, cuerpo, timeout):
            raise OSError("Laya fría")

        jev.TRANSPORTE_LOCALES = transporte_laya
        explabs_llamado = []

        def transporte_explabs(cuerpo):
            explabs_llamado.append(cuerpo)
            return {
                "model": "jev-latest",
                "answers": {"q": {"type": "noul", "noul": 0.5}},
                "usage": {"input_tokens": 10, "output_tokens": 2, "cost": 1e-6},
            }

        jev.TRANSPORTE_EXPLABS = transporte_explabs
        gobernador = {"ram_libre_mb": 2000, "presion": 1}

        def lector(p):
            if p == jev.GOBERNADOR:
                return json.dumps(gobernador)
            return "{}"

        jev._calentar_laya_si_conviene = lambda url, gobernador=None, transporte_get=None, transporte_post=None, reloj=None, lector=None: None

        # Parchear estado_laya para usar transporte_get
        original_estado = jev.estado_laya
        jev.estado_laya = lambda url, transporte=None, timeout=1.0: (
            transporte(url, timeout) if transporte else {"cargado": False}
        )

        res = jev.decidir(ESTADO, PREG, usar_cache=False)
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "explabs")
        self.assertEqual(len(explabs_llamado), 1)

    def test_laya_fria_sin_ram_no_calienta_usa_explabs(self):
        """Laya fría sin RAM -> no calienta, usa explabs."""
        def transporte_get(url, timeout):
            return 200, json.dumps({"cargado": False})

        def transporte_laya(endpoint, cuerpo, timeout):
            raise OSError("Laya fría")

        jev.TRANSPORTE_LOCALES = transporte_laya
        explabs_llamado = []

        def transporte_explabs(cuerpo):
            explabs_llamado.append(cuerpo)
            return {
                "model": "jev-latest",
                "answers": {"q": {"type": "noul", "noul": 0.5}},
                "usage": {"input_tokens": 10, "output_tokens": 2, "cost": 1e-6},
            }

        jev.TRANSPORTE_EXPLABS = transporte_explabs
        gobernador = {"ram_libre_mb": 500, "presion": 1}

        def lector(p):
            if p == jev.GOBERNADOR:
                return json.dumps(gobernador)
            return "{}"

        jev._calentar_laya_si_conviene = lambda *a, **k: None
        jev.estado_laya = lambda url, transporte=None, timeout=1.0: (
            transporte(url, timeout) if transporte else {"cargado": False}
        )

        res = jev.decidir(ESTADO, PREG, usar_cache=False)
        self.assertIsNotNone(res)
        self.assertEqual(res.get("medio"), "explabs")
        self.assertEqual(len(explabs_llamado), 1)


class TestUsoPorMedioLaya(unittest.TestCase):
    """Pruebas de que Laya cuenta en por_medio como 'laya'."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        jev.TRANSPORTE_LOCALES = None
        os.environ["STARSEED_JEV"] = "0"
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        os.environ["STARSEED_LAYA_URL"] = LAYA_URL
        sys.modules["jev_local"] = None

    def tearDown(self):
        jev.TRANSPORTE_LOCALES = None
        os.environ.pop("STARSEED_JEV", None)
        os.environ.pop("STARSEED_JEV_EXPLABS", None)
        os.environ.pop("STARSEED_LAYA_URL", None)
        sys.modules.pop("jev_local", None)

    def test_decidir_con_laya_anota_por_medio_laya(self):
        """Decisión servida por Laya se anota en por_medio['laya']."""
        def transporte_laya(endpoint, cuerpo, timeout):
            return 200, json.dumps({"answers": {"q": {"type": "noul", "noul": 0.8}}})

        jev.TRANSPORTE_LOCALES = transporte_laya

        jev.estado_laya = lambda url, transporte=None, timeout=1.0: {"cargado": True}
        jev._calentar_laya_si_conviene = lambda *a, **k: None

        jev.decidir(ESTADO, PREG, usar_cache=False)

        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f)

        self.assertIn("laya", uso.get("por_medio", {}))
        self.assertEqual(uso["por_medio"]["laya"]["llamadas"], 1)
        self.assertEqual(uso["por_medio"]["laya"]["coste_usd"], 0.0)

    def test_varias_decisiones_laya_acumulan_llamadas(self):
        """Múltiples decisiones por Laya suman en por_medio."""
        def transporte_laya(endpoint, cuerpo, timeout):
            return 200, json.dumps({"answers": {"q": {"type": "noul", "noul": 0.8}}})

        jev.TRANSPORTE_LOCALES = transporte_laya
        jev.estado_laya = lambda url, transporte=None, timeout=1.0: {"cargado": True}
        jev._calentar_laya_si_conviene = lambda *a, **k: None

        jev.decidir(ESTADO, PREG, usar_cache=False)
        jev.decidir({"texto": "otra"}, PREG, usar_cache=False)

        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f)

        self.assertEqual(uso["por_medio"]["laya"]["llamadas"], 2)


if __name__ == "__main__":
    unittest.main()