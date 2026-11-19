#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas unitarias para las funciones puras de pruebas_malla.py."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402


class TestFiltrarPruebas(unittest.TestCase):
    def setUp(self):
        self.bateria = {
            "pruebas": [
                {"id": "B1-MT-A1", "bloque": "B1", "ronda": 1, "par": "MT", "antena": "ble"},
                {"id": "B1-MT-A2", "bloque": "B1", "ronda": 1, "par": "MT", "antena": "wifi"},
                {"id": "B2-MT-A1", "bloque": "B2", "ronda": 2, "par": "MT", "antena": "ble"},
                {"id": "B4-BL-A1", "bloque": "B4", "ronda": 4, "par": "BL", "antena": "ble"},
            ]
        }

    def test_sin_filtros(self):
        res = PM.filtrar_pruebas(self.bateria)
        self.assertEqual(len(res), 4)

    def test_filtro_bloque(self):
        res = PM.filtrar_pruebas(self.bateria, bloque="B1")
        self.assertEqual([p["id"] for p in res], ["B1-MT-A1", "B1-MT-A2"])

    def test_filtro_ronda(self):
        res = PM.filtrar_pruebas(self.bateria, ronda=1)
        self.assertEqual([p["id"] for p in res], ["B1-MT-A1", "B1-MT-A2"])

    def test_filtro_ambos(self):
        res = PM.filtrar_pruebas(self.bateria, bloque="B1", ronda=1)
        self.assertEqual([p["id"] for p in res], ["B1-MT-A1", "B1-MT-A2"])

    def test_filtro_sin_resultados(self):
        res = PM.filtrar_pruebas(self.bateria, bloque="B9")
        self.assertEqual(res, [])


class TestSiguientePendiente(unittest.TestCase):
    def setUp(self):
        self.bateria = {
            "pruebas": [
                {"id": "B1-MT-A1", "bloque": "B1", "ronda": 1},
                {"id": "B1-MT-A2", "bloque": "B1", "ronda": 1},
                {"id": "B2-MT-A1", "bloque": "B2", "ronda": 2},
            ]
        }

    def test_todas_pendientes(self):
        registro = []
        p = PM.siguiente_pendiente(self.bateria, registro)
        self.assertIsNotNone(p)
        self.assertEqual(p["id"], "B1-MT-A1")

    def test_algunas_hechas(self):
        registro = [{"id": "B1-MT-A1", "accion": "empezar"}]
        p = PM.siguiente_pendiente(self.bateria, registro)
        self.assertIsNotNone(p)
        self.assertEqual(p["id"], "B1-MT-A2")

    def test_todas_hechas(self):
        registro = [{"id": "B1-MT-A1", "accion": "empezar"}, {"id": "B1-MT-A2", "accion": "empezar"}, {"id": "B2-MT-A1", "accion": "empezar"}]
        p = PM.siguiente_pendiente(self.bateria, registro)
        self.assertIsNone(p)


class TestEstadoPrueba(unittest.TestCase):
    def test_pendiente(self):
        self.assertEqual(PM.estado_prueba([], "B1-MT-A1"), "pendiente")

    def test_en_curso(self):
        self.assertEqual(PM.estado_prueba([{"id": "B1-MT-A1", "accion": "empezar"}], "B1-MT-A1"), "en-curso")

    def test_recogida(self):
        self.assertEqual(PM.estado_prueba([{"id": "B1-MT-A1", "accion": "recoger"}], "B1-MT-A1"), "recogida")

    def test_evaluada(self):
        self.assertEqual(PM.estado_prueba([{"id": "B1-MT-A1", "accion": "evaluar"}], "B1-MT-A1"), "evaluada")

    def test_cerrada_ok(self):
        self.assertEqual(PM.estado_prueba([{"id": "B1-MT-A1", "accion": "cerrar", "resultado": "ok"}], "B1-MT-A1"), "ok")

    def test_ultima_accion_manda(self):
        reg = [
            {"id": "B1-MT-A1", "accion": "empezar"},
            {"id": "B1-MT-A1", "accion": "recoger"},
            {"id": "B1-MT-A1", "accion": "evaluar"},
            {"id": "B1-MT-A1", "accion": "cerrar", "resultado": "parcial"},
        ]
        self.assertEqual(PM.estado_prueba(reg, "B1-MT-A1"), "parcial")


class TestRecortarVentana(unittest.TestCase):
    def setUp(self):
        self.lineas = [
            "2026-11-18T10:00:00.000Z evento antes\n",
            "2026-11-18T12:00:00.000Z evento inicio\n",
            "2026-11-18T12:30:00.000Z evento medio\n",
            "2026-11-18T13:00:00.000Z evento fin\n",
            "2026-11-18T14:00:00.000Z evento despues\n",
            "línea sin timestamp\n",
        ]

    def test_ventana_normal(self):
        res = PM.recortar_ventana(self.lineas, "2026-11-18T12:00:00.000Z", "2026-11-18T13:00:00.000Z")
        self.assertEqual(len(res), 4)  # 3 con timestamp + 1 sin timestamp
        self.assertIn("evento inicio", res[0])
        self.assertIn("evento medio", res[1])
        self.assertIn("evento fin", res[2])
        self.assertIn("línea sin timestamp", res[3])

    def test_sin_fin(self):
        res = PM.recortar_ventana(self.lineas, "2026-11-18T12:30:00.000Z")
        self.assertEqual(len(res), 4)  # 3 con timestamp + 1 sin timestamp (todo después del inicio)
        self.assertIn("evento medio", res[0])
        self.assertIn("evento fin", res[1])
        self.assertIn("evento despues", res[2])

    def test_ventana_vacia(self):
        res = PM.recortar_ventana(self.lineas, "2026-11-18T15:00:00.000Z", "2026-11-18T16:00:00.000Z")
        self.assertEqual(len(res), 1)  # solo la línea sin timestamp
        self.assertIn("línea sin timestamp", res[0])


class TestEvaluarPatrones(unittest.TestCase):
    def setUp(self):
        self.lineas = [
            "2026-11-18T12:00:00.000Z control-sesion inicio de=abc12345 nivel=controlar alcance=total\n",
            "2026-11-18T12:00:01.000Z control-sesion orden leer-estado de=abc12345 resultado=autorizada\n",
            "2026-11-18T12:00:02.000Z control-sesion fin de=abc12345 motivo=la-persona-desde-el-indicador\n",
        ]

    def test_todos_cumplidos(self):
        debe = [
            r"control-sesion.*inicio de=[0-9a-f]{8} nivel=controlar alcance=(total|protegido)",
            r"control-sesion.*orden leer-estado de=[0-9a-f]{8} resultado=autorizada",
            r"control-sesion.*fin de=[0-9a-f]{8} motivo=la-persona-desde-el-indicador",
        ]
        no_debe = [r"motivo=sin-indicador-nativo", r"resultado=rechazo:pausa-local.*leer-estado"]
        ok, det = PM.evaluar_patrones(self.lineas, debe, no_debe)
        self.assertTrue(ok)
        self.assertEqual(len(det["cumplidos"]), 3)
        self.assertEqual(det["fallados"], [])
        self.assertEqual(det["no_debe_violados"], [])

    def test_falta_debe(self):
        debe = [r"control-sesion.*orden gesto de=[0-9a-f]{8} resultado=autorizada"]
        ok, det = PM.evaluar_patrones(self.lineas, debe, [])
        self.assertFalse(ok)
        self.assertEqual(det["fallados"], debe)

    def test_no_debe_violado(self):
        lineas_con_error = self.lineas + ["2026-11-18T12:00:03.000Z control-sesion fin de=abc12345 motivo=sin-indicador-nativo\n"]
        no_debe = [r"motivo=sin-indicador-nativo"]
        ok, det = PM.evaluar_patrones(lineas_con_error, [], no_debe)
        self.assertFalse(ok)
        self.assertEqual(det["no_debe_violados"], no_debe)


