# -*- coding: utf-8 -*-
"""El túnel de Astraura que ven la web y la app: solo URLs válidas y vivas, y sin escribir de más."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publicar_tunel_astraura as T  # noqa: E402

URL = "https://uno-dos-tres-cuatro.trycloudflare.com"


class UrlValida(unittest.TestCase):
    def test_solo_https_de_cloudflare_sin_ruta(self):
        self.assertTrue(T.url_valida(URL))
        self.assertFalse(T.url_valida("http://uno.trycloudflare.com"))
        self.assertFalse(T.url_valida("https://evil.example.com"))
        self.assertFalse(T.url_valida("https://trycloudflare.com.evil.com"))
        self.assertFalse(T.url_valida(URL + "/api"))
        self.assertFalse(T.url_valida(None))


class Decidir(unittest.TestCase):
    def test_tunel_nuevo_se_publica(self):
        self.assertEqual(T.decidir(URL, True, {}, 1000)[0], True)

    def test_mismo_tunel_solo_con_latido(self):
        previo = {"url": URL, "t": 1000}
        self.assertEqual(T.decidir(URL, True, previo, 1000 + 60), (False, "sin cambios"))
        self.assertEqual(T.decidir(URL, True, previo, 1000 + T.LATIDO_S)[0], True)

    def test_tunel_muerto_o_invalido_no_se_publica(self):
        self.assertEqual(T.decidir(URL, False, {}, 1000), (False, "el túnel no responde"))
        self.assertEqual(T.decidir("https://evil.example.com", True, {}, 1000)[0], False)


if __name__ == "__main__":
    unittest.main()
