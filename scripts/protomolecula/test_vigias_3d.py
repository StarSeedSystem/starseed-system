#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigias_3d.py con respuestas SIMULADAS (sin red real)."""
from __future__ import annotations
import unittest, sys, json
sys.path.insert(0, "scripts/protomolecula")
import vigias_3d as V

class MockGet:
    def __init__(self, mapa):
        self.mapa = mapa  # url -> (status, cabeceras, cuerpo)
    def __call__(self, url, cabeceras=None, plazo=20):
        return self.mapa.get(url, (0, {}, ""))

class Vigias3DTest(unittest.TestCase):
    def test_estructura_salida(self):
        self.assertTrue(hasattr(V, "main"))
        self.assertTrue(hasattr(V, "cargar"))

if __name__ == "__main__":
    unittest.main()
