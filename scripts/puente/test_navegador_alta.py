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


EJECUTAR_REAL = N._ejecutar_cli


class TestNotebooklm(Base):
    def setUp(self):
        super().setUp()
        self.cli, self.importadas = [], []
        self.cookies = [{"name": "__Secure-1PSID", "domain": ".google.com", "value": "secreto"}]
        self.comprobada, self.sesion_viva = True, True

        def falsa_ejecutar(args, entrada=""):
            self.cli.append((tuple(args), entrada))
            if tuple(args) == ("auth", "check"):
                return {"ok": self.comprobada, "salida": ""}
            return {"ok": True, "salida": ""}

        falsas = {
            "_sesion_viva": lambda s: self.sesion_viva,
            "_extraer_cookies": lambda s: list(self.cookies),
            "_ejecutar_cli": falsa_ejecutar,
        }
        for objetivo, valor in falsas.items():
            parche = patch.object(N, objetivo, valor)
            parche.start()
            self.addCleanup(parche.stop)

    def test_extrae_importa_comprueba_y_avisa_sin_imprimir_cookies(self):
        r = N.notebooklm()
        self.assertEqual(r, {"ok": True})
        orden = [c[0] for c in self.cli]
        self.assertEqual(orden, [("auth", "import-cookies"), ("auth", "check")])
        self.assertEqual(self.telegram, ["sesión de NotebookLM renovada desde el navegador propio: "
                                         "auth check en verde"])
        self.assertFalse([c for c in self.llamadas if c[0] in ("fill", "type", "password")])

    def test_la_salida_del_cli_nunca_lleva_cookies(self):
        import io
        from contextlib import redirect_stdout
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = N.main(["n", "notebooklm"])
        self.assertEqual(codigo, 0)
        self.assertNotIn("secreto", salida.getvalue())
        self.assertNotIn("__Secure-1PSID", salida.getvalue())

    def test_check_en_rojo_avisa_del_fallo(self):
        self.comprobada = False
        r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertEqual(len(self.telegram), 1)
        self.assertIn("falló", self.telegram[0])

    def test_sin_cookies_no_importa_nada_y_avisa(self):
        self.cookies = []
        r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertEqual(self.cli, [])
        self.assertEqual(len(self.telegram), 1)
        self.assertIn("sin cookies de Google", self.telegram[0])


class TestNotebooklmAlta(TestNotebooklm):
    def test_si_no_esta_viva_lanza_el_alta_y_repite(self):
        estados = [False, True]

        def falsa_viva(sesion):
            return estados.pop(0) if estados else True

        with patch.object(N, "_sesion_viva", falsa_viva):
            r = N.notebooklm()
        self.assertTrue(r["ok"])
        self.assertEqual(self.llamadas[0], ("encender", "google-alex"))
        orden = [c[0] for c in self.cli]
        self.assertEqual(orden, [("auth", "import-cookies"), ("auth", "check")])

    def test_si_el_alta_falla_no_importa_nada_y_avisa(self):
        self.espera = False

        with patch.object(N, "_sesion_viva", lambda s: False):
            r = N.notebooklm()
        self.assertFalse(r["ok"])
        self.assertEqual(self.cli, [])
        self.assertEqual([c for c in self.llamadas if c[0] == "encender"],
                         [("encender", "google-alex")])
        self.assertEqual(len(self.telegram), 2)
        self.assertIn("no pude renovar NotebookLM", self.telegram[1])
        self.assertIn("inicia sesión en google-alex", self.telegram[0])

    def test_cli_ausente_da_motivo_sin_fallar(self):
        with patch.dict(os.environ, {"STARSEED_NOTEBOOKLM_CLI": "/no/existe"}):
            r = EJECUTAR_REAL(["auth", "check"])
        self.assertFalse(r["ok"])
        self.assertIn("no encontrado", r["motivo"])


class TestCli(Base):
    def test_despacha_los_tres_comandos_y_rechaza_lo_demas(self):
        with patch.object(NR, "marcar_estado", self.marcar()):
            self.assertEqual(N.main(["n", "alta", "google-alex"]), 0)
            self.assertEqual(N.main(["n", "estado"]), 0)
            self.assertEqual(N.main(["n", "vigilar"]), 0)
        self.assertEqual(N.main(["n", "desconocido"]), 1)

if __name__ == "__main__":
    unittest.main()
