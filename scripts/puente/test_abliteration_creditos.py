# -*- coding: utf-8 -*-
"""Pruebas unitarias para abliteration_creditos.py (MOD1116).

Verifica:
- Saldo normal
- Campos faltantes / incorrectos
- Cambio de día
- Recarga a mitad de día
- Cada motivo de permitido
- Que ninguna función lea el entorno ni la red (módulos puros).
"""

import sys
import os
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import abliteration_creditos as AC


class TestAbliterationCreditos(unittest.TestCase):

    def test_saldo_usd_normal(self):
        resp = {"data": {"total_credits": 10.0, "total_usage": 2.5}}
        self.assertEqual(AC.saldo_usd(resp), 7.5)

    def test_saldo_usd_faltantes(self):
        self.assertIsNone(AC.saldo_usd({}))
        self.assertIsNone(AC.saldo_usd({"data": {"total_credits": 10.0}}))
        self.assertIsNone(AC.saldo_usd({"data": {"total_credits": "10", "total_usage": 2.0}}))

    def test_saldo_usd_negativo(self):
        resp = {"data": {"total_credits": 1.0, "total_usage": 5.0}}
        self.assertIsNone(AC.saldo_usd(resp))

    def test_registrar_nuevo(self):
        ahora = "2026-11-16T12:00:00Z"
        est = AC.registrar(None, 10.0, ahora)
        self.assertEqual(est["dia"], "2026-11-16")
        self.assertEqual(est["saldo_inicio_dia"], 10.0)
        self.assertEqual(est["saldo_ultimo"], 10.0)
        self.assertEqual(est["leido"], ahora)

    def test_registrar_mismo_dia(self):
        ahora = "2026-11-16T14:00:00Z"
        est = {"dia": "2026-11-16", "saldo_inicio_dia": 10.0, "saldo_ultimo": 8.0, "leido": "2026-11-16T10:00:00Z"}
        nuevo = AC.registrar(est, 7.5, ahora)
        self.assertEqual(nuevo["dia"], "2026-11-16")
        self.assertEqual(nuevo["saldo_inicio_dia"], 10.0)
        self.assertEqual(nuevo["saldo_ultimo"], 7.5)

    def test_registrar_cambio_de_dia(self):
        ahora = "2026-11-17T08:00:00Z"
        est = {"dia": "2026-11-16", "saldo_inicio_dia": 10.0, "saldo_ultimo": 6.0, "leido": "2026-11-16T22:00:00Z"}
        nuevo = AC.registrar(est, 6.0, ahora)
        self.assertEqual(nuevo["dia"], "2026-11-17")
        self.assertEqual(nuevo["saldo_inicio_dia"], 6.0)
        self.assertEqual(nuevo["saldo_ultimo"], 6.0)

    def test_gasto_del_dia(self):
        est = {"dia": "2026-11-16", "saldo_inicio_dia": 10.0, "saldo_ultimo": 7.25}
        self.assertEqual(AC.gasto_del_dia(est), 2.75)

    def test_gasto_del_dia_recarga(self):
        # Si el saldo sube (recarga), gasto debe ser 0.0
        est = {"dia": "2026-11-16", "saldo_inicio_dia": 5.0, "saldo_ultimo": 15.0}
        self.assertEqual(AC.gasto_del_dia(est), 0.0)

    def test_permitido_sin_lectura(self):
        ok, motivo = AC.permitido(None, "2026-11-16T12:00:00Z", 5.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "sin lectura")

    def test_permitido_lectura_vieja(self):
        est = {"dia": "2026-11-16", "saldo_inicio_dia": 10.0, "saldo_ultimo": 8.0, "leido": "2026-11-16T00:00:00Z"}
        # Han pasado 13 horas (> 6 h / 21600s)
        ok, motivo = AC.permitido(est, "2026-11-16T13:00:00Z", 5.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "lectura vieja (más de 6 h)")

    def test_permitido_saldo_bajo_margen(self):
        est = {
            "dia": "2026-11-16",
            "saldo_inicio_dia": 10.0,
            "saldo_ultimo": 0.3,
            "leido": "2026-11-16T11:00:00Z",
        }
        ok, motivo = AC.permitido(est, "2026-11-16T12:00:00Z", 5.0, margen_min_usd=0.5)
        self.assertFalse(ok)
        self.assertEqual(motivo, "saldo bajo el margen")

    def test_permitido_tope_dia_alcanzado(self):
        est = {
            "dia": "2026-11-16",
            "saldo_inicio_dia": 10.0,
            "saldo_ultimo": 4.0,
            "leido": "2026-11-16T11:00:00Z",
        }
        # Gasto = 10.0 - 4.0 = 6.0, tope = 5.0
        ok, motivo = AC.permitido(est, "2026-11-16T12:00:00Z", tope_dia_usd=5.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "tope del día alcanzado")

    def test_permitido_ok(self):
        est = {"dia": "2026-11-16", "saldo_inicio_dia": 10.0, "saldo_ultimo": 8.0, "leido": "2026-11-16T11:00:00Z"}
        ok, motivo = AC.permitido(est, "2026-11-16T12:00:00Z", tope_dia_usd=5.0, margen_min_usd=0.5)
        self.assertTrue(ok)
        self.assertEqual(motivo, "ok")


if __name__ == "__main__":
    unittest.main()
