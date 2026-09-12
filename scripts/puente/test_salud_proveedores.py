#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puertas de salud_proveedores: cada tipo de renovación y el catálogo vacío."""

import os, sys, unittest

sys.path.insert(0, os.path.dirname(__file__))
from salud_proveedores import estado_proveedores, proximo_en_renovar, resumen

CATALOGO = ["groq", "llm7", "nvidia-nim", "xkiro"]


class EstadoProveedores(unittest.TestCase):
    def test_proveedor_no_agotado_sin_alternativa(self):
        estados = estado_proveedores({}, 1000.0, CATALOGO)
        self.assertEqual(len(estados), 4)
        self.assertFalse(estados[0]["agotado"])
        self.assertIsNone(estados[0]["renueva_en_min"])
        self.assertIsNone(estados[0]["motivo"])
        self.assertIsNone(estados[0]["alternativa"])

    def test_429_horario_renueva_a_los_300_min(self):
        # marcado a las 0, ahora a las 258 min → faltan 42
        desde = 0.0
        ahora = (300 - 42) * 60.0
        agotados = {"groq": {"desde": desde, "motivo": "429"}}
        estados = estado_proveedores(agotados, ahora, CATALOGO)
        groq = next(e for e in estados if e["proveedor"] == "groq")
        self.assertTrue(groq["agotado"])
        self.assertEqual(groq["renueva_en_min"], 42)

    def test_402_diario_hasta_medianoche_utc_siguiente(self):
        # marcado el 2026-09-12T12:00Z → renueva el 2026-09-13T00:00Z (12 h = 720 min)
        desde = 1768219200.0  # 2026-09-12 12:00:00 UTC
        ahora = desde
        agotados = {"llm7": {"desde": desde, "motivo": "402"}}
        estados = estado_proveedores(agotados, ahora, CATALOGO)
        llm7 = next(e for e in estados if e["proveedor"] == "llm7")
        self.assertTrue(llm7["agotado"])
        self.assertEqual(llm7["renueva_en_min"], 720)

    def test_cuota_diaria_igual_que_402(self):
        desde = 1768219200.0
        agotados = {"llm7": {"desde": desde, "motivo": "cuota"}}
        estados = estado_proveedores(agotados, desde, CATALOGO)
        llm7 = next(e for e in estados if e["proveedor"] == "llm7")
        self.assertEqual(llm7["renueva_en_min"], 720)
        self.assertEqual(llm7["motivo"], "cuota")

    def test_alternativa_primer_catalogo_no_agotado(self):
        agotados = {
            "groq": {"desde": 0.0, "motivo": "429"},
            "llm7": {"desde": 0.0, "motivo": "402"},
        }
        estados = estado_proveedores(agotados, 0.0, CATALOGO)
        groq = next(e for e in estados if e["proveedor"] == "groq")
        self.assertEqual(groq["alternativa"], "nvidia-nim")

    def test_sin_alternativa_cuando_todo_agotado(self):
        agotados = {n: {"desde": 0.0, "motivo": "402"} for n in CATALOGO}
        estados = estado_proveedores(agotados, 0.0, CATALOGO)
        groq = next(e for e in estados if e["proveedor"] == "groq")
        self.assertIsNone(groq["alternativa"])


class CatalogoVacio(unittest.TestCase):
    def test_catalogo_vacio_y_sin_agotados_devuelve_lista_vacia(self):
        self.assertEqual(estado_proveedores({}, 0.0, []), [])

    def test_agotados_fuera_del_catalogo_igual_aparecen(self):
        estados = estado_proveedores({"oras": {"desde": 0.0, "motivo": "429"}}, 0.0, [])
        self.assertEqual(len(estados), 1)
        self.assertEqual(estados[0]["proveedor"], "oras")
        self.assertIsNone(estados[0]["alternativa"])


class ProximoSiguiente(unittest.TestCase):
    @staticmethod
    def _estado(proveedor, agotado, renueva, motivo=None):
        return {
            "proveedor": proveedor,
            "agotado": agotado,
            "renueva_en_min": renueva,
            "motivo": motivo,
            "alternativa": None,
        }

    def test_devuelve_el_que_antes_renueva(self):
        estados = [
            self._estado("a", True, 42, "429"),
            self._estado("b", True, 720, "402"),
            self._estado("c", False, None),
        ]
        self.assertEqual(proximo_en_renovar(estados), ("a", 42))

    def test_none_sin_agotados(self):
        self.assertIsNone(proximo_en_renovar([self._estado("c", False, None)]))


class Resumen(unittest.TestCase):
    def test_una_linea_con_vivos_agotados_y_enrutamiento(self):
        agotados = {
            "groq": {"desde": 0.0, "motivo": "429"},
            "llm7": {"desde": 0.0, "motivo": "cuota"},
        }
        estados = estado_proveedores(agotados, (300 - 42) * 60.0, CATALOGO)
        linea = resumen(estados)
        self.assertIn("2/4 vivos", linea)
        self.assertIn("groq (renueva en 42 min)", linea)
        self.assertIn("llm7 (cuota diaria)", linea)
        self.assertIn("enrutando a nvidia-nim", linea)

    def test_todo_vivo_sin_agotados(self):
        estados = estado_proveedores({}, 0.0, CATALOGO)
        self.assertEqual(resumen(estados), "PROVEEDORES · 4/4 vivos")


if __name__ == "__main__":
    unittest.main()
