#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1118A · Pruebas unitarias de la lógica pura de pruebas_malla.py.

Cubre: ventanas de tiempo, evaluación de patrones (debe/no_debe), formato de informe.
"""
import json
import re
import sys
import unittest
from datetime import datetime, timezone

RUTA_MODULO = "scripts.puente.pruebas_malla"


class VentanaTiempoTests(unittest.TestCase):
    """Extracción de líneas dentro de una ventana [inicio, fin]."""

    def setUp(self):
        self.muestra_enlaces = """2026-11-18T10:00:00.000Z ble l2cap-kbps enlace=b1 neurona=aaa · kbps=100
2026-11-18T10:00:01.000Z web 2026-11-18T10:00:00.500Z · llamada · b1 · neurona aaa · senal-recibida app
2026-11-18T10:00:02.000Z web 2026-11-18T10:00:01.500Z · control-sesion · inicio de=00112233 nivel=controlar alcance=total
2026-11-18T10:00:03.000Z web 2026-11-18T10:00:02.500Z · control-sesion · orden leer-estado de=00112233 resultado=autorizada
2026-11-18T10:00:04.000Z web 2026-11-18T10:00:03.500Z · control-sesion · fin de=00112233 motivo=la-persona-desde-el-indicador
2026-11-18T10:00:05.000Z ble l2cap-kbps enlace=b1 neurona=aaa · kbps=50
"""

        self.muestra_control = """{"t":"2026-11-18T10:00:00.000Z","ev":"sesion-abierta","detalle":"de=00112233 nivel=controlar alcance=total","ant":"inicio","h":"hash1"}
{"t":"2026-11-18T10:00:01.000Z","ev":"orden","detalle":"leer-estado de=00112233 resultado=autorizada","ant":"hash1","h":"hash2"}
{"t":"2026-11-18T10:00:02.000Z","ev":"sesion-parada","detalle":"de=00112233 motivo=la-persona-desde-el-indicador","ant":"hash2","h":"hash3"}
"""

    def test_ventana_inicio_fin_incluyentes(self):
        from scripts.puente.pruebas_malla import recortar_ventana
        ini = datetime(2026, 11, 18, 10, 0, 1, tzinfo=timezone.utc)
        fin = datetime(2026, 11, 18, 10, 0, 3, tzinfo=timezone.utc)
        lineas = recortar_ventana(self.muestra_enlaces.splitlines(), ini, fin)
        self.assertEqual(len(lineas), 3)
        self.assertIn("10:00:01", lineas[0])
        self.assertIn("10:00:03", lineas[-1])

    def test_ventana_solo_inicio(self):
        from scripts.puente.pruebas_malla import recortar_ventana
        ini = datetime(2026, 11, 18, 10, 0, 3, tzinfo=timezone.utc)
        lineas = recortar_ventana(self.muestra_enlaces.splitlines(), ini, None)
        self.assertEqual(len(lineas), 3)
        self.assertIn("10:00:03", lineas[0])
        self.assertIn("10:00:05", lineas[-1])

    def test_ventana_solo_fin(self):
        from scripts.puente.pruebas_malla import recortar_ventana
        fin = datetime(2026, 11, 18, 10, 0, 2, tzinfo=timezone.utc)
        lineas = recortar_ventana(self.muestra_enlaces.splitlines(), None, fin)
        self.assertEqual(len(lineas), 3)
        self.assertIn("10:00:00", lineas[0])
        self.assertIn("10:00:02", lineas[-1])

    def test_ventana_vacia_si_fuera_de_rango(self):
        from scripts.puente.pruebas_malla import recortar_ventana
        ini = datetime(2026, 11, 18, 11, 0, 0, tzinfo=timezone.utc)
        lineas = recortar_ventana(self.muestra_enlaces.splitlines(), ini, None)
        self.assertEqual(lineas, [])

    def test_ventana_control_neuronas_json(self):
        from scripts.puente.pruebas_malla import recortar_ventana
        ini = datetime(2026, 11, 18, 10, 0, 0, tzinfo=timezone.utc)
        fin = datetime(2026, 11, 18, 10, 0, 1, tzinfo=timezone.utc)
        lineas = recortar_ventana(self.muestra_control.splitlines(), ini, fin)
        self.assertEqual(len(lineas), 2)
        for l in lineas:
            self.assertTrue(l.startswith("{"))
            self.assertIn('"t"', l)


class PatronTests(unittest.TestCase):
    """Evaluación de criterios debe/no_debe contra líneas de registro."""

    def setUp(self):
        self.lineas_mac = [
            "2026-11-18T10:00:00.000Z web · control-sesion · inicio de=00112233 nivel=controlar alcance=total",
            "2026-11-18T10:00:01.000Z web · control-sesion · orden leer-estado de=00112233 resultado=autorizada",
            "2026-11-18T10:00:02.000Z web · control-sesion · fin de=00112233 motivo=la-persona-desde-el-indicador",
        ]
        self.lineas_tableta = [
            '{"t":"2026-11-18T10:00:00.000Z","ev":"sesion-abierta","detalle":"de=00112233 nivel=controlar alcance=total","ant":"inicio","h":"h1"}',
            '{"t":"2026-11-18T10:00:01.000Z","ev":"orden","detalle":"leer-estado de=00112233 resultado=autorizada","ant":"h1","h":"h2"}',
            '{"t":"2026-11-18T10:00:02.000Z","ev":"sesion-parada","detalle":"de=00112233 motivo=la-persona-desde-el-indicador","ant":"h2","h":"h3"}',
        ]

    def test_debe_todos_presentes_ok(self):
        from scripts.puente.pruebas_malla import evaluar_patrones
        criterios = {
            "debe": [
                r"control-sesion.*inicio de=.*nivel=controlar",
                r"control-sesion.*orden.*resultado=autorizada",
                r"control-sesion.*fin de=.*motivo=la-persona-desde-el-indicador",
            ],
            "no_debe": [
                r"control-sesion.*motivo=sin-indicador-nativo",
            ],
        }
        res = evaluar_patrones(self.lineas_mac, criterios)
        self.assertTrue(res["ok"])
        self.assertEqual(res["debe_cumplidos"], 3)
        self.assertEqual(res["no_debe_cumplidos"], 1)
        self.assertEqual(res["debe_faltantes"], [])

    def test_debe_falta_uno_falla(self):
        from scripts.puente.pruebas_malla import evaluar_patrones
        criterios = {
            "debe": [
                r"control-sesion.*inicio de=.*nivel=controlar",
                r"control-sesion.*orden.*resultado=rechazo:pausa-local",  # no existe
            ],
            "no_debe": [],
        }
        res = evaluar_patrones(self.lineas_mac, criterios)
        self.assertFalse(res["ok"])
        self.assertEqual(res["debe_cumplidos"], 1)
        self.assertEqual(len(res["debe_faltantes"]), 1)
        self.assertIn("pausa-local", res["debe_faltantes"][0])

    def test_no_debe_presente_falla(self):
        from scripts.puente.pruebas_malla import evaluar_patrones
        lineas_con_error = self.lineas_mac + [
            "2026-11-18T10:00:03.000Z web · control-sesion · orden gesto de=00112233 resultado=rechazo:sin-indicador-nativo"
        ]
        criterios = {
            "debe": [r"control-sesion.*inicio de="],
            "no_debe": [r"sin-indicador-nativo"],
        }
        res = evaluar_patrones(lineas_con_error, criterios)
        self.assertFalse(res["ok"])
        self.assertEqual(res["no_debe_cumplidos"], 0)
        self.assertEqual(len(res["no_debe_violados"]), 1)

    def test_debe_en_json_tableta(self):
        from scripts.puente.pruebas_malla import evaluar_patrones
        criterios = {
            "debe": [
                r'"ev":"sesion-abierta".*"detalle":"de=.*nivel=controlar alcance=total"',
                r'"ev":"orden".*"detalle":"leer-estado de=.*resultado=autorizada"',
            ],
            "no_debe": [r'"ev":"sesion-rechazada"'],
        }
        res = evaluar_patrones(self.lineas_tableta, criterios)
        self.assertTrue(res["ok"])
        self.assertEqual(res["debe_cumplidos"], 2)

    def test_patron_case_insensitive(self):
        from scripts.puente.pruebas_malla import evaluar_patrones
        criterios = {
            "debe": [r"CONTROL-SESION.*INICIO"],
            "no_debe": [],
        }
        res = evaluar_patrones(self.lineas_mac, criterios)
        self.assertTrue(res["ok"])


class InformeTests(unittest.TestCase):
    """Formato de tabla de informe para el Chat Director."""

    def test_informe_ronda_tabla_markdown(self):
        from scripts.puente.pruebas_malla import formatear_informe
        resultados = [
            {"id": "B1-MT-A1", "titulo": "Apertura sesión", "resultado": "ok", "aparatos": ["mac", "tableta"]},
            {"id": "B2-MT-A1", "titulo": "Pausa local", "resultado": "parcial", "aparatos": ["mac", "tableta"]},
            {"id": "B3-MT-A1", "titulo": "Caducidad", "resultado": "fallo", "aparatos": ["mac", "tableta"]},
        ]
        md = formatear_informe(resultados, ronda=1)
        self.assertIn("| ID | Título | Resultado | Aparatos |", md)
        self.assertIn("| B1-MT-A1 | Apertura sesión | ✅ ok | mac, tableta |", md)
        self.assertIn("| B2-MT-A1 | Pausa local | ⚠️ parcial | mac, tableta |", md)
        self.assertIn("| B3-MT-A1 | Caducidad | ❌ fallo | mac, tableta |", md)
        self.assertIn("Ronda 1", md)

    def test_informe_vacio(self):
        from scripts.puente.pruebas_malla import formatear_informe
        md = formatear_informe([], ronda=2)
        self.assertIn("Ronda 2", md)
        self.assertIn("Sin pruebas", md)

    def test_informe_con_notas(self):
        from scripts.puente.pruebas_malla import formatear_informe
        resultados = [
            {"id": "B1-MT-A1", "titulo": "Test", "resultado": "parcial", "aparatos": ["mac"], "nota": "Falta línea de fin en tableta"},
        ]
        md = formatear_informe(resultados, ronda=1)
        self.assertIn("Falta línea de fin en tableta", md)


class CargaBateriaTests(unittest.TestCase):
    """Carga y filtrado de la batería JSON."""

    def setUp(self):
        self.bateria = {
            "bateria": "1118",
            "pruebas": [
                {"id": "B1-MT-A1", "titulo": "Test 1", "bloque": "B1", "ronda": 1, "aparatos": ["mac"], "antena": "ble"},
                {"id": "B2-MT-A1", "titulo": "Test 2", "bloque": "B2", "ronda": 1, "aparatos": ["mac"], "antena": "ble"},
                {"id": "B1-MT-A2", "titulo": "Test 3", "bloque": "B1", "ronda": 2, "aparatos": ["tableta"], "antena": "wifi"},
            ],
        }

    def test_listar_todas(self):
        from scripts.puente.pruebas_malla import filtrar_bateria
        res = filtrar_bateria(self.bateria)
        self.assertEqual(len(res), 3)

    def test_listar_por_bloque(self):
        from scripts.puente.pruebas_malla import filtrar_bateria
        res = filtrar_bateria(self.bateria, bloque="B1")
        self.assertEqual(len(res), 2)
        for p in res:
            self.assertTrue(p["id"].startswith("B1-"))

    def test_listar_por_ronda(self):
        from scripts.puente.pruebas_malla import filtrar_bateria
        res = filtrar_bateria(self.bateria, ronda=1)
        self.assertEqual(len(res), 2)
        for p in res:
            self.assertEqual(p.get("ronda"), 1)

    def test_listar_por_bloque_y_ronda(self):
        from scripts.puente.pruebas_malla import filtrar_bateria
        res = filtrar_bateria(self.bateria, bloque="B1", ronda=1)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["id"], "B1-MT-A1")


class RegistroJsonlTests(unittest.TestCase):
    """Formato de línea para pruebas/registro.jsonl."""

    def test_linea_inicio(self):
        from scripts.puente.pruebas_malla import linea_registro_inicio
        linea = linea_registro_inicio("B1-MT-A1", "2026-11-18T10:00:00Z")
        self.assertTrue(linea.startswith('{"tipo":"inicio"'))
        self.assertIn('"id":"B1-MT-A1"', linea)
        self.assertIn('"inicio":"2026-11-18T10:00:00Z"', linea)

    def test_linea_fin(self):
        from scripts.puente.pruebas_malla import linea_registro_fin
        linea = linea_registro_fin("B1-MT-A1", "ok", "Todo bien")
        self.assertTrue(linea.startswith('{"tipo":"fin"'))
        self.assertIn('"id":"B1-MT-A1"', linea)
        self.assertIn('"resultado":"ok"', linea)
        self.assertIn('"nota":"Todo bien"', linea)


if __name__ == "__main__":
    unittest.main(verbosity=2)