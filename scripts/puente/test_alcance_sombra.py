"""Pruebas de alcance_sombra: sin muestras no valida, un falso positivo no
valida, los porcentajes del informe se cuadran y el módulo no tiene función
ni nada que importe de envío."""

import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alcance_sombra as S  # noqa: E402

AHORA = dt.datetime(2026, 10, 31, 12, 0, tzinfo=dt.timezone.utc)


def fila(**k):
    n = dt.timedelta(days=k.pop("hace_dias", 0))
    base = {"t": (AHORA - n).isoformat(), "id": "prop-1", "medio": "correo-propio", "nivel": "bajo",
            "habria": True, "motivo": "todo en regla", "decision_alex": S.APROBADO,
            "reescrita_pct": 0.0, "respondio": False, "incidencia": None}
    base.update(k)
    return base


class TestValidar(unittest.TestCase):
    def test_sin_muestras_no_valida(self):
        v = S.validar([], AHORA)
        self.assertFalse(v["validado"])
        self.assertEqual(v["validez"]["muestras_21d"], 0)

        v = S.validar([fila(decision_alex="esperando")], AHORA)
        self.assertFalse(v["validado"])

    def test_un_falso_positivo_no_valida(self):
        bien = [fila(id="prop-%d" % i) for i in range(S.MIN_MUESTRAS)]
        self.assertTrue(S.validar(bien, AHORA)["validado"])
        bien.append(fila(id="prop-x", habria=True, decision_alex="rechazada"))
        v = S.validar(bien, AHORA)
        self.assertFalse(v["validado"])
        self.assertEqual(v["falsos_positivos"]["ultimos_30d"], 1)
        self.assertIn("prop-x", v["falsos_positivos"]["ids"])

    def test_porcentajes_del_informe(self):
        # 30 aprobadas sin cambios: 29 habría enviado (96,7 %) y una no (tope); sin incidencias.
        muestras = [fila(id="prop-%d" % i, respondio=True) for i in range(29)]
        muestras.append(fila(id="prop-29", habria=False, motivo="tope de 3 al día", respondio=None))
        v = S.validar(muestras, AHORA)
        sin_cambios = v["acierto_sin_cambios"]
        self.assertAlmostEqual(sin_cambios["pct"], round(100.0 * 29 / 30, 1))
        self.assertTrue(sin_cambios["pct"] >= S.ACIERTO_MIN)
        self.assertEqual(v["validez"]["muestras_21d"], 30)
        self.assertTrue(v["validado"])
        self.assertEqual(v["tasa_respuesta"]["automatica_pct"], 100.0)
        self.assertIsNone(v["tasa_respuesta"]["manual_pct"])
        self.assertTrue(v["tasa_respuesta"]["no_peor"])

    def test_fuera_de_ventana_y_reescrita_cuentan(self):
        fuera = [fila(id="prop-0", hace_dias=S.DIAS_VENTANA + 1) for _ in range(S.MIN_MUESTRAS)]
        self.assertFalse(S.validar(fuera, AHORA)["validado"])
        v = S.validar([fila(id="prop-%d" % i, respondio=False) for i in range(S.MIN_MUESTRAS)]
                      + [fila(id="prop-x", decision_alex="reescrita", reescrita_pct=S.PCT_REESCRITA + 1)], AHORA)
        self.assertFalse(v["validado"])
        self.assertGreaterEqual(v["falsos_positivos"]["ultimos_30d"], 1)

    def test_incidencia_y_respuesta_no_peor_frenan(self):
        muestras = [fila(id="prop-%d" % i, respondio=True) for i in range(S.MIN_MUESTRAS)]
        self.assertTrue(S.validar(muestras, AHORA)["validado"])
        muestras[0]["incidencia"] = "rebote"
        v = S.validar(muestras, AHORA)
        self.assertFalse(v["validado"])
        self.assertEqual(v["incidencias"]["total"], 1)
        muestras[0]["incidencia"] = None
        muestras[0].update(habria=False, motivo="tope de 3 al día", respondio=True)
        for m in muestras[1:]:
            m["respondio"] = False
        v = S.validar(muestras, AHORA)
        self.assertFalse(v["validado"])
        self.assertFalse(v["tasa_respuesta"]["no_peor"])


class TestDecidir(unittest.TestCase):
    def test_regla_del_piloto(self):
        bien = {"medio": "correo-propio", "nivel": "bajo", "estado": "aprobada"}
        self.assertTrue(S.decidir(bien, 0)["habria"])
        self.assertFalse(S.decidir(bien, 3)["habria"])
        self.assertFalse(S.decidir({**bien, "nivel": "alto"}, 0)["habria"])
        self.assertFalse(S.decidir({**bien, "medio": "formulario"}, 0)["habria"])
        self.assertTrue("Jev vetó" in S.decidir(bien, 0, veto=True)["motivo"])
        self.assertFalse(S.decidir(bien, 0, veto=True)["habria"])


class TestSinEnvio(unittest.TestCase):
    def test_el_modulo_no_importa_nada_de_envio(self):
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alcance_sombra.py")
        with open(ruta, encoding="utf-8") as f:
            texto = f.read()
        prohibido = ("def enviar", "evaluarEnvio", "/api/mail", "smtplib", "suenos", "cola-suenos", "import suenos", "route.ts")
        for palabra in prohibido:
            self.assertNotIn(palabra, texto, palabra)
        for nombre in vars(S):
            if not nombre.startswith("_") and callable(getattr(S, nombre)):
                self.assertNotIn("enviar", nombre)


if __name__ == "__main__":
    unittest.main()
