# -*- coding: utf-8 -*-
"""Pruebas puras de sintesis_telegram.py: troceado, sin token, envío simulado (sin red)."""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sintesis_telegram as S

TOKEN, CHAT = "SECRETO123", "8670436815"
CLAVES = ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID")

class TestPartir(unittest.TestCase):
    """La función pura partir(texto, tope)."""

    def test_corto_en_un_trozo_y_vacio_da_lista_vacia(self):
        self.assertEqual(S.partir("Hola mundo", 3500), ["Hola mundo"])
        self.assertEqual(S.partir("", 3500), [])

    def test_parrafos_se_agrupan_hasta_el_tope(self):
        trozos = S.partir("a" * 2000 + "\n\n" + "b" * 2000, 3500)
        self.assertEqual(len(trozos), 2)
        self.assertTrue(all(len(t) <= 3500 for t in trozos))

    def test_parrafo_mas_largo_que_el_tope_se_corta(self):
        trozos = S.partir("a" * 4000, 3500)
        self.assertEqual([len(t) for t in trozos], [3500, 500])
        self.assertEqual("".join(trozos), "a" * 4000)

class TestEnviar(unittest.TestCase):
    """enviar() con petición inyectada: sin red y sin token impreso."""

    def setUp(self):
        self._viejos = {k: os.environ.pop(k, None) for k in CLAVES}
        self.peticiones = []

    def tearDown(self):
        for k, v in self._viejos.items():
            os.environ[k] = v if v is not None else ""

    def pedir(self, resultado=(200, {"ok": True})):
        registro = self.peticiones
        def pedir_falsa(url, cuerpo=None):
            registro.append((url, cuerpo))
            return resultado
        return pedir_falsa

    def con_credenciales(self):
        os.environ[CLAVES[0]] = TOKEN
        os.environ[CLAVES[1]] = CHAT

    def test_sin_token_devuelve_motivo_sin_llamar(self):
        self.assertEqual(S.enviar("hola", pedir=self.pedir()), {"ok": False, "motivo": "sin token"})
        self.assertEqual(self.peticiones, [])

    def test_token_sin_chat_tambien_es_sin_token(self):
        os.environ[CLAVES[0]] = TOKEN
        self.assertEqual(S.enviar("hola", pedir=self.pedir())["motivo"], "sin token")

    def test_envio_basico_chat_id_y_texto_plano(self):
        self.con_credenciales()
        r = S.enviar("Línea de prueba", pedir=self.pedir())
        self.assertEqual(r, {"ok": True, "trozos": 1, "chat_id": CHAT})
        url, cuerpo = self.peticiones[0]
        self.assertTrue(url.endswith("/bot" + TOKEN + "/sendMessage"))
        datos = json.loads(cuerpo.decode("utf-8"))
        self.assertEqual(datos, {"chat_id": CHAT, "text": "Línea de prueba", "disable_web_page_preview": True})

    def test_boton_url_lleva_teclado_inline(self):
        self.con_credenciales()
        S.enviar("ver", boton_url="https://starseed-os.vercel.app", pedir=self.pedir())
        datos = json.loads(self.peticiones[0][1].decode("utf-8"))
        self.assertEqual(datos["reply_markup"]["inline_keyboard"][0][0]["url"], "https://starseed-os.vercel.app")

    def test_texto_largo_envia_varios_mensajes(self):
        self.con_credenciales()
        self.assertEqual(S.enviar("a" * 8000, pedir=self.pedir())["trozos"], 3)
        self.assertEqual(len(self.peticiones), 3)

    def test_error_de_la_api_corta_y_da_motivo(self):
        self.con_credenciales()
        r = S.enviar("a" * 8000, pedir=self.pedir((400, {"ok": False, "description": "chat not found"})))
        self.assertFalse(r["ok"])
        self.assertIn("telegram 400", r["motivo"])
        self.assertEqual(len(self.peticiones), 1)

    def test_excepcion_red_da_motivo_sin_token(self):
        self.con_credenciales()

        def pedir_falsa(url, cuerpo=None):
            raise OSError("urlopen error con https://api.telegram.org/bot" + TOKEN + "/sendMessage")

        r = S.enviar("hola", pedir=pedir_falsa)
        self.assertFalse(r["ok"])
        self.assertNotIn(TOKEN, r["motivo"])

    def test_credenciales_leidas_del_archivo_env(self):
        f = tempfile.NamedTemporaryFile("w", suffix=".env", delete=False, encoding="utf-8")
        f.write("OTRA_CLAVE=no\nexport TELEGRAM_SINTESIS_BOT_TOKEN=" + TOKEN + "\n")
        f.write('TELEGRAM_SINTESIS_CHAT_ID="' + CHAT + '"\n')
        f.close()
        r = S.enviar_desde(f.name, "hola", pedir=self.pedir())
        os.unlink(f.name)
        self.assertTrue(r["ok"])
        self.assertEqual(len(self.peticiones), 1)
class TestTachar(unittest.TestCase):
    def test_url_con_token_tachada(self):
        tachada = S.tachar("https://api.telegram.org/bot" + TOKEN + "/sendMessage")
        self.assertNotIn(TOKEN, tachada)
        self.assertIn("/bot", tachada)

    def test_url_sin_bot_queda_igual(self):
        self.assertEqual(S.tachar("https://api.telegram.org/file?path=x"), "https://api.telegram.org/file?path=x")
