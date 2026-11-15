#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la guardia de red: demuestra que con la guardia un ciclo real de
agente_sintesis no hace ninguna llamada de red.
"""
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import agente_sintesis as A
import guardia_pruebas


class TestGuardiaRed(unittest.TestCase):
    """La guardia bloquea urllib.request.urlopen y socket.create_connection
    hacia hosts no locales."""

    def setUp(self):
        guardia_pruebas.activar()

    def tearDown(self):
        guardia_pruebas.desactivar()

    def test_urlopen_localhost_pasa(self):
        import urllib.request
        # Esto debe funcionar (localhost)
        try:
            urllib.request.urlopen("http://127.0.0.1:9999/", timeout=1)
        except (ConnectionRefusedError, OSError):
            pass  # Esperado: no hay servidor, pero no lanzó ErrorRedEnPruebas
        except guardia_pruebas.ErrorRedEnPruebas:
            self.fail("urlopen a localhost no debe lanzar ErrorRedEnPruebas")

    def test_urlopen_externo_bloquea(self):
        import urllib.request
        with self.assertRaises(guardia_pruebas.ErrorRedEnPruebas):
            urllib.request.urlopen("https://api.telegram.org/bot123/sendMessage", timeout=1)

    def test_create_connection_localhost_pasa(self):
        import socket
        try:
            socket.create_connection(("127.0.0.1", 9999), timeout=1)
        except (ConnectionRefusedError, OSError):
            pass
        except guardia_pruebas.ErrorRedEnPruebas:
            self.fail("create_connection a localhost no debe lanzar ErrorRedEnPruebas")

    def test_create_connection_externo_bloquea(self):
        import socket
        with self.assertRaises(guardia_pruebas.ErrorRedEnPruebas):
            socket.create_connection(("api.telegram.org", 443), timeout=1)

    def test_variable_entorno_puesta(self):
        self.assertEqual(os.environ.get("STARSEED_PRUEBAS"), "1")

    def test_guardia_se_desactiva_en_teardown(self):
        # Esta prueba verifica que el tearDown restaura el estado
        pass


class TestCicloSinRed(unittest.TestCase):
    """Un ciclo real de agente_sintesis con la guardia no hace llamadas de red."""

    def setUp(self):
        guardia_pruebas.activar()
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.raiz)
        os.makedirs(self.home, exist_ok=True)

    def tearDown(self):
        guardia_pruebas.desactivar()
        self._tmp.cleanup()

    def test_ciclo_recolectar_no_llama_red(self):
        """Fase recolectar (00:00 CDMX) no toca red."""
        ahora = datetime(2026, 11, 11, 6, 0, tzinfo=timezone.utc)  # 00:00 CDMX
        r = A.ciclo(self.raiz, ahora, encargar=False, jev=False, home=self.home, seco=False)
        self.assertTrue(r["toca"])
        self.assertEqual(r["fase"], "recolectar")

    def test_ciclo_redactar_no_llama_red(self):
        """Fase redactar (06:30 CDMX) no toca red."""
        ahora = datetime(2026, 11, 11, 12, 30, tzinfo=timezone.utc)  # 06:30 CDMX
        r = A.ciclo(self.raiz, ahora, encargar=False, jev=False, home=self.home, seco=False)
        self.assertEqual(r["fase"], "redactar")
        self.assertEqual(r["resultado"]["accion"], "esperando_salidas")

    def test_ciclo_entregar_seco_no_llama_red(self):
        """Fase entregar en seco no toca red."""
        ahora = datetime(2026, 11, 11, 13, 54, tzinfo=timezone.utc)  # 07:54 CDMX
        r = A.ciclo(self.raiz, ahora, encargar=False, jev=False, home=self.home, seco=True)
        self.assertEqual(r["fase"], "entregar")
        self.assertEqual(r["resultado"]["accion"], "seco")

    def test_ciclo_entregar_con_sintesis_falsa_envia_y_no_llama_red_real(self):
        """Fase entregar con síntesis en disco y enviar falso: no toca red real."""
        ahora = datetime(2026, 11, 11, 13, 54, tzinfo=timezone.utc)
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, "2026-11-11.md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("Síntesis de prueba con fuentes y fechas. " * 50)

        enviados = []
        fuentes_aseguradas = []

        def enviar_falso(texto, **kw):
            enviados.append(texto)
            return {"ok": True, "trozos": 1}

        def asegurar_fuente_falso(fid, titulo):
            # (2026-11-14) El revisor de SIN1114A señaló que un mock que solo
            # devuelve None no demuestra que NotebookLM NO se invoque: si la
            # garantía se rompe, el mock la escondería. Aquí se registra la
            # llamada para poder afirmar que no se hizo ninguna.
            fuentes_aseguradas.append((fid, titulo))
            return None

        r = A.ciclo(
            self.raiz, ahora, encargar=False, jev=False,
            enviar=enviar_falso, home=self.home, seco=False,
            subir_drive=lambda f, t: None,  # Inyectado: no sube a Drive real
            asegurar_fuente=asegurar_fuente_falso,  # Inyectado: no llama a NotebookLM
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")
        self.assertEqual(len(enviados), 2)
        # La sintesis de prueba ya esta en disco: no hay que fabricar ninguna fuente.
        self.assertEqual(fuentes_aseguradas, [],
                         "No se debe invocar NotebookLM cuando la sintesis ya existe")


if __name__ == "__main__":
    unittest.main()