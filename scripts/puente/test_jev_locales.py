"""Pruebas de los extremos locales de /v1/systemone en Jev (Laya 4470, Colibri 4480).

Todo con TRANSPORTE_LOCALES falso: NUNCA toca la red, ni siquiera localhost.
"""

import json
import os
import sys
import tempfile
import time
import unittest

import jev

PREG = {"q": {"type": "noul", "instructions": "¿?"}}
ESTADO = {"texto": "prueba"}
U4470 = "http://127.0.0.1:4470/v1/systemone"
U4480 = "http://127.0.0.1:4480/v1/systemone"


def _falso_por_extremo(plan):
    """Transporte falso: plan = {extremo: yes|503|fallo|numero}; anota cada llamada."""
    llamadas = []

    def transporte(endpoint, cuerpo, timeout):
        llamadas.append({"endpoint": endpoint, "timeout": timeout})
        modo = plan.get(endpoint, "fallo")
        if modo == "fallo":
            raise OSError("conexión rechazada (falso)")
        if modo == "503":
            return 503, ""
        valor = 1.0 if modo == "yes" else float(modo)
        return 200, json.dumps({"answers": {"q": {"noul": valor}}})

    return transporte, llamadas


class TestJevLocales(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        sys.modules["jev_local"] = None
        self.addCleanup(lambda: sys.modules.pop("jev_local", None))
        self._env = {}
        for var in ("STARSEED_LAYA_URL", "STARSEED_SYSTEMONE_LOCALES"):
            self._env[var] = os.environ.pop(var, None)
            self.addCleanup(
                lambda var=var: os.environ.__setitem__(var, self._env[var])
                if self._env[var] is not None
                else os.environ.pop(var, None)
            )
        self.addCleanup(setattr, jev, "TRANSPORTE_LOCALES", jev.TRANSPORTE_LOCALES)

    def test_por_defecto_prueba_4470_y_se_queda_con_el_primero_que_contesta(self):
        transporte, llamadas = _falso_por_extremo({U4470: "yes", U4480: "fallo"})
        jev.TRANSPORTE_LOCALES = transporte
        res = jev.decidir_con_laya(ESTADO, PREG)
        self.assertEqual([l["endpoint"] for l in llamadas], [U4470])
        self.assertEqual(res["motor"], "laya-local")
        self.assertAlmostEqual(res["q"]["noul"], 1.0)

    def test_4480_etiqueta_colibri_local(self):
        transporte, llamadas = _falso_por_extremo({U4480: 0.7})
        jev.TRANSPORTE_LOCALES = transporte
        res = jev.decidir_con_laya(ESTADO, PREG)
        # 4470 (por defecto) falla y 4480, con etiqueta de Colibri, responde.
        self.assertEqual([l["endpoint"] for l in llamadas], [U4470, U4480])
        self.assertEqual(res["motor"], "colibri-local")
        self.assertAlmostEqual(res["q"]["noul"], 0.7)

    def test_primer_local_cae_y_el_segundo_contesta(self):
        transporte, llamadas = _falso_por_extremo({U4470: "503", U4480: 0.4})
        jev.TRANSPORTE_LOCALES = transporte
        res = jev.decidir_con_laya(ESTADO, PREG)
        self.assertEqual([l["endpoint"] for l in llamadas], [U4470, U4480])
        self.assertEqual(res["motor"], "colibri-local")
        self.assertAlmostEqual(res["q"]["noul"], 0.4)

    def test_ninguno_responde_devuelve_none(self):
        transporte, llamadas = _falso_por_extremo({U4470: "503", U4480: "fallo"})
        jev.TRANSPORTE_LOCALES = transporte
        res = jev.decidir_con_laya(ESTADO, PREG)
        self.assertIsNone(res)
        self.assertEqual([l["endpoint"] for l in llamadas], [U4470, U4480])

    def test_laya_url_declarada_va_primero(self):
        os.environ["STARSEED_LAYA_URL"] = U4480
        os.environ["STARSEED_SYSTEMONE_LOCALES"] = "%s,%s" % (U4470, U4480)
        urls = jev.endpoints_locales()
        self.assertEqual(urls[0], U4480)
        self.assertEqual(len(urls), 2)  # sin repetir el 4480
        self.assertIn(U4470, urls)

    def test_lista_declarada_sin_repetir_y_en_orden(self):
        os.environ["STARSEED_SYSTEMONE_LOCALES"] = "%s,%s,%s" % (U4480, U4470, U4470)
        self.assertEqual(jev.endpoints_locales(), [U4480, U4470])
        os.environ.pop("STARSEED_LAYA_URL", None)
        os.environ["STARSEED_SYSTEMONE_LOCALES"] = "%s, ,%s" % (U4480, U4470)
        self.assertEqual(jev.endpoints_locales(), [U4480, U4470])

    def test_recuerda_al_mas_rapido_y_lo_prueba_primero_diez_minutos(self):
        # Primera decisión: 4470 cae y 4480 contesta; 4480 queda recordado.
        transporte, llamadas = _falso_por_extremo({U4470: "fallo", U4480: 0.5})
        jev.TRANSPORTE_LOCALES = transporte
        self.assertIsNotNone(jev.decidir_con_laya(ESTADO, PREG))
        rapido = jev.local_rapido()
        self.assertEqual(rapido, U4480)
        with open(jev.USO, encoding="utf-8") as f:
            uso = json.load(f).get("systemone_rapido")
        self.assertGreater(uso["hasta"], time.time() + 500)  # ~10 min vivos
        # Segunda decisión, ambos vivos: 4480 (el recordado) va PRIMERO y contesta.
        transporte2, llamadas2 = _falso_por_extremo({U4470: 0.9, U4480: 0.5})
        jev.TRANSPORTE_LOCALES = transporte2
        res = jev.decidir_con_laya(ESTADO, PREG)
        self.assertEqual([l["endpoint"] for l in llamadas2], [U4480])
        self.assertEqual(res["motor"], "colibri-local")

    def test_el_recuerdo_expira_a_los_diez_minutos(self):
        ahora = time.time()
        uso = {"systemone_rapido": {"url": U4480, "ms": 1.0, "hasta": ahora - 1}}
        with open(jev.USO, "w", encoding="utf-8") as f:
            json.dump(uso, f)
        self.assertIsNone(jev.local_rapido(ahora=ahora))

    def test_tope_default_de_un_segundo_y_medio_por_extremo(self):
        transporte, llamadas = _falso_por_extremo({U4480: 0.6})
        jev.TRANSPORTE_LOCALES = transporte
        jev.decidir_con_laya(ESTADO, PREG)
        self.assertEqual(llamadas[0]["timeout"], 1.5)
        jev.decidir_con_laya(ESTADO, PREG, timeout=0.3)
        self.assertEqual(llamadas[-1]["timeout"], 0.3)

    def test_conversacion_activa_no_pregunta_a_nada(self):
        with open(jev.CONCESION, "w", encoding="utf-8") as f:
            json.dump({"hasta": time.time() + 100}, f)
        transporte, llamadas = _falso_por_extremo({U4470: "yes"})
        jev.TRANSPORTE_LOCALES = transporte
        self.assertIsNone(jev.decidir_con_laya(ESTADO, PREG))
        self.assertEqual(llamadas, [])

    def test_url_explicita_prueba_solo_ella(self):
        transporte, llamadas = _falso_por_extremo({U4480: 0.3})
        jev.TRANSPORTE_LOCALES = transporte
        res = jev.decidir_con_laya(ESTADO, PREG, url=U4480)
        self.assertEqual([l["endpoint"] for l in llamadas], [U4480])
        self.assertEqual(res["motor"], "colibri-local")


if __name__ == "__main__":
    unittest.main()
