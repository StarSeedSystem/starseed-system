# -*- coding: utf-8 -*-
"""Pruebas unitarias para cloudroom_config.py (TDD, Ola CAP1119).
"""
from __future__ import annotations

import os
import tempfile
import unittest

import cloudroom_config as CC


class TestCloudroomConfig(unittest.TestCase):
    def test_cargar_config_por_defecto(self):
        cfg = CC.cargar_configuracion()
        self.assertIsInstance(cfg, dict)
        self.assertIn("activo", cfg)
        self.assertIn("tope_dia", cfg)

    def test_guardar_y_cargar_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "config.json")
            CC.guardar_configuracion({"activo": True, "tope_dia": 10}, path=path)
            cargado = CC.cargar_configuracion(path=path)
            self.assertTrue(cargado.get("activo"))
            self.assertEqual(cargado.get("tope_dia"), 10)

    def test_activar_cloudroom(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "config.json")
            res = CC.activar_cloudroom(True, path=path)
            self.assertTrue(res.get("activo"))
            cargado = CC.cargar_configuracion(path=path)
            self.assertTrue(cargado.get("activo"))


if __name__ == "__main__":
    unittest.main()
