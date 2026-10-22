#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la prueba corta de modelos y de la decisión (sin red y sin motor real)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probar_modelo as P


class ClienteFalso:
    """Cliente HTTP de ejemplo: contesta lo que dice la prueba, sin tocar la red."""
    def __init__(self, respuesta=None):
        self.respuesta = respuesta or {"codigo": 200, "datos": {"ok": True}, "bytes": 256}
        self.llamadas = []

    def post(self, url, json=None, timeout=None):
        self.llamadas.append(url)
        return self.respuesta


class Muestras(unittest.TestCase):
    def test_cada_area_pide_su_muestra_corta(self):
        """imagen 512×512 · voz una frase · oído el audio · palabra 64 tokens."""
        recibido = {}
        def motor(cuerpo):
            recibido.update(cuerpo)
            return {"ok": True}

        res = P.probar_modelo("imagen", motor=motor)
        self.assertTrue(res["exitoso"])
        self.assertEqual((recibido["width"], recibido["height"]), (512, 512))
        P.probar_modelo("voz", motor=motor)
        self.assertIn("Prueba de voz", recibido["input"])
        P.probar_modelo("oido", motor=motor, muestra=b"MONO")
        self.assertTrue(recibido["audio_base64"])
        self.assertEqual(recibido["language"], "es")
        P.probar_modelo("palabra", motor=motor)
        self.assertEqual(recibido["n_predict"], 64)


class MotoresYMedidas(unittest.TestCase):
    def test_los_errores_son_honestos(self):
        res = P.probar_modelo("voz")
        self.assertFalse(res["exitoso"])
        self.assertIn("motor local", res["error"])
        res = P.probar_modelo("video", motor=lambda c: {"ok": True})
        self.assertFalse(res["exitoso"])
        self.assertIn("video", res["error"])

    def test_un_motor_que_reventa_no_rompe_la_instalacion(self):
        def motor(cuerpo):
            raise RuntimeError("el daemon se cayó")

        res = P.probar_modelo("voz", motor=motor)
        self.assertFalse(res["exitoso"])
        self.assertIn("RuntimeError", res["error"])

    def test_la_memoria_viene_de_la_medida_inyectada(self):
        res = P.probar_modelo("voz", motor=lambda c: {"ok": True}, medir_memoria=lambda: 30.0)
        otro = P.probar_modelo("voz", motor=lambda c: {"ok": True, "memoria_mb": 512.0})
        self.assertEqual((res["memoria_mb"], otro["memoria_mb"]), (30.0, 512.0))

    def test_una_licencia_no_comercial_no_entra_en_uso_comercial(self):
        res = P.probar_modelo("imagen", {"licencia_clase": "personal", "uso_comercial": True},
                              motor=lambda c: {"ok": True})
        self.assertFalse(res["exitoso"])
        self.assertIn("no permite uso comercial", res["error"])
        res = P.probar_modelo("imagen", {"licencia_clase": "personal"}, motor=lambda c: {"ok": True})
        self.assertTrue(res["exitoso"])


class MotorHttp(unittest.TestCase):
    def test_la_voz_habla_con_el_daemon_local(self):
        cliente = ClienteFalso()
        res = P.probar_modelo("voz", cliente_http=cliente)
        self.assertTrue(res["exitoso"])
        self.assertEqual(cliente.llamadas[0], "http://127.0.0.1:4500/v1/audio/speech")
        cliente = ClienteFalso()
        P.probar_modelo("imagen", cliente_http=cliente, url_base="http://127.0.0.1:9999")
        self.assertEqual(cliente.llamadas[0], "http://127.0.0.1:9999/sdapi/v1/txt2img")

    def test_un_motor_que_falla_o_no_devuelve_muestra_no_pasa(self):
        res = P.probar_modelo("voz", cliente_http=ClienteFalso({"codigo": 500, "datos": {}, "bytes": 0}))
        self.assertFalse(res["exitoso"])
        self.assertIn("500", res["error"])
        res = P.probar_modelo("voz", cliente_http=ClienteFalso({"codigo": 200, "datos": {}, "bytes": 0}))
        self.assertFalse(res["exitoso"])
        self.assertIn("no devolvió muestra", res["error"])


class Decision(unittest.TestCase):
    def test_si_falla_o_no_hay_anterior(self):
        anterior = {"exitoso": True, "tiempo_segundos": 1.0}
        self.assertEqual(P.decidir({"exitoso": False}, anterior), P.VOLVER_ATRAS)
        self.assertEqual(P.decidir({"exitoso": True, "tiempo_segundos": 2.0}), P.QUEDARSE)

    def test_el_margen_del_15_por_ciento(self):
        actual = {"exitoso": True, "tiempo_segundos": 1.0}
        self.assertEqual(P.decidir({"exitoso": True, "tiempo_segundos": 1.15}, actual), P.QUEDARSE)
        self.assertEqual(P.decidir({"exitoso": True, "tiempo_segundos": 1.16}, actual), P.VOLVER_ATRAS)

    def test_una_capacidad_nueva_manda_sobre_el_tiempo(self):
        nueva = {"exitoso": True, "tiempo_segundos": 9.0, "capacidades": ["voz-z"]}
        actual = {"exitoso": True, "tiempo_segundos": 1.0, "capacidades": []}
        self.assertEqual(P.decidir(nueva, actual), P.QUEDARSE)

    def test_la_decision_es_pura_y_explica_el_motivo(self):
        nueva = {"exitoso": True, "tiempo_segundos": 1.0}
        actual = {"exitoso": True, "tiempo_segundos": 1.0}
        P.decidir(nueva, actual)
        self.assertEqual(nueva, {"exitoso": True, "tiempo_segundos": 1.0})
        self.assertEqual(actual, {"exitoso": True, "tiempo_segundos": 1.0})
        self.assertIn("falló", P.explicar({"exitoso": False}, None))
        self.assertIn("capacidades", P.explicar({"exitoso": True, "capacidades": ["x"]}, {"capacidades": []}))


if __name__ == "__main__":
    unittest.main()
