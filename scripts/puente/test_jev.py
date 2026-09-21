"""jev: consejero tipado con probabilidad, mudo sin clave y sin red en las pruebas."""

import json
import os
import sys
import tempfile
import types
import unittest

import jev


def _local_falso(disponible=True, respuesta=None):
    """Un jev_local de mentira en sys.modules, con lo que tenga que devolver."""
    m = types.ModuleType("jev_local")
    m.disponible = lambda: disponible
    m.decidir = lambda estado, preguntas: respuesta
    sys.modules["jev_local"] = m
    return m


def _quita_local():
    sys.modules.pop("jev_local", None)


def _transporte_que_explota(cuerpo):
    raise AssertionError("no debía llamarse a OpenRouter")


def _falso(respuestas):
    """Transporte que no toca la red: devuelve lo que le des y apunta lo que recibió."""
    recibido = []

    def t(cuerpo):
        recibido.append(cuerpo)
        return {
            "model": "typesafe/jev-1.13",
            "answers": respuestas,
            "usage": {"input_tokens": 10, "output_tokens": 2, "cost": 1e-6},
        }

    t.recibido = recibido
    return t


class Jev(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.TRANSPORTE = None
        os.environ["STARSEED_JEV"] = "0"

    def tearDown(self):
        jev.TRANSPORTE = None
        os.environ.pop("STARSEED_JEV", None)

    def test_apagado_devuelve_none_sin_tocar_nada(self):
        self.assertFalse(jev.activo())
        self.assertIsNone(
            jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        )
        self.assertIsNone(jev.si_no({"a": 1}, "?"))
        self.assertIsNone(jev.elegir({"a": 1}, "?", {"x": "", "y": ""}))

    def test_si_no_lee_la_forma_medida(self):
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.44}})
        self.assertAlmostEqual(jev.si_no({"texto": "hola"}, "¿importa?"), 0.44)
        cuerpo = jev.TRANSPORTE.recibido[0]
        self.assertEqual(cuerpo["model"], jev.MODELO)
        self.assertEqual(cuerpo["questions"]["q"]["type"], "noul")

    def test_elegir_y_puntuar(self):
        jev.TRANSPORTE = _falso(
            {
                "q": {
                    "type": "choice",
                    "choice": "descartar",
                    "probabilities": {
                        "descartar": 0.65,
                        "reintentar": 0.29,
                        "esperar": 0.06,
                    },
                    "confidence": 0.47,
                },
            }
        )
        opcion, probs, conf = jev.elegir(
            {"t": "RS3b"},
            "¿qué hacer?",
            {"descartar": "", "reintentar": "", "esperar": ""},
        )
        self.assertEqual(opcion, "descartar")
        self.assertAlmostEqual(probs["reintentar"], 0.29)
        self.assertAlmostEqual(conf, 0.47)
        jev.TRANSPORTE = _falso(
            {
                "q": {
                    "type": "score",
                    "score": 1.64,
                    "probabilities": {"0": 0.13, "1": 0.1, "2": 0.77},
                    "confidence": 0.46,
                }
            }
        )
        punt, _, _ = jev.puntuar({"t": "RS3b"}, "prioridad", ["baja", "media", "alta"])
        self.assertAlmostEqual(punt, 1.64)
        self.assertEqual(
            jev.TRANSPORTE.recibido[0]["questions"]["q"]["criteria"],
            ["baja", "media", "alta"],
        )

    def test_la_misma_pregunta_no_se_paga_dos_veces(self):
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.9}})
        jev.si_no({"x": 1}, "?")
        jev.si_no({"x": 1}, "?")
        self.assertEqual(len(jev.TRANSPORTE.recibido), 1)
        jev.si_no({"x": 2}, "?")
        self.assertEqual(len(jev.TRANSPORTE.recibido), 2)

    def test_error_de_red_es_none_no_excepcion(self):
        def roto(cuerpo):
            raise OSError("sin red")

        jev.TRANSPORTE = roto
        self.assertIsNone(jev.si_no({"x": 1}, "?"))

    def test_zona_con_umbrales(self):
        self.assertEqual(jev.zona(0.95), "si")
        self.assertEqual(jev.zona(0.7), "duda")
        self.assertEqual(jev.zona(0.2), "no")
        self.assertEqual(jev.zona(None), "duda")

    def test_gasto_por_dia_y_mes_y_techo(self):
        jev._anotar_uso(
            {"usage": {"cost": 0.03, "input_tokens": 1, "output_tokens": 1}},
            0.5,
            hoy="2026-09-20",
        )
        jev._anotar_uso(
            {"usage": {"cost": 0.03, "input_tokens": 1, "output_tokens": 1}},
            0.5,
            hoy="2026-09-19",
        )
        self.assertEqual(jev.gasto("2026-09-20"), (0.03, 0.06))
        self.assertTrue(jev.presupuesto_ok("2026-09-20"))  # 0,03 < 0,05 y 0,06 < 1
        jev._anotar_uso({"usage": {"cost": 0.03}}, 0.5, hoy="2026-09-20")
        self.assertFalse(jev.presupuesto_ok("2026-09-20"))  # 0,06 ≥ 0,05: hoy se calla

    def test_sin_presupuesto_el_transporte_real_no_se_llama(self):
        llamadas = []
        real = jev._transporte_real
        jev._transporte_real = lambda cuerpo: (
            llamadas.append(cuerpo) or {"answers": {"q": {"noul": 0.5}}}
        )
        try:
            os.environ["STARSEED_JEV"] = "1"
            os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"
            jev._anotar_uso({"usage": {"cost": 5.0}}, 0.1)  # techo del mes reventado
            self.assertIsNone(
                jev.decidir({"x": 1}, {"q": {"type": "noul", "instructions": "?"}})
            )
            self.assertEqual(llamadas, [])
        finally:
            jev._transporte_real = real
            os.environ.pop("OPENROUTER_API_KEY", None)

    def test_resumen_incluye_hoy_y_mes(self):
        jev._anotar_uso(
            {"usage": {"cost": 0.001, "input_tokens": 10, "output_tokens": 2}}, 0.5
        )
        r = jev.resumen_uso()
        self.assertIn("hoy $0.0010", r)
        self.assertIn("de $%.2f" % jev.PRESUPUESTO_DIA_USD, r)

    def test_clave_nunca_sale_en_el_uso(self):
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.5}})
        jev.si_no({"x": 1}, "?")
        self.assertNotIn("sk-", open(jev.USO).read() if os.path.exists(jev.USO) else "")


class Piramide(unittest.TestCase):
    """Enrutador: local primero, OpenRouter detrás, y None solo si fallan los dos."""

    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.TRANSPORTE = None
        os.environ["STARSEED_JEV"] = "0"

    def tearDown(self):
        jev.TRANSPORTE = None
        _quita_local()
        os.environ.pop("STARSEED_JEV", None)

    def test_local_responde_no_se_toca_openrouter(self):
        _local_falso(respuesta={"q": {"type": "noul", "noul": 0.8}})
        jev.TRANSPORTE = _transporte_que_explota
        r = jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        self.assertEqual(r["medio"], "local")
        self.assertAlmostEqual(r["q"]["noul"], 0.8)

    def test_local_disponible_devuelve_none_y_cae_a_openrouter(self):
        """La objeción de la revisión: disponible NO es lo mismo que respondió."""
        _local_falso(respuesta=None)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.3}})
        r = jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        self.assertEqual(r["medio"], "openrouter")
        self.assertEqual(len(jev.TRANSPORTE.recibido), 1)

    def test_local_lanza_y_cae_a_openrouter(self):
        m = _local_falso()

        def rompe(estado, preguntas):
            raise OSError("colgado")

        m.decidir = rompe
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.6}})
        r = jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        self.assertEqual(r["medio"], "openrouter")

    def test_el_intento_fallido_se_anota_en_local_sin_respuesta(self):
        _local_falso(respuesta=None)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.3}})
        jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        uso = json.load(open(jev.USO))
        self.assertEqual(uso.get("local_sin_respuesta"), 1)

    def test_local_caido_cae_a_openrouter(self):
        _local_falso(disponible=False)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.5}})
        r = jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        self.assertEqual(r["medio"], "openrouter")

    def test_sin_local_y_presupuesto_agotado_es_none(self):
        _local_falso(disponible=False)
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"
        jev._anotar_uso({"usage": {"cost": 5.0}}, 0.1)
        try:
            self.assertIsNone(
                jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
            )
        finally:
            os.environ.pop("OPENROUTER_API_KEY", None)

    def test_forzar_openrouter_salta_el_local(self):
        m = _local_falso(respuesta={"q": {"type": "noul", "noul": 0.9}})
        llamado = []
        original = m.disponible
        m.disponible = lambda: (llamado.append(1), original())[1]
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.4}})
        r = jev.decidir(
            {"a": 1}, {"q": {"type": "noul", "instructions": "?"}}, medio="openrouter"
        )
        self.assertEqual(r["medio"], "openrouter")
        self.assertEqual(llamado, [])

    def test_forzar_local_no_cae_al_de_pago(self):
        _local_falso(respuesta=None)
        jev.TRANSPORTE = _transporte_que_explota
        self.assertIsNone(
            jev.decidir(
                {"a": 1}, {"q": {"type": "noul", "instructions": "?"}}, medio="local"
            )
        )

    def test_sin_modulo_local_sigue_funcionando_openrouter(self):
        _quita_local()
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.5}})
        r = jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        self.assertEqual(r["medio"], "openrouter")

    def test_uso_se_anota_por_medio_y_el_local_cuesta_cero(self):
        _local_falso(respuesta={"q": {"type": "noul", "noul": 0.8}})
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.3}})
        jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}})
        jev.decidir({"a": 2}, {"q": {"type": "noul", "instructions": "?"}})
        uso = json.load(open(jev.USO))
        self.assertEqual(uso["por_medio"]["local"]["llamadas"], 2)
        self.assertEqual(uso["por_medio"]["local"]["coste_usd"], 0.0)


if __name__ == "__main__":
    unittest.main()
