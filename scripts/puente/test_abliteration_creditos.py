#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni entorno del módulo abliteration_creditos.py (MOD1116).

Pruebas de:
  - saldo_usd: normal, campos faltan, saldo negativo
  - registrar: cambio de día, recarga a mitad de día
  - gasto_del_dia: gasto básico, sin estado
  - permitido: cada motivo de falla y éxito

Todos los valores se inyectan; ninguna función lee el entorno ni la red.
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import abliteration_creditos as A


AHORA = datetime(2026, 11, 15, 10, 30, 0, tzinfo=timezone.utc)
AHORA_ISO = AHORA.isoformat().replace("+00:00", "Z")


class TestSaldoUSD(unittest.TestCase):
    def test_saldo_normal_positivo(self):
        respuesta = {"data": {"total_credits": 100.0, "total_usage": 25.5}}
        self.assertEqual(A.saldo_usd(respuesta), 74.5)

    def test_saldo_zero(self):
        respuesta = {"data": {"total_credits": 50, "total_usage": 50}}
        self.assertEqual(A.saldo_usd(respuesta), 0.0)

    def test_saldo_redondeado_six_decimales(self):
        respuesta = {"data": {"total_credits": 100.0000001, "total_usage": 33.3333333}}
        self.assertEqual(A.saldo_usd(respuesta), 66.666667)

    def test_faltan_total_credits(self):
        respuesta = {"data": {"total_usage": 25.0}}
        self.assertIsNone(A.saldo_usd(respuesta))

    def test_faltan_total_usage(self):
        respuesta = {"data": {"total_credits": 100.0}}
        self.assertIsNone(A.saldo_usd(respuesta))

    def test_campos_no_numericos(self):
        respuesta = {"data": {"total_credits": "abc", "total_usage": 25.0}}
        self.assertIsNone(A.saldo_usd(respuesta))

    def test_data_no_dict(self):
        respuesta = {"data": None}
        self.assertIsNone(A.saldo_usd(respuesta))

    def test_sin_data(self):
        respuesta = {}
        self.assertIsNone(A.saldo_usd(respuesta))

    def test_saldo_negativo(self):
        respuesta = {"data": {"total_credits": 10.0, "total_usage": 15.0}}
        self.assertIsNone(A.saldo_usd(respuesta))


class TestRegistrar(unittest.TestCase):
    def test_primer_registro_del_dia(self):
        estado = {}
        nuevo = A.registrar(estado, 50.0, AHORA_ISO)
        self.assertEqual(nuevo["dia"], "2026-11-15")
        self.assertEqual(nuevo["saldo_inicio_dia"], 50.0)
        self.assertEqual(nuevo["saldo_ultimo"], 50.0)
        self.assertEqual(nuevo["leido"], AHORA_ISO)

    def test_cambio_de_dia(self):
        estado_inicial = {
            "dia": "2026-11-14",
            "saldo_inicio_dia": 100.0,
            "saldo_ultimo": 80.0,
            "leido": "2026-11-14T15:00:00Z"
        }
        nuevo = A.registrar(estado_inicial, 75.0, AHORA_ISO)
        self.assertEqual(nuevo["dia"], "2026-11-15")
        self.assertEqual(nuevo["saldo_inicio_dia"], 80.0)
        self.assertEqual(nuevo["saldo_ultimo"], 75.0)
        self.assertEqual(A.gasto_del_dia(nuevo), 5.0)

    def test_recarga_mantiene_gasto_positivo(self):
        estado_inicial = {
            "dia": "2026-11-15",
            "saldo_inicio_dia": 100.0,
            "saldo_ultimo": 80.0,
            "leido": "2026-11-15T08:00:00Z"
        }
        nuevo = A.registrar(estado_inicial, 150.0, AHORA_ISO)
        self.assertEqual(nuevo["saldo_inicio_dia"], 100.0)
        self.assertEqual(nuevo["saldo_ultimo"], 150.0)
        self.assertEqual(A.gasto_del_dia(nuevo), 0.0)

    def test_mismo_dia_actualiza_saldo_ultimo(self):
        estado_inicial = {
            "dia": "2026-11-15",
            "saldo_inicio_dia": 100.0,
            "saldo_ultimo": 90.0,
            "leido": "2026-11-15T08:00:00Z"
        }
        nuevo = A.registrar(estado_inicial, 70.0, AHORA_ISO)
        self.assertEqual(nuevo["saldo_inicio_dia"], 100.0)
        self.assertEqual(nuevo["saldo_ultimo"], 70.0)

    def test_salto_de_dia_sin_saldo_anterior(self):
        estado_inicial = {"dia": "2026-11-14", "saldo_ultimo": 50.0, "leido": "2026-11-14T10:00:00Z"}
        nuevo = A.registrar(estado_inicial, 60.0, AHORA_ISO)
        self.assertEqual(nuevo["saldo_inicio_dia"], 50.0)
        self.assertEqual(nuevo["saldo_ultimo"], 60.0)