class TestEvaluarPruebaCompleta(unittest.TestCase):
    def test_multiples_aparatos(self):
        lineas_mac = ["control-sesion inicio de=abc12345 nivel=controlar alcance=total\n"]
        lineas_tableta = ["control-sesion inicio de=abc12345 nivel=controlar alcance=total\n"]
        criterios = {
            "mac": {"debe": [r"control-sesion.*inicio"], "no_debe": []},
            "tableta": {"debe": [r"control-sesion.*inicio"], "no_debe": []},
        }
        res = PM.evaluar_prueba_completa({"mac": lineas_mac, "tableta": lineas_tableta}, criterios)
        self.assertTrue(res["mac"]["ok"])
        self.assertTrue(res["tableta"]["ok"])

    def test_un_aparato_falla(self):
        lineas_mac = ["control-sesion inicio de=abc12345 nivel=controlar alcance=total\n"]
        lineas_tableta = ["otra cosa\n"]
        criterios = {
            "mac": {"debe": [r"control-sesion.*inicio"], "no_debe": []},
            "tableta": {"debe": [r"control-sesion.*inicio"], "no_debe": []},
        }
        res = PM.evaluar_prueba_completa({"mac": lineas_mac, "tableta": lineas_tableta}, criterios)
        self.assertTrue(res["mac"]["ok"])
        self.assertFalse(res["tableta"]["ok"])


class TestFormatearInforme(unittest.TestCase):
    def setUp(self):
        self.bateria = {
            "bateria": "1118",
            "pruebas": [
                {"id": "B1-MT-A1", "titulo": "Apertura sesión", "ronda": 1, "bloque": "B1", "par": "MT", "antena": "ble"},
                {"id": "B1-MT-A2", "titulo": "Apertura WiFi", "ronda": 1, "bloque": "B1", "par": "MT", "antena": "wifi"},
                {"id": "B2-MT-A1", "titulo": "Pausa local", "ronda": 2, "bloque": "B2", "par": "MT", "antena": "ble"},
            ]
        }
        self.registro = [
            {"id": "B1-MT-A1", "accion": "cerrar", "resultado": "ok"},
            {"id": "B1-MT-A2", "accion": "empezar"},
        ]

    def test_informe_completo(self):
        tabla = PM.formatear_informe(self.bateria, self.registro)
        self.assertIn("B1-MT-A1", tabla)
        self.assertIn("B1-MT-A2", tabla)
        self.assertIn("B2-MT-A1", tabla)
        self.assertIn("✅ ok", tabla)
        self.assertIn("🔄 en-curso", tabla)
        self.assertIn("⏳ pendiente", tabla)

    def test_informe_filtrado_ronda(self):
        tabla = PM.formatear_informe(self.bateria, self.registro, ronda=1)
        self.assertIn("B1-MT-A1", tabla)
        self.assertIn("B1-MT-A2", tabla)
        self.assertNotIn("B2-MT-A1", tabla)


class TestIntegracionRegistro(unittest.TestCase):
    def test_guardar_y_leer_registro(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = PM.REGISTRO_PATH
            PM.REGISTRO_PATH = Path(tmp) / "registro.jsonl"
            try:
                PM.guardar_registro({"id": "B1-MT-A1", "accion": "empezar", "inicio": "2026-11-18T12:00:00Z"})
                PM.guardar_registro({"id": "B1-MT-A1", "accion": "cerrar", "resultado": "ok", "fin": "2026-11-18T12:30:00Z"})
                reg = PM.leer_registro()
                self.assertEqual(len(reg), 2)
                self.assertEqual(reg[0]["accion"], "empezar")
                self.assertEqual(reg[1]["accion"], "cerrar")
                self.assertEqual(reg[1]["resultado"], "ok")
            finally:
                PM.REGISTRO_PATH = original


if __name__ == "__main__":
    unittest.main()