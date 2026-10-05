#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de produccion_webhooks.py: cliente HTTP falso, cero red y cero entorno real."""

import json
import os
import sys
import unittest
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_webhooks as pw

SECRETO = "secreto-de-prueba"
URL_A = "https://n8n.ejemplo.com/webhook/abc123"
URL_B = "https://dify.ejemplo.com/v1/hook/xyz"


class RespuestaFalsa:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return b"{}"


class ClienteFalso:
    """urlopen inyectable: registra cada llamada y falla cuando se le pide."""

    def __init__(self, status=200, fallos=None):
        self.llamadas = []
        self.status = status
        self.fallos = list(fallos or [])  # excepciones a lanzar, una por llamada

    def urlopen(self, req, timeout=None):
        self.llamadas.append({"req": req, "timeout": timeout})
        if self.fallos:
            raise self.fallos.pop(0)
        return RespuestaFalsa(self.status)


def entorno(**extra):
    base = {
        "PRODUCCION_WEBHOOK_SECRETO": SECRETO,
        "N8N_WEBHOOK_URL": URL_A,
        "DIFY_WEBHOOK_URL": URL_B,
    }
    base.update(extra)
    return base


class TestFirma(unittest.TestCase):
    def test_firmar_estable(self):
        h1 = pw.firmar(b"hola", SECRETO)
        self.assertEqual(len(h1), 64)
        self.assertEqual(h1, pw.firmar(b"hola", SECRETO))
        self.assertNotEqual(h1, pw.firmar(b"hola2", SECRETO))

    def test_verificar_firma_ok(self):
        cuerpo = b'{"evento":"produccion.publicada"}'
        cab = "sha256=%s" % pw.firmar(cuerpo, SECRETO)
        self.assertTrue(pw.verificar_firma(cuerpo, cab, SECRETO))
        self.assertTrue(pw.verificar_firma(cuerpo.decode(), cab, SECRETO))

    def test_verificar_firma_rechaza(self):
        cuerpo = b"{}"
        cab = "sha256=%s" % pw.firmar(cuerpo, SECRETO)
        for malo in (b"{ }", cab + "00", cab[7:], "", None):
            self.assertFalse(pw.verificar_firma(malo, cab, SECRETO) if malo is not None else pw.verificar_firma(cuerpo, None, SECRETO))
        self.assertFalse(pw.verificar_firma(cuerpo, cab, "otro-secreto"))
        self.assertFalse(pw.verificar_firma(cuerpo, cab, ""))
        self.assertFalse(pw.verificar_firma(cuerpo, "sha256=zzzz", SECRETO))


class TestUrls(unittest.TestCase):
    def test_urls_sin_duplicados(self):
        env = entorno(PRODUCCION_WEBHOOKS="%s, https://otra.ejemplo.com/h ," % URL_A)
        urls = pw._urls_configuradas(env)
        self.assertEqual(
            urls, [URL_A, URL_B, "https://otra.ejemplo.com/h"]
        )

    def test_sin_secreto_no_envia(self):
        cliente = ClienteFalso()
        env = entorno(PRODUCCION_WEBHOOK_SECRETO="")
        r = pw.emitir("produccion.publicada", {"sha": "abc"}, entorno=env, http=cliente)
        self.assertFalse(r["enviado"])
        self.assertEqual(r["urls"], [])
        self.assertIn("secreto", r["motivo"].lower())
        self.assertEqual(cliente.llamadas, [])

    def test_sin_urls_no_envia(self):
        cliente = ClienteFalso()
        env = {"PRODUCCION_WEBHOOK_SECRETO": SECRETO}
        r = pw.emitir("produccion.publicada", {}, entorno=env, http=cliente)
        self.assertFalse(r["enviado"])
        self.assertIn("URLs", r["motivo"])
        self.assertEqual(cliente.llamadas, [])


class TestEmitir(unittest.TestCase):
    def test_envio_ok_con_firma(self):
        cliente = ClienteFalso(status=200)
        r = pw.emitir(
            "produccion.pieza_lista",
            {"sha": "abc", "medios": ["web"], "tareas": ["T1"], "nota": "¡lista!"},
            entorno=entorno(),
            http=cliente,
        )
        self.assertTrue(r["enviado"])
        self.assertEqual(len(r["urls"]), 2)
        hosts = {u["host"] for u in r["urls"]}
        self.assertEqual(hosts, {"n8n.ejemplo.com", "dify.ejemplo.com"})
        for u in r["urls"]:
            self.assertTrue(u["enviado"])
        # nunca la URL completa en el resultado
        for u in r["urls"]:
            self.assertNotIn("/webhook/", json.dumps(u))
        # cada llamada: POST JSON con firma válida y timeout de 5 s
        for llamada in cliente.llamadas:
            self.assertEqual(llamada["timeout"], 5)
            req = llamada["req"]
            cuerpo = req.data
            cab = req.get_header("X-starseed-firma")
            self.assertTrue(pw.verificar_firma(cuerpo, cab, SECRETO))
            carga = json.loads(cuerpo)
            self.assertEqual(carga["evento"], "produccion.pieza_lista")
            self.assertEqual(carga["sha"], "abc")
            self.assertEqual(carga["medios"], ["web"])
            self.assertEqual(carga["tareas"], ["T1"])
            self.assertEqual(carga["datos"], {"nota": "¡lista!"})
            self.assertIn("momento", carga)

    def test_reintento_una_sola_vez(self):
        cliente = ClienteFalso(fallos=[TimeoutError("cuelgue")])
        env = {"PRODUCCION_WEBHOOK_SECRETO": SECRETO, "N8N_WEBHOOK_URL": URL_A}
        r = pw.emitir("produccion.publicada", {}, entorno=env, http=cliente)
        self.assertTrue(r["enviado"])  # el reintento funcionó
        self.assertEqual(len(cliente.llamadas), 2)

    def test_doble_fallo_no_lanza(self):
        cliente = ClienteFalso(fallos=[TimeoutError(), OSError("sin red")])
        env = {"PRODUCCION_WEBHOOK_SECRETO": SECRETO, "N8N_WEBHOOK_URL": URL_A}
        r = pw.emitir("produccion.revertida", {}, entorno=env, http=cliente)
        self.assertFalse(r["enviado"])
        self.assertFalse(r["urls"][0]["enviado"])
        self.assertEqual(r["urls"][0]["error"], "OSError")

    def test_estado_500_no_marcado_enviado(self):
        cliente = ClienteFalso(status=500)
        env = {"PRODUCCION_WEBHOOK_SECRETO": SECRETO, "N8N_WEBHOOK_URL": URL_A}
        r = pw.emitir("produccion.publicada", {}, entorno=env, http=cliente)
        self.assertFalse(r["enviado"])
        self.assertEqual(r["urls"][0]["estado"], 500)
        self.assertEqual(len(cliente.llamadas), 1)  # HTTP 500 no se reintenta

    def test_main_devuelve_cero(self):
        self.assertEqual(pw.main(["webhooks", "produccion.publicada", "{}"]), 0)
        self.assertEqual(pw.main(["webhooks"]), 2)
        self.assertEqual(pw.main(["webhooks", "ev", "{mal json"]), 2)


if __name__ == "__main__":
    unittest.main()

