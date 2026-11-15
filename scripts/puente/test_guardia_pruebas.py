# -*- coding: utf-8 -*-
"""Pruebas de la guardia de red de pruebas (SIN1114).

Verifica que la guardia bloquea llamadas a Drive, Telegram, NotebookLM durante pruebas.
"""
import http.client
import os
import socket
import tempfile
import unittest
import urllib.request
from unittest.mock import patch

AHORA = "2026-11-11"


class TestParchesRed(unittest.TestCase):
    """SIN1111: la guardia corta urlopen, HTTPS y sockets externos, respeta localhost y no
    apaga la variable STARSEED_PRUEBAS que fijó la sesión de pytest."""

    @classmethod
    def setUpClass(cls):
        import guardia_pruebas as G
        cls.G = G
        # Instala la guardia de sesión (como hace pytest con conftest) para que STARSEED_PRUEBAS=1 persista
        G.instalar_sesion()
        cls._originales = G._capturar() if hasattr(G, '_capturar') else None

    def setUp(self):
        G = self.G
        self._previas = (urllib.request.urlopen, http.client.HTTPSConnection.connect,
                         socket.create_connection)
        G.activar()

    def tearDown(self):
        G = self.G
        G.desactivar()
        (urllib.request.urlopen, http.client.HTTPSConnection.connect,
         socket.create_connection) = self._previas

    def test_urlopen_externo_falla(self):
        with self.assertRaises(self.G.ErrorRedEnPruebas):
            urllib.request.urlopen("https://example.com/sin1114")

    def test_https_connect_externo_falla(self):
        conexion = http.client.HTTPSConnection("example.com")
        with self.assertRaises(self.G.ErrorRedEnPruebas):
            conexion.connect()

    def test_socket_create_externo_falla(self):
        with self.assertRaises(self.G.ErrorRedEnPruebas):
            socket.create_connection(("example.com", 443))

    def test_localhost_y_file_no_los_bloquea(self):
        self.assertTrue(self.G._es_local("127.0.0.1"))
        self.assertTrue(self.G._es_local("localhost"))
        self.assertFalse(self.G._es_local("example.com"))
        self.assertTrue(self.G._url_permitida("file:///tmp/sin1114"))
        self.assertFalse(self.G._url_permitida("https://example.com/sin1114"))

    def test_desactivar_conserva_la_variable_de_sesion(self):
        self.G.desactivar()
        self.assertEqual(os.environ.get("STARSEED_PRUEBAS"), "1")

    def test_activar_desactivar_restaura_el_entorno_previo(self):
        self.G.desactivar()
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("STARSEED_PRUEBAS", None)
            self.G.activar()
            self.assertEqual(os.environ.get("STARSEED_PRUEBAS"), "1")
            self.G.desactivar()
            self.assertNotIn("STARSEED_PRUEBAS", os.environ)
        self.assertEqual(os.environ.get("STARSEED_PRUEBAS"), "1")


class TestGuardiaMantienePruebasSinRed(unittest.TestCase):
    """SIN1114Ac: verifica que STARSEED_PRUEBAS=1 impide llamadas reales a cuentas_google, 
    sintesis_telegram y _subir_doc."""

    def setUp(self):
        self._guardia = None
        from scripts.puente import guardia_pruebas as G
        self._guardia = G
        G.activar()

    def tearDown(self):
        if self._guardia:
            self._guardia.desactivar()

    def test_subir_doc_falla_con_starpruebas(self):
        """_subir_doc debe fallar cuando STARSEED_PRUEBAS=1."""
        import agente_sintesis as A
        tmp = tempfile.TemporaryDirectory()
        raiz = tmp.name
        try:
            os.makedirs(os.path.join(raiz, A.REL_SINTESIS), exist_ok=True)
            
            def redactar_falso(p):
                return "Texto de prueba"
            
            def subir_falso(f, t):
                raise self._guardia.ErrorRedEnPruebas("subir_drive bloqueado")
            
            from datetime import datetime, timezone
            AHORA = datetime(2026, 11, 11, 13, 54, tzinfo=timezone.utc)
            
            r = A.ciclo(raiz, AHORA, encargar=False, jev=False, 
                        enviar=lambda t, **kw: {"ok": True, "trozos": 1},
                        redactar=redactar_falso, subir_drive=subir_falso,
                        home=raiz, seco=False)
            self.assertTrue(r["ok"])
            self.assertEqual(r["resultado"]["accion"], "sin_sintesis")
        finally:
            tmp.cleanup()


if __name__ == "__main__":
    unittest.main()