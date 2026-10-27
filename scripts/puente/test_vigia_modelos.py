#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de modelos (VGM1016D): sin red, todo inyectado."""

import json
import unittest
from datetime import datetime, timezone
from vigia_modelos import pasar_vigia, _resumen

AHORA = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)

class SimuladorHTTP:
    def __init__(self):
        self.llamadas = []
    def get(self, url, headers=None, timeout=30):
        self.llamadas.append(url)
        return "[]"

def test_pasar_vigia_estructura():
    areas = [{
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
        "licencias_conocidas": {"qwen-research": "personal", "apache-2.0": "libre"}
    }]
    catalogo = {"imagen": []}
    sim = SimuladorHTTP()
    novedades = pasar_vigia(areas, catalogo, sim.get, AHORA)
    assert isinstance(novedades, dict)
    assert "imagen" in novedades
    assert "aceptados" in novedades["imagen"]
    assert "descartados" in novedades["imagen"]
    print("✓ test_pasar_vigia_estructura")

def test_resumen():
    novedades = {"imagen": {"aceptados": [1, 2], "descartados": []}}
    txt = _resumen(novedades)
    assert "2 candidatos aceptados" in txt
    print("✓ test_resumen")

def test_area_filtro():
    areas = [
        {"id": "imagen", "pipeline_tags": [], "autores": [], "licencias_conocidas": {}},
        {"id": "voz", "pipeline_tags": [], "autores": [], "licencias_conocidas": {}}
    ]
    catalogo = {}
    sim = SimuladorHTTP()
    nov = pasar_vigia(areas, catalogo, sim.get, AHORA, area_filtro="voz")
    assert list(nov.keys()) == ["voz"]
    print("✓ test_area_filtro")

if __name__ == "__main__":
    test_pasar_vigia_estructura()
    test_resumen()
    test_area_filtro()
    print("\nAll tests passed")
