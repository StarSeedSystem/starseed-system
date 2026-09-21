"""El techo de Jev y el botón de reiniciar el contador.

(2026-09-21) Alex sube el techo diario a 0,20 $ —«Jev tiene permitido gastar más ya
que nos ahorra bastante»— y pide un botón para reiniciar el límite cuando haga falta.
Reiniciar pone a cero el CONTADOR, nunca el techo, y deja rastro de lo que llevaba
gastado: un botón que borra la contabilidad sin dejar huella no sirve para auditar.
"""

import importlib.util
import json
import os
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))


def _jev(uso_path):
    spec = importlib.util.spec_from_file_location("jev_mod", os.path.join(DIR, "jev.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.USO = uso_path
    return m


class TestTope(unittest.TestCase):
    def test_el_techo_diario_es_020(self):
        m = _jev("/dev/null")
        self.assertAlmostEqual(m.PRESUPUESTO_DIA_USD, 0.20)

    def test_el_techo_mensual_cabe_diez_dias(self):
        m = _jev("/dev/null")
        self.assertGreaterEqual(m.PRESUPUESTO_MES_USD, m.PRESUPUESTO_DIA_USD * 10)


class TestReiniciar(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.uso = os.path.join(self.dir.name, "uso.json")

    def tearDown(self):
        self.dir.cleanup()

    def _con_gasto(self, m, importe):
        import time

        hoy = time.strftime("%Y-%m-%d")
        json.dump(
            {"llamadas": 10, "tokens": 100, "coste_usd": importe,
             "dias": {hoy: {"llamadas": 10, "coste_usd": importe}}},
            open(self.uso, "w", encoding="utf-8"),
        )
        return hoy

    def test_pone_a_cero_el_gasto_de_hoy(self):
        m = _jev(self.uso)
        self._con_gasto(m, 0.19)
        self.assertAlmostEqual(m.gasto()[0], 0.19)
        r = m.reiniciar_limite()
        self.assertTrue(r["reiniciado"])
        self.assertAlmostEqual(r["gastado_antes"]["dia"], 0.19)
        self.assertAlmostEqual(m.gasto()[0], 0.0)

    def test_no_toca_el_techo(self):
        m = _jev(self.uso)
        self._con_gasto(m, 0.19)
        r = m.reiniciar_limite()
        self.assertAlmostEqual(r["tope_dia_usd"], 0.20)

    def test_conserva_el_historico_y_deja_rastro(self):
        m = _jev(self.uso)
        self._con_gasto(m, 0.19)
        m.reiniciar_limite()
        d = json.load(open(self.uso, encoding="utf-8"))
        self.assertEqual(d["llamadas"], 10, "el acumulado no se borra")
        self.assertAlmostEqual(d["coste_usd"], 0.19, msg="el coste total no se borra")
        self.assertEqual(len(d["reinicios"]), 1)
        self.assertIn("gastado", d["reinicios"][0])

    def test_sin_gasto_no_inventa_un_reinicio(self):
        m = _jev(self.uso)
        json.dump({"llamadas": 0, "dias": {}}, open(self.uso, "w", encoding="utf-8"))
        r = m.reiniciar_limite()
        self.assertFalse(r["reiniciado"])


if __name__ == "__main__":
    unittest.main()
