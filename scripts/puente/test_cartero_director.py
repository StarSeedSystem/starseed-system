# -*- coding: utf-8 -*-
"""Pruebas de cartero_director.py: que_hacer (pura) y estado en disco."""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cartero_director as C


def _msg(idm, canales, t="2026-10-04T10:00:00+00:00"):
    return {
        "id": idm,
        "t": t,
        "de": "alex",
        "rol": "alex",
        "tipo": "mensaje",
        "texto": "hola",
        "canal": "mando",
        "canales": canales,
    }


def _entrega(de_id, canal, estado, t="2026-10-04T10:01:00+00:00"):
    return {"tipo": "entrega", "de_id": de_id, "canal": canal, "estado": estado, "t": t}


class TestQueHacer(unittest.TestCase):
    def setUp(self):
        self.estado = {"atendidos": []}

    def test_pendiente_sin_entrega_entra(self):
        r = [_msg("md-1-aaaa", ["claude-mac"])]
        self.assertEqual([("md-1-aaaa", "claude-mac")], C.que_hacer(r, self.estado))

    def test_canales_bandeja_quedan_fuera(self):
        r = [_msg("md-1-aaaa", ["terminal", "ide", "antigravity"])]
        self.assertEqual([], C.que_hacer(r, self.estado))

    def test_claude_cowork_se_atiende_al_momento(self):
        # (2026-10-04) Alex: cualquier modelo del director contesta al momento.
        r = [_msg("md-1-aaaa", ["claude-cowork"])]
        self.assertEqual([("md-1-aaaa", "claude-cowork")], C.que_hacer(r, self.estado))

    def test_entrega_respondida_no_vuelve(self):
        r = [
            _msg("md-1-aaaa", ["hermes"]),
            _entrega("md-1-aaaa", "hermes", "respondido"),
        ]
        self.assertEqual([], C.que_hacer(r, self.estado))

    def test_ultima_entrega_manda(self):
        r = [
            _msg("md-1-aaaa", ["hermes"]),
            _entrega("md-1-aaaa", "hermes", "respondido"),
            _entrega("md-1-aaaa", "hermes", "pendiente", t="2026-10-04T10:02:00+00:00"),
        ]
        self.assertEqual([("md-1-aaaa", "hermes")], C.que_hacer(r, self.estado))

    def test_ya_atendido_no_vuelve(self):
        estado = {"atendidos": ["md-1-aaaa|telegram"]}
        r = [_msg("md-1-aaaa", ["telegram"])]
        self.assertEqual([], C.que_hacer(r, estado))

    def test_varios_canales_del_mismo_mensaje(self):
        r = [_msg("md-1-aaaa", ["claude-mac", "telegram"])]
        self.assertEqual(
            [("md-1-aaaa", "claude-mac"), ("md-1-aaaa", "telegram")],
            C.que_hacer(r, self.estado),
        )

    def test_sin_canales_no_hace_nada(self):
        r = [_msg("md-1-aaaa", None)]
        r[0].pop("canales")
        self.assertEqual([], C.que_hacer(r, self.estado))

    def test_no_duplica_aunque_el_registro_se_repita(self):
        m = _msg("md-1-aaaa", ["chatgpt"])
        self.assertEqual(
            [("md-1-aaaa", "chatgpt")], C.que_hacer([m, dict(m)], self.estado)
        )


class TestEstadoEnDisco(unittest.TestCase):
    def test_cargar_estado_vacio_y_guardar(self):
        with tempfile.TemporaryDirectory() as d:
            estado = C.cargar_estado(raiz=d)
            self.assertEqual([], estado["atendidos"])
            estado["atendidos"] = ["a|claude-mac"]
            C.guardar_estado(estado, raiz=d)
            leido = C.cargar_estado(raiz=d)
            self.assertEqual(["a|claude-mac"], leido["atendidos"])

    def test_tope_opus_diario(self):
        estado = {"opus_fecha": "2000-01-01", "opus_hoy": 99}
        self.assertTrue(C._opus_disponible(estado))
        self.assertEqual(0, estado["opus_hoy"])
        estado["opus_hoy"] = C.TOPE_OPUS
        self.assertFalse(C._opus_disponible(estado))
        C._registrar_opus(estado)
        self.assertEqual(C.TOPE_OPUS + 1, estado["opus_hoy"])


class TestResumenJev(unittest.TestCase):
    def test_datos_completos(self):
        datos = {
            "llamadas": 7,
            "coste_usd": 0.0012,
            "tope_dia_usd": 0.05,
            "mes_usd": 0.01,
            "tope_mes_usd": 1.0,
        }
        self.assertEqual(
            "Jev: 7 llamadas hoy · 0.0012 $ de 0.0500 $ del día "
            "(0.0100 $ en el mes de 1.0000 $)",
            C.resumen_jev(datos),
        )

    def test_sin_datos(self):
        self.assertEqual("Jev: sin datos", C.resumen_jev({}))
        self.assertEqual("Jev: sin datos", C.resumen_jev(None))
        self.assertEqual("Jev: sin datos", C.resumen_jev("texto"))

    def test_forma_rara(self):
        self.assertEqual("Jev: sin datos", C.resumen_jev({"llamadas": "siete"}))
        self.assertEqual("Jev: sin datos", C.resumen_jev({"llamadas": 1}))


class TestResumenConsumo(unittest.TestCase):
    def test_datos_completos(self):
        datos = {
            "supabase": {
                "peticiones_hora": 12,
                "top": [{"ruta": "/api/mando/estado", "n": 5}],
            }
        }
        self.assertEqual(
            "Supabase: 12 peticiones en la última hora "
            "(más pedida: /api/mando/estado ×5)",
            C.resumen_consumo(datos),
        )

    def test_sin_top(self):
        datos = {"supabase": {"peticiones_hora": 3}}
        self.assertEqual(
            "Supabase: 3 peticiones en la última hora", C.resumen_consumo(datos)
        )

    def test_sin_datos(self):
        self.assertEqual("Supabase: sin datos", C.resumen_consumo({}))
        self.assertEqual("Supabase: sin datos", C.resumen_consumo({"supabase": []}))

    def test_forma_rara(self):
        datos = {"supabase": {"peticiones_hora": "muchas"}}
        self.assertEqual("Supabase: sin datos", C.resumen_consumo(datos))


class TestResumenOpus(unittest.TestCase):
    def test_datos_completos(self):
        datos = {"llamadas": 4, "tokens": {"entrada": 1200, "salida": 300}}
        self.assertEqual(
            "Opus de los directores: 4 llamadas, 1200 tokens de entrada y 300 de salida",
            C.resumen_opus(datos),
        )

    def test_solo_llamadas(self):
        self.assertEqual(
            "Opus de los directores: 2 llamadas", C.resumen_opus({"llamadas": 2})
        )

    def test_sin_datos(self):
        self.assertEqual("Opus de los directores: sin datos", C.resumen_opus({}))
        self.assertEqual("Opus de los directores: sin datos", C.resumen_opus(None))

    def test_forma_rara(self):
        self.assertEqual(
            "Opus de los directores: sin datos",
            C.resumen_opus({"result": "ok", "total_usd": 1.5}),
        )


class TestTextoInformeUso(unittest.TestCase):
    def test_no_es_un_volcado_json(self):
        texto = C.texto_informe_uso({"opus_hoy": 1})
        self.assertNotIn("{", texto)
        self.assertNotIn('"hoy"', texto)
        for linea in texto.splitlines():
            self.assertLessEqual(len(linea), 200)




class TestClaudeCoworkAlMomento(unittest.TestCase):
    """claude-cowork contesta con el mismo motor que claude-mac y firma como claude-cowork."""

    def setUp(self):
        from unittest import mock
        self.mock = mock
        self.publicados, self.entregas = [], []
        self.p1 = mock.patch.object(C.director_chat, "publicar", side_effect=lambda *a, **k: self.publicados.append((a, k)))
        self.p2 = mock.patch.object(C.director_chat, "entrega", side_effect=lambda *a, **k: self.entregas.append((a, k)))
        self.p3 = mock.patch.object(C.director_chat, "leer", return_value=[])
        for p in (self.p1, self.p2, self.p3):
            p.start()
        self.estado = {"atendidos": [], "sesion_claude": None, "opus_fecha": "", "opus_hoy": 0}
        self.msg = _msg("md-9-cccc", ["claude-cowork"])
        self.msg["modelo"] = "claude-cowork/claude-opus-5-5"

    def tearDown(self):
        for p in (self.p1, self.p2, self.p3):
            p.stop()

    def test_responde_como_claude_cowork(self):
        salida = '{"result": "ok", "session_id": "s1", "usage": {"input_tokens": 3, "output_tokens": 1}, "total_cost_usd": 0}'
        with self.mock.patch.object(C.motores_director, "correr", return_value=(0, salida)) as correr:
            C.atender(self.msg, "claude-cowork", self.estado)
        orden = correr.call_args[0][0]
        self.assertEqual("claude", orden[0])
        self.assertIn("claude-opus-5-5", orden)
        (texto,), k = self.publicados[-1]
        self.assertEqual("ok", texto)
        self.assertEqual("claude-cowork", k["de"])
        self.assertEqual("claude-cowork/claude-opus-5-5", k["modelo"])
        self.assertEqual("claude-code-mac", k["uso"]["via"])
        self.assertEqual(("md-9-cccc", "claude-cowork", "respondido"), self.entregas[-1][0])
        self.assertIn("md-9-cccc|claude-cowork", self.estado["atendidos"])
        self.assertEqual(1, self.estado["opus_hoy"])

    def test_sin_saldo_marca_fallo_en_su_canal(self):
        with self.mock.patch.object(C.motores_director, "correr", return_value=(1, "Credit balance is too low")):
            C.atender(self.msg, "claude-cowork", self.estado)
        self.assertEqual(("md-9-cccc", "claude-cowork", "fallo"), self.entregas[-1][0])

    def test_claude_mac_sigue_igual(self):
        salida = '{"result": "hola", "usage": {}}'
        m = dict(self.msg, canales=["claude-mac"], modelo="claude-mac/claude-opus-5-5")
        with self.mock.patch.object(C.motores_director, "correr", return_value=(0, salida)):
            C.atender(m, "claude-mac", self.estado)
        (_texto,), k = self.publicados[-1]
        self.assertEqual("claude-mac", k["de"])
        self.assertNotIn("via", k["uso"])

if __name__ == "__main__":
    unittest.main()
