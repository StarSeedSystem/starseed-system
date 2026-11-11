# -*- coding: utf-8 -*-
"""Pruebas puras de sintesis_telegram.py (sin red): partir, tachado del token,
envío con `pedir` inyectable y caso sin token."""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sintesis_telegram as S


def _fake_pedir(respuestas):
    """Crea un pedir falso que registra (url, cuerpo) y devuelve respuestas en cola."""
    llamadas: list[dict] = []

    def pedir(url, cuerpo):
        llamadas.append({"url": url, "cuerpo": cuerpo})
        return respuestas.pop(0) if respuestas else (200, {"ok": True})

    return pedir, llamadas


ENV_SINTESIS = {
    S.TOKEN_SINTESIS: "123:ABC-token-de-prueba",
    S.CHAT_SINTESIS: "8670436815",
}


class TestPartir(unittest.TestCase):
    """Troceo a 3.500 caracteres por párrafos."""

    def test_parrafo_corto(self):
        self.assertEqual(S.partir("Hola mundo"), ["Hola mundo"])

    def test_parrafos_separados(self):
        self.assertEqual(S.partir("Uno.\n\nDos.\n\nTres."), ["Uno.", "Dos.", "Tres."])

    def test_parrafo_largo_se_corta_duro(self):
        trozos = S.partir("a" * 4000)
        self.assertEqual([len(t) for t in trozos], [3500, 500])

    def test_texto_vacio(self):
        self.assertEqual(S.partir(""), [])


class TestTacharUrl(unittest.TestCase):
    """Nunca se imprime ni registra el token: toda URL con /bot queda tachada."""

    def test_tacha_token(self):
        url = "https://api.telegram.org/bot123:ABC-secreto/sendMessage"
        self.assertEqual(S._tachar_url(url), "https://api.telegram.org/bot***/sendMessage")

    def test_url_sin_bot_intacta(self):
        self.assertEqual(S._tachar_url("https://api.telegram.org/file/"), "https://api.telegram.org/file/")


class TestEnviar(unittest.TestCase):
    """enviar() con `pedir` inyectable: sin token, troceo, botón y fallos."""

    def _enviar(self, pedir, texto="Uno.\n\nDos.", boton_url=None):
        with mock.patch.dict(os.environ, ENV_SINTESIS):
            return S.enviar(texto, boton_url=boton_url, pedir=pedir)

    def test_sin_token_no_lanza(self):
        pedir, llamadas = _fake_pedir([])
        env = {S.CHAT_SINTESIS: "8670436815"}
        with mock.patch.dict(os.environ, env):
            r = S.enviar("hola", pedir=pedir)
        self.assertEqual(r, {"ok": False, "motivo": "sin token"})
        self.assertEqual(llamadas, [])

    def test_envio_ok_llega_al_chat_de_la_sintesis(self):
        pedir, llamadas = _fake_pedir([])
        r = self._enviar(pedir)
        self.assertTrue(r["ok"])
        self.assertEqual(r["trozos"], 2)
        self.assertEqual(len(llamadas), 2)
        url = llamadas[0]["url"]
        self.assertTrue(url.startswith("https://api.telegram.org/bot123:ABC-token-de-prueba/sendMessage"))
        self.assertEqual(llamadas[0]["cuerpo"]["chat_id"], "8670436815")
        self.assertEqual(llamadas[0]["cuerpo"]["text"], "Uno.")
        self.assertEqual(llamadas[1]["cuerpo"]["text"], "Dos.")

    def test_texto_plano_sin_parse_mode(self):
        pedir, llamadas = _fake_pedir([])
        self._enviar(pedir, texto="Texto *simple* sin formato")
        self.assertNotIn("parse_mode", llamadas[0]["cuerpo"])

    def test_boton_url_solo_en_ultimo_trozo(self):
        pedir, llamadas = _fake_pedir([])
        self._enviar(pedir, boton_url="https://starseed-os.vercel.app")
        self.assertNotIn("reply_markup", llamadas[0]["cuerpo"])
        teclado = llamadas[1]["cuerpo"]["reply_markup"]["inline_keyboard"]
        self.assertEqual(teclado[0][0]["url"], "https://starseed-os.vercel.app")

    def test_error_http_no_lanza(self):
        pedir, _ = _fake_pedir([(400, {"ok": False})])
        r = self._enviar(pedir)
        self.assertFalse(r["ok"])
        self.assertEqual(r["motivo"], "HTTP 400")

    def test_error_de_red_no_lanza(self):
        pedir, _ = _fake_pedir([(None, None)])
        r = self._enviar(pedir)
        self.assertFalse(r["ok"])
        self.assertEqual(r["motivo"], "error de red")


if __name__ == "__main__":
    unittest.main()
