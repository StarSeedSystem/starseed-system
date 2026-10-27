#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigia_modelos sin red (inyección).

Comprueba escritura atómica de novedades y estado, con http_get simulado.
"""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from scripts.puente.vigia_modelos import procesar_areas, _cargar_estado, _guardar_estado, _escribir_novedades, _novedades_path

def test_novedades_atomicas():
    with tempfile.TemporaryDirectory() as td:
        ruta = os.path.join(td, "novedades.json")
        datos = {"area": {"aceptados": [], "descartados": []}}
        _escribir_novedades(ruta, datos)
        with open(ruta, "r", encoding="utf-8") as f:
            cargado = json.load(f)
        assert cargado == datos

def test_estado_persistente():
    with tempfile.TemporaryDirectory() as td:
        estado_path = os.path.join(td, "estado.json")
        # sobrescribe la ruta temporalmente
        import scripts.puente.vigia_modelos as vm
        orig = vm.ESTADO
        vm.ESTADO = estado_path
        try:
            _guardar_estado({"ultima_pasada": "2026-10-16"})
            est = _cargar_estado()
            assert est["ultima_pasada"] == "2026-10-16"
        finally:
            vm.ESTADO = orig

def test_procesar_sin_red():
    area = {"id": "imagen", "pipeline_tags": ["text-to-image"], "autores": []}
    def http_get(url, headers=None, timeout=30):
        return "[]"
    ahora = datetime(2026,10,16, tzinfo=timezone.utc)
    res = procesar_areas([area], http_get, ahora, seco=True)
    assert "imagen" in res
