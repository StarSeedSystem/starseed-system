#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de navegador_alta sin red (NAV1112D): dobles inyectados, sin Playwright."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navegador_alta as N  # noqa: E402
import navegador_reglas as NR  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self):
        self.telegram, self.llamadas, self.espera = [], [], True

        def registra(nombre, resultado=None):
            def falso(*args):
                self.llamadas.append((nombre,) + args)
                return True if resultado is None else resultado
            return falso

        dobles = {
            "_obtener_telegram": lambda: self,
            "_encender_selkies": registra("encender"),
            "_apagar_selkies": registra("apagar"),
            "_iniciar_cromium": registra("chromium"),
            "_abrir_pagina_inicio_sesion": registra("pagina"),
            "_obtener_cliente": registra("cliente", object()),
            "_esperar_hasta_30_minutos": lambda sesion: self.espera,
            "_extraer_cookies_google": registra("extraer_cookies", [{"name": "test", "value": "cookie"}]),
            "_importar_cookies_notebooklm": registra("importar_cookies", True),
            "_comprobar_notebooklm": registra("comprobar_notebooklm", {"ok": True, "salida": "OK"}),
        }
        for objetivo, valor in dobles.items():
            parche = patch.object(N, objetivo, valor)
            parche.start()
            self.addCleanup(parche.stop)

    def enviar(self, texto, boton_url=None):
        self.telegram.append(texto)
        return {"ok": True, "trozos": 1}

    def marcar(self, caducadas=()):
        def falso(sesion, nuevo, ahora=None, ruta=None):
            return {"sesiones": {s: {"estado": "caducada" if s in caducadas else "viva",
                                     "ultima_comprobacion": "2026-11-12T10:00:00Z"}
                                 for s in NR.SESIONES}}
        return falso


class TestAlta(Base):
    def test_avisa_sin_ip_ni_url_y_apaga_selkies(self):
        self.assertEqual(N.alta("google-alex"), {"ok": True, "sesion": "google-alex"})
        self.assertEqual(len(self.telegram), 1)
        aviso = self.telegram[0]
        self.assertTrue(aviso.startswith("abre MetaGenesis › Apps Linux e inicia sesión en google-alex"))
        self.assertNotRegex(aviso, r"https?://|\d{1,3}(?:\.\d{1,3}){3}|:\d{2,5}")
        self.assertEqual(self.llamadas[:2], [("encender", "google-alex"), ("chromium", "google-alex")])
        self.assertIn(("pagina",), self.llamadas)
        self.assertEqual(self.llamadas[-1], ("apagar",))
        self.assertFalse([c for c in self.llamadas if c[0] in ("fill", "type", "password")])

    def test_apaga_selkies_si_la_espera_caduca(self):
        self.espera = False
        r = N.alta("google-fundacion")
        self.assertFalse(r["ok"])
        self.assertIn("tiempo de espera excedido", r["motivo"])
        self.assertEqual(self.llamadas[-1], ("apagar",))

    def test_apaga_selkies_si_chromium_falla(self):
        with patch.object(N, "_iniciar_cromium", side_effect=RuntimeError("sin docker")):
            r = N.alta("instagram-maggasukha")
        self.assertFalse(r["ok"])
        self.assertEqual(self.llamadas[-1], ("apagar",))

    def test_sesion_desconocida_no_enciende_nada(self):
        r = N.alta("otra-sesion")
        self.assertFalse(r["ok"])
        self.assertIn("desconocida", r["motivo"])
        self.assertEqual((self.llamadas, self.telegram), ([], []))


class TestEstado(Base):
    def test_marca_cada_sesion_y_respeta_la_caducada(self):
        with patch.object(NR, "marcar_estado", self.marcar({"instagram-sociedad"})):
            r = N.estado()
        self.assertEqual(set(r["sesiones"]), set(NR.SESIONES))
        estados = [r["sesiones"][s]["estado"] for s in ("google-alex", "instagram-sociedad")]
        self.assertEqual(estados, ["viva", "caducada"])
        self.assertEqual(r["sesiones"]["google-alex"]["cuenta"], NR.SESIONES["google-alex"]["cuenta"])
        self.assertIn(("cliente",), self.llamadas)


class TestVigilar(Base):
    def test_avisa_una_vez_solo_de_la_caducada(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            self.assertFalse(N.vigilar()["aviso"])
        self.assertEqual(self.telegram, [])
        with patch.object(NR, "marcar_estado", self.marcar({"instagram-maggasukha"})):
            r = N.vigilar()
        self.assertTrue(r["aviso"])
        self.assertEqual(len(self.telegram), 1)
        self.assertIn("instagram-maggasukha", self.telegram[0])

    def test_no_reintenta_el_alta(self):
        with patch.object(NR, "marcar_estado", self.marcar(set(NR.SESIONES))):
            with patch.object(N, "alta") as alta_falsa:
                N.vigilar()
        alta_falsa.assert_not_called()


class TestCli(Base):
    def test_despacha_los_tres_comandos_y_rechaza_lo_demas(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            self.assertEqual(N.main(["n", "alta", "google-alex"]), 0)
            self.assertEqual(N.main(["n", "estado"]), 0)
            self.assertEqual(N.main(["n", "vigilar"]), 0)
        self.assertEqual(N.main(["n", "desconocido"]), 1)


class TestNotebookLM(Base):
    def test_renueva_desde_google_alex_viva(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            r = N.notebooklm()
        self.assertTrue(r["ok"])
        self.assertIn("MetaGenesis › Apps Linux", r["mensaje"])
        self.assertEqual(self.llamadas[0], ("extraer_cookies", "google-alex"))
        self.assertEqual(self.llamadas[1], ("importar_cookies", [{"name": "test", "value": "cookie"}]))
        self.assertEqual(self.llamadas[2], ("comprobar_notebooklm",))
        self.assertEqual(len(self.telegram), 1)
        self.assertIn("MetaGenesis › Apps Linux", self.telegram[0])

    def test_lanza_alta_si_google_alex_no_viva(self):
        self.espera = True
        with patch.object(NR, "marcar_estado", self.marcar({"google-alex"})):
            with patch.object(N, "alta", return_value={"ok": True, "sesion": "google-alex"}) as alta_falsa:
                with patch.object(N, "_esperar_hasta_30_minutos", return_value=True):
                    r = N.notebooklm()
        self.assertTrue(r["ok"])
        alta_falsa.assert_called_once_with("google-alex")

    def test_falla_si_alta_google_alex_falla(self):
        with patch.object(NR, "marcar_estado", self.marcar({"google-alex"})):
            with patch.object(N, "alta", return_value={"ok": False, "motivo": "sin docker"}):
                r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertIn("falló alta google-alex", r["motivo"])

    def test_falla_si_no_hay_cookies(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            with patch.object(N, "_extraer_cookies_google", return_value=[]):
                r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertIn("no se pudieron extraer cookies", r["motivo"])

    def test_falla_si_importar_cookies_falla(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            with patch.object(N, "_importar_cookies_notebooklm", return_value=False):
                r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertIn("falló importar cookies", r["motivo"])

    def test_falla_si_check_falla(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            with patch.object(N, "_comprobar_notebooklm", return_value={"ok": False, "salida": "no autenticado"}):
                r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertIn("notebooklm auth check falló", r["motivo"])

    def test_cli_notebooklm(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            self.assertEqual(N.main(["n", "notebooklm"]), 0)

if __name__ == "__main__":
    unittest.main()
