# -*- coding: utf-8 -*-
"""Jev: Experiential Labs (gratis) va antes que OpenRouter (de pago); nunca toca la red en pruebas."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import jev  # noqa: E402


def _falso(respuestas, recibido=None, falla=False):
    def f(cuerpo):
        if recibido is not None:
            recibido.append(cuerpo)
        if falla:
            raise OSError("402")
        return {"answers": respuestas, "usage": {"cost": 0.0}}
    return f


class ExplabsAntesQueOpenrouter(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.antes = (jev.CACHE, jev.USO, jev.EXPLABS_PROMOS, jev.TRANSPORTE, jev.TRANSPORTE_EXPLABS)
        jev.CACHE = os.path.join(self.d, "cache.json")
        jev.USO = os.path.join(self.d, "uso.json")
        jev.EXPLABS_PROMOS = os.path.join(self.d, "promos.json")
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:1"
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"

    def tearDown(self):
        jev.CACHE, jev.USO, jev.EXPLABS_PROMOS, jev.TRANSPORTE, jev.TRANSPORTE_EXPLABS = self.antes
        for k in ("STARSEED_LAYA_URL", "STARSEED_JEV", "OPENROUTER_API_KEY", "STARSEED_JEV_EXPLABS"):
            os.environ.pop(k, None)

    def test_gratis_primero(self):
        pedido = []
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.9}}, pedido)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.1}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False, medio=None)
        self.assertEqual(r["medio"], "explabs")
        self.assertEqual(pedido[0]["model"], "jev-latest")

    def test_si_falla_sigue_a_openrouter(self):
        jev.TRANSPORTE_EXPLABS = _falso({}, falla=True)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.2}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False)
        self.assertEqual(r["medio"], "openrouter")

    def test_en_pruebas_sin_transporte_propio_no_toca_la_red(self):
        jev.TRANSPORTE_EXPLABS = None
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.3}})
        self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))

    def test_modelos_de_la_foto_de_promociones(self):
        with open(jev.EXPLABS_PROMOS, "w") as f:
            f.write('{"decisiones_gratis": ["clef-flash"]}')
        self.assertEqual(jev.modelos_explabs(), ["clef-flash"])
        os.remove(jev.EXPLABS_PROMOS)
        self.assertEqual(jev.modelos_explabs(), ["jev-latest", "clef-flash"])

    def test_las_de_descuento_solo_con_presupuesto(self):
        with open(jev.EXPLABS_PROMOS, "w") as f:
            f.write('{"decisiones_gratis": ["jev-latest"], "decisiones_promocion": [{"slug": "clef", "descuento": 50}]}')
        self.assertEqual(jev.modelos_explabs(), ["jev-latest", "clef"])
        jev._anotar_uso({"usage": {"cost": 5.0}}, 0.1, medio="explabs")  # techo reventado
        self.assertEqual(jev.modelos_explabs(), ["jev-latest"])  # las gratis siguen

    def test_se_puede_apagar(self):
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.9}})
        self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))

    def test_con_openrouter_simulado_no_toca_la_red(self):
        real = jev._transporte_real
        jev._transporte_real = lambda cuerpo: {"answers": {"q": {"noul": 0.5}}}
        os.environ["EXPLABS_API_KEY"] = "xpl_prueba"
        try:
            jev.TRANSPORTE_EXPLABS = None
            jev.TRANSPORTE = None
            self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))
        finally:
            jev._transporte_real = real
            os.environ.pop("EXPLABS_API_KEY", None)

    def test_jev_apagado_tampoco_usa_la_pasarela(self):
        os.environ["STARSEED_JEV"] = "0"
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.9}})
        self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))


if __name__ == "__main__":
    unittest.main()
