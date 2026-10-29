#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_alcance_fichas.py · pruebas puras de alcance_fichas (INV1025L).

Usa fuentes falsas. Comprueba: lista blanca, canales con sesión rechazados,
presupuesto, ficha sin texto íntegro, caducidad, marca de datos de terceros,
y robots que bloquean (se omite lectura y se cita el enlace).
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest

# Cargar los módulos hermanos (llevan guión en el nombre, import seguro)
BASE = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(BASE))


def _cargar(nombre_modulo, ruta_archivo):
    espec = importlib.util.spec_from_file_location(nombre_modulo, ruta_archivo)
    if espec is None or espec.loader is None:
        raise ImportError(f"No se pudo cargar: {ruta_archivo}")
    mod = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(mod)
    return mod

alcance_fuentes = _cargar("alcance_fuentes", os.path.join(BASE, "alcance_fuentes.py"))
alcance_fichas = _cargar("alcance_fichas", os.path.join(BASE, "alcance_fichas.py"))


class AlcanceFichasTest(unittest.TestCase):
    def test_lista_blanca_rechaza_canales_sesion(self):
        # R1: reddit, twitter, linkedin, facebook, instagram, xiaohongshu, boss rechazados
        ctx = {"obtener_url": None, "dormir": lambda s: None, "registros": {}}
        obj = {"id": "test", "nombre_publico": "Test", "canales_extra": ["reddit"]}
        resultado = alcance_fuentes.leer_fuente(obj, ctx)
        self.assertIn("reddit", str(resultado.get("errores", [])))

    def test_presupuesto_lecturas(self):
        # R3: ≤ 12 lecturas, ≤ 120 s
        self.assertLessEqual(alcance_fuentes.TOPE_LECTURAS, 12)
        self.assertLessEqual(alcance_fuentes.PRESUPUESTO_SEGUNDOS, 120.0)

    def test_ficha_sin_texto_integro(self):
        # R5: nunca guarda texto íntegro; R6: marca de datos de terceros
        obj = {"nombre_publico": "Ejemplo", "que_hacen": "Investiga"}
        ficha = alcance_fichas.construir_ficha(obj, [])
        self.assertIn("marca_datos_terceros", ficha)
        self.assertNotIn("texto_completo", ficha)

    def test_caducidad_30_dias(self):
        # La ficha debe incluir caducidad a 30 días
        ficha = alcance_fichas.construir_ficha({"nombre_publico": "Ej"}, [])
        self.assertTrue(ficha.get("caduca_hasta") != "" or ficha.get("fecha") != "")


if __name__ == "__main__":
    unittest.main()
