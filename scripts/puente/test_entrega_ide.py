# -*- coding: utf-8 -*-
"""Pruebas del módulo puro entrega_ide: acuses honestos y reintentos acotados."""

import unittest

from entrega_ide import destinos_pendientes, evaluar_entrega, siguiente_reintento


class EvaluarEntregaTest(unittest.TestCase):
    def test_codigo_none_no_verificado(self):
        r = evaluar_entrega(None)
        self.assertEqual(r["estado"], "no_verificado")
        self.assertTrue(r["reintentable"])

    def test_exito_es_encolado_nunca_recibido(self):
        r = evaluar_entrega(0)
        self.assertEqual(r["estado"], "encolado")
        self.assertFalse(r["reintentable"])

    def test_timeout_aun_con_codigo_0(self):
        r = evaluar_entrega(0, timeout=True)
        self.assertEqual(r["estado"], "timeout")
        self.assertTrue(r["reintentable"])

    def test_error_salida_1(self):
        r = evaluar_entrega(1)
        self.assertEqual(r["estado"], "error")
        self.assertTrue(r["reintentable"])

    def test_bool_no_es_codigo(self):
        self.assertEqual(evaluar_entrega(True)["estado"], "no_verificado")


class SiguienteReintentoTest(unittest.TestCase):
    def test_retrasos_acotados(self):
        ahora = 1000.0
        esperados = [5, 15, 45, 120, 300]
        for intentos, retraso in enumerate(esperados, start=1):
            self.assertEqual(siguiente_reintento(intentos, ahora), ahora + retraso)

    def test_mas_de_cinco_no_reintenta(self):
        self.assertIsNone(siguiente_reintento(6, 0.0))
        self.assertIsNone(siguiente_reintento(0, 0.0))

    def test_intentos_negativos_invalidos(self):
        with self.assertRaises(ValueError):
            siguiente_reintento(-1, 0.0)

    def test_bool_invalido(self):
        with self.assertRaises(ValueError):
            siguiente_reintento(True, 0.0)


class DestinosPendientesTest(unittest.TestCase):
    def test_no_eco_al_origen(self):
        ev = {"quien": "codex"}
        self.assertEqual(destinos_pendientes(ev, ["codex", "hermes"], {}), ["hermes"])

    def test_astra_es_codex(self):
        ev = {"quien": "astra"}
        self.assertEqual(
            destinos_pendientes(ev, ["codex", "astra", "hermes"], {}), ["hermes"]
        )

    def test_no_duplica_destinos(self):
        ev = {"quien": "claude"}
        self.assertEqual(
            destinos_pendientes(ev, ["hermes", "Hermes", " hermes "], {}), ["hermes"]
        )

    def test_acuse_cerrado_omite_error_conserva(self):
        acuses = {
            "hermes": {"estado": "leido"},
            "codex": {"estado": "error"},
            "antigravity": {"estado": "no_verificado"},
            "claude": {"estado": "encolado"},
        }
        ev = {"quien": "gemini"}
        self.assertEqual(
            destinos_pendientes(
                ev, ["hermes", "codex", "antigravity", "claude"], acuses
            ),
            ["codex", "antigravity"],
        )

    def test_acuse_con_mayusculas_se_reconoce(self):
        acuses = {"HERMES": {"estado": "recibido"}}
        ev = {"quien": "codex"}
        self.assertEqual(destinos_pendientes(ev, ["hermes"], acuses), [])

    def test_no_muta_entradas(self):
        ev = {"quien": "codex"}
        destinos = ["hermes", "claude"]
        acuses = {"hermes": {"estado": "leido"}}
        destinos_pendientes(ev, destinos, acuses)
        self.assertEqual(destinos, ["hermes", "claude"])
        self.assertEqual(acuses, {"hermes": {"estado": "leido"}})

    def test_datos_vacios(self):
        self.assertEqual(destinos_pendientes({}, [], {}), [])
        self.assertEqual(
            destinos_pendientes({"quien": "codex"}, ["hermes"], {}), ["hermes"]
        )

    def test_devuelve_nombres_canonicos(self):
        self.assertEqual(
            destinos_pendientes({"quien": "codex"}, [" Hermes "], {}), ["hermes"]
        )

    def test_acuses_no_dict_no_rompe(self):
        self.assertEqual(
            destinos_pendientes({"quien": "codex"}, ["hermes"], "ruido"),
            ["hermes"],
        )


if __name__ == "__main__":
    unittest.main()
