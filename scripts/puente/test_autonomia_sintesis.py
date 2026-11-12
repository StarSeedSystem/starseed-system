#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la autonomía de la síntesis sin la Mac (SDP1111R): sin red y sin ssh real."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_nodo as N  # noqa: E402
import actividad_notebooklm as A  # noqa: E402

ENV = {"TELEGRAM_SINTESIS_BOT_TOKEN": "t", "TELEGRAM_SINTESIS_CHAT_ID": "c",
       "GOOGLE_ACTIVIDAD_CLIENT_ID": "i", "GOOGLE_ACTIVIDAD_CLIENT_SECRET": "s"}


class Huellas(unittest.TestCase):
    def test_solo_huellas_nunca_valores(self):
        h = N.huella_texto("secreto-largo")
        self.assertEqual(len(h), 12)
        self.assertNotIn("secreto", h)
        self.assertEqual(N.huella_texto("secreto-largo"), N.huella_texto(b"secreto-largo"))

    def test_vigiladas_son_las_de_la_sintesis(self):
        self.assertEqual(N.VIGILADAS_SINTESIS, ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID",
                                                "GOOGLE_ACTIVIDAD_CLIENT_ID", "GOOGLE_ACTIVIDAD_CLIENT_SECRET"))

    def test_huellas_de_variables_de_cuentas_anonimas_y_notebooklm(self):
        h = N.huellas_sintesis(ENV, {"alex.json": "a", "fundacion.json": "f"}, "nl")
        self.assertEqual(sorted(h), ["GOOGLE_ACTIVIDAD_CLIENT_ID", "GOOGLE_ACTIVIDAD_CLIENT_SECRET",
                                     "TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID",
                                     "cuenta:0", "cuenta:1", "notebooklm"])
        self.assertEqual(h["cuenta:0"], N.huella_texto("a"))
        self.assertNotIn("notebooklm", N.huellas_sintesis(ENV, {}, ""))


class TocaClaves(unittest.TestCase):
    def setUp(self):
        self.act = N.huellas_sintesis(ENV, {"alex.json": "a"}, "nl")

    def test_la_primera_vez_toca(self):
        self.assertTrue(N.tocar_claves(self.act, {})[0])
        self.assertTrue(N.tocar_claves(self.act, None)[0])

    def test_sin_cambios_no_toca(self):
        self.assertFalse(N.tocar_claves(self.act, self.act)[0])

    def test_toca_cuando_cambia_aparece_o_desaparece(self):
        cambio = dict(self.act, **{"TELEGRAM_SINTESIS_BOT_TOKEN": N.huella_texto("nuevo")})
        self.assertTrue(N.tocar_claves(cambio, self.act)[0])
        self.assertTrue(N.tocar_claves(dict(self.act, **{"notebooklm": "otra"}), self.act)[0])
        menos = dict(self.act)
        menos.pop("cuenta:0")
        self.assertTrue(N.tocar_claves(self.act, menos)[0])

    def test_sin_huellas_aqui_no_toca(self):
        ok, motivo = N.tocar_claves({}, {})
        self.assertFalse(ok)


class LanzarSola(unittest.TestCase):
    """`claves` se lanza sola desde el ciclo del director cuando cambia una huella."""

    def test_cambia_lanza_claves_y_guarda_huellas(self):
        lanzadas, guardado = [], []
        base = N.huellas_sintesis(ENV, {"alex.json": "a"}, "nl")
        args = dict(lanzar=lambda: (lanzadas.append(1) or {"ok": True}), env=ENV,
                    huellas_cuentas={"alex.json": "a"}, huella_notebooklm="nl",
                    guardar_huellas=guardado.append)
        r = N.claves_sintesis_si_cambia(guardadas={}, **args)
        self.assertEqual(lanzadas, [1])
        self.assertTrue(r["ok"])
        self.assertEqual((len(guardado), len(guardado[0])), (1, len(base)))
        r2 = N.claves_sintesis_si_cambia(guardadas=guardado[0], **args)
        self.assertNotIn("claves", r2)
        self.assertEqual(lanzadas, [1])
        r3 = N.claves_sintesis_si_cambia(guardadas=guardado[0], env=ENV,
                                         huellas_cuentas={"alex.json": "otra"}, huella_notebooklm="nl",
                                         lanzar=lambda: {"ok": True}, guardar_huellas=guardado.append)
        self.assertTrue(r3["ok"])

    def test_sin_huellas_que_vigilar_no_lanza_nada(self):
        lanzadas = []
        r = N.claves_sintesis_si_cambia(lanzar=lambda: lanzadas.append(1) or {"ok": True}, env={},
                                        huellas_cuentas={}, huella_notebooklm="", guardadas={},
                                        guardar_huellas=lambda d: None)
        self.assertEqual((r["ok"], lanzadas), (True, []))
        self.assertIn("no", r)