class TestGastoDelDia(unittest.TestCase):
    def test_gasto_positivo(self):
        estado = {"saldo_inicio_dia": 100.0, "saldo_ultimo": 75.0}
        self.assertEqual(A.gasto_del_dia(estado), 25.0)

    def test_gasto_exacto_cero(self):
        estado = {"saldo_inicio_dia": 50.0, "saldo_ultimo": 50.0}
        self.assertEqual(A.gasto_del_dia(estado), 0.0)

    def test_gasto_sin_estado(self):
        self.assertEqual(A.gasto_del_dia({}), 0.0)

    def test_gasto_sin_saldo_inicio(self):
        estado = {"saldo_ultimo": 50.0}
        self.assertEqual(A.gasto_del_dia(estado), 0.0)

    def test_gasto_sin_saldo_ultimo(self):
        estado = {"saldo_inicio_dia": 50.0}
        self.assertEqual(A.gasto_del_dia(estado), 0.0)

    def test_gasto_no_numerico(self):
        estado = {"saldo_inicio_dia": "abc", "saldo_ultimo": 50.0}
        self.assertEqual(A.gasto_del_dia(estado), 0.0)


class TestPermitido(unittest.TestCase):
    def crear_estado(self, saldo_ultimo: float, leido: str = AHORA_ISO) -> dict:
        return {
            "dia": "2026-11-15",
            "saldo_inicio_dia": 100.0,
            "saldo_ultimo": saldo_ultimo,
            "leido": leido
        }

    def test_sin_lectura_vacio(self):
        ok, motivo = A.permitido({}, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "sin lectura")

    def test_sin_lectura_faltante_saldo_ultimo(self):
        ok, motivo = A.permitido({"saldo_inicio_dia": 100.0}, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "sin lectura")

    def test_lectura_vieja_mas_de_6_h(self):
        leido_viejo = (AHORA - timedelta(hours=7)).isoformat().replace("+00:00", "Z")
        estado = self.crear_estado(50.0, leido_viejo)
        ok, motivo = A.permitido(estado, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "lectura vieja (más de 6 h)")

    def test_lectura_reciente_menos_de_6_h(self):
        leido_reciente = (AHORA - timedelta(hours=5)).isoformat().replace("+00:00", "Z")
        estado = self.crear_estado(50.0, leido_reciente)
        ok, motivo = A.permitido(estado, AHORA_ISO, 100.0)
        self.assertTrue(ok)
        self.assertEqual(motivo, "ok")

    def test_saldo_bajo_el_margen(self):
        estado = self.crear_estado(0.3)
        ok, motivo = A.permitido(estado, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "saldo bajo el margen")

    def test_saldo_justo_margen(self):
        estado = self.crear_estado(0.6)
        ok, motivo = A.permitido(estado, AHORA_ISO, 100.0, margen_min_usd=0.5)
        self.assertEqual((ok, motivo), (True, "ok"))

    def test_tope_del_dia_alcanzado(self):
        estado = self.crear_estado(25.0)
        ok, motivo = A.permitido(estado, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "tope del día alcanzado")

    def test_tope_del_dia_no_alcanzado(self):
        estado = self.crear_estado(80.0)
        ok, motivo = A.permitido(estado, AHORA_ISO, 50.0)
        self.assertTrue(ok)
        self.assertEqual(motivo, "ok")

    def test_tope_cero_alcanzado(self):
        estado = self.crear_estado(100.0)
        ok, motivo = A.permitido(estado, AHORA_ISO, 0.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "tope del día alcanzado")

    def test_lectura_vieja_prioriza_primer_motivo(self):
        leido_viejo = (AHORA - timedelta(hours=7)).isoformat().replace("+00:00", "Z")
        estado = self.crear_estado(0.3, leido_viejo)
        ok, motivo = A.permitido(estado, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "lectura vieja (más de 6 h)")

    def test_todo_ok(self):
        estado = self.crear_estado(50.0)
        ok, motivo = A.permitido(estado, AHORA_ISO, 100.0, margen_min_usd=0.5, frescura_s=21600)
        self.assertTrue(ok)
        self.assertEqual(motivo, "ok")


class TestIntegracion(unittest.TestCase):
    def test_flujo_completo_sistema_normal(self):
        respuesta_api = {"data": {"total_credits": 200.0, "total_usage": 50.0}}
        saldo_nuevo = A.saldo_usd(respuesta_api)
        self.assertEqual(saldo_nuevo, 150.0)
        
        estado = {}
        estado = A.registrar(estado, saldo_nuevo, AHORA_ISO)
        
        gasto = A.gasto_del_dia(estado)
        self.assertEqual(gasto, 0.0)
        
        ok, motivo = A.permitido(estado, AHORA_ISO, 100.0, margen_min_usd=0.5)
        self.assertTrue(ok)

    def test_flujo_con_gasto_del_dia(self):
        estado = {
            "dia": "2026-11-15",
            "saldo_inicio_dia": 100.0,
            "saldo_ultimo": 30.0,
            "leido": AHORA_ISO
        }
        
        gasto = A.gasto_del_dia(estado)
        self.assertEqual(gasto, 70.0)
        
        ok, motivo = A.permitido(estado, AHORA_ISO, 50.0)
        self.assertFalse(ok)
        self.assertEqual(motivo, "tope del día alcanzado")


if __name__ == "__main__":
    unittest.main()