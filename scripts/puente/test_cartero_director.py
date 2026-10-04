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
        r = [_msg("md-1-aaaa", ["claude-cowork", "terminal", "ide", "antigravity"])]
        self.assertEqual([], C.que_hacer(r, self.estado))

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


if __name__ == "__main__":
    unittest.main()