class SesionNotebooklm(unittest.TestCase):
    """La sesión de NotebookLM viaja al A1 por el mismo túnel de `claves`, 0600 y sin eco."""

    def test_el_destino_queda_0600_y_nada_de_eco(self):
        g = N.guion_notebooklm()
        self.assertIn("-m 700", g)
        self.assertIn("-m 600", g)
        self.assertIn("notebooklm-ok", g)
        self.assertNotIn("cat ", g)
        self.assertNotIn("ls ", g)

    def test_sin_sesion_aqui_no_llama_a_ssh(self):
        llamadas = []
        orig = N._ssh_bytes
        N._ssh_bytes = lambda *a, **k: llamadas.append(a) or (0, "")
        try:
            r = N._notebooklm_al_a1(origen="/no-existe-sdp1111r")
        finally:
            N._ssh_bytes = orig
        self.assertEqual((r.get("ok"), r.get("enviado"), len(llamadas)), (True, False, 0))

    def test_viaja_por_el_mismo_tunel_y_nada_sale_por_la_salida(self):
        enviados, orig_b, orig_s = [], N._ssh_bytes, N.ssh
        N._ssh_bytes = lambda orden, datos, **k: enviados.append((orden, datos)) or (0, "")
        def ssh_mock(orden, **k):
            if "auth check" in str(orden):
                return (1, "")  # A1 no tiene sesión válida
            return (0, "notebooklm-ok")  # instalación ok
        N.ssh = ssh_mock
        try:
            r = N._notebooklm_al_a1(origen=__file__)
        finally:
            N._ssh_bytes, N.ssh = orig_b, orig_s
        self.assertTrue(r["ok"] and r["enviado"])
        orden, datos = enviados[0]
        self.assertIn("/tmp/starseed-notebooklm.json", orden)
        self.assertTrue(datos)

    def test_el_instalador_del_a1_deja_el_cli_en_un_venv_propio(self):
        g = N.guion_notebooklm_venv()
        self.assertIn("venv", g)
        self.assertIn("pip install", g)
        self.assertIn("notebooklm-py", g)
        self.assertIn("[ ! -x", g)
        self.assertNotIn("'", g)


class DondeCorre(unittest.TestCase):
    """Los lectores de actividad y la entrega solo en el líder; la nube compartida nunca."""

    def test_el_cli_del_venv_del_a1_cuenta_y_sin_cli_nada(self):
        self.assertEqual(A.buscar_cli(existe=lambda r: "venvs/notebooklm" in r, cual=lambda n: None), A.CLI_VENV_A1)
        self.assertIsNone(A.buscar_cli(existe=lambda r: False, cual=lambda n: None))
        self.assertEqual(A.buscar_cli(existe=lambda r: True, cual=lambda n: None), A.CLI_MAC)

    def test_los_lectores_solo_en_el_lider_y_nunca_en_la_nube_compartida(self):
        self.assertTrue(N.se_puede_leer_actividad(True)[0])
        self.assertFalse(N.se_puede_leer_actividad(False)[0])
        self.assertFalse(N.se_puede_leer_actividad(True, contenedor_nube=True)[0])
        self.assertFalse(N.se_puede_leer_actividad(True, hay_claves=False)[0])
        self.assertTrue(N.es_contenedor_nube({"GITHUB_ACTIONS": "true"}))
        self.assertFalse(N.es_contenedor_nube({}))


    def test_en_la_nube_compartida_el_ciclo_no_manda_nada(self):
        orig_env, orig_nube = N._env_local, N.es_contenedor_nube
        N._env_local, N.es_contenedor_nube = (lambda: ENV), (lambda env=None: True)
        try:
            r = N.claves_sintesis_si_cambia(lanzar=lambda: (_ for _ in ()).throw(RuntimeError("no")),
                                            huellas_cuentas={"a.json": "x"}, huella_notebooklm="",
                                            guardadas={}, guardar_huellas=lambda d: None)
        finally:
            N._env_local, N.es_contenedor_nube = orig_env, orig_nube
        self.assertNotIn("claves", r)
        self.assertIn("nube", r["no"])


if __name__ == "__main__":
    unittest.main()
