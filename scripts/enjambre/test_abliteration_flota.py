# -*- coding: utf-8 -*-
"""Pruebas para la flota de abliteration.ai en starseed-enjambre.py (MOD1116).

En estas pruebas se inyectan el entorno y el estado de créditos:
- sin la variable STARSEED_ABLITERATION no entra
- con la variable y saldo bajo el margen no entra
- con tope del día alcanzado no entra
- con todo bien entra
- STARSEED_PAGO=1 no cambia el comportamiento de los demás proveedores de pago
"""
import importlib.util
import json
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

AHORA = "2026-11-16T12:00:00Z"


class AbortionProviderTests(unittest.TestCase):
    def test_sin_variable_ablation_no_entra(self):
        """Sin STARSEED_ABLITERATION, los modelos de abliteration no entran."""
        entorno = {"STARSEED_ABLITERATION": ""}
        leer_estado = {"leido": AHORA, "saldo_ultimo": 10.0}
        with mock.patch.dict(os.environ, entorno, clear=True):
            self.assertFalse(enjambre.abliteration_permitida(
                entorno=entorno, leer_estado=leer_estado, ahora=AHORA
            ))

    def test_con_variable_y_saldo_bajo_no_entra(self):
        """Con STARSEED_ABLITERATION=1 y saldo bajo el margen, no entra."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        leer_estado = {
            "leido": AHORA,
            "saldo_ultimo": 0.25,
            "saldo_inicio_dia": 1.0,
        }
        with mock.patch.dict(os.environ, entorno, clear=True):
            self.assertFalse(enjambre.abliteration_permitida(
                entorno=entorno, leer_estado=leer_estado, ahora=AHORA
            ))

    def test_tope_dia_alcanzado_no_entra(self):
        """Con tope del día alcanzado, no entra."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        leer_estado = {
            "dia": "2026-11-16",
            "leido": AHORA,
            "saldo_inicio_dia": 100.0,
            "saldo_ultimo": 0.0,
        }
        with mock.patch.dict(os.environ, entorno, clear=True):
            result = enjambre.abliteration_permitida(
                entorno=entorno, leer_estado=leer_estado, ahora=AHORA,
                tope_dia=100.0
            )
            self.assertEqual(result, False)

    def test_con_todo_bien_entra(self):
        """Con STARSEED_ABLITERATION=1 y créditos ok, entra."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        leer_estado = {
            "leido": AHORA,
            "saldo_ultimo": 50.0,
        }
        with mock.patch.dict(os.environ, entorno, clear=True):
            self.assertTrue(enjambre.abliteration_permitida(
                entorno=entorno, leer_estado=leer_estado, ahora=AHORA
            ))

    def test_starseed_pago_1_no_cambia_otros_proveedores(self):
        """STARSEED_PAGO=1 hace entrar todos los modelos de pago."""
        entorno_pago = {"STARSEED_PAGO": "1"}
        modelos = ["xai/grok-4.6", "deepseek/deepseek-chat", "anthropic/claude-3-5"]
        with mock.patch.dict(os.environ, entorno_pago, clear=True):
            resultado = enjambre.sin_pago(modelos)
            self.assertEqual(resultado, modelos)

    def test_starseed_pago_1_con_ablation_permitido(self):
        """STARSEED_PAGO=1 incluye abliteration aunque no tenga permiso explícito."""
        entorno_pago = {"STARSEED_PAGO": "1"}
        modelos = ["abliteration/abliterated-model"]
        with mock.patch.dict(os.environ, entorno_pago, clear=True):
            resultado = enjambre.sin_pago(modelos)
            self.assertEqual(resultado, modelos)

    def test_sin_pago_falta_variable_ablation(self):
        """Modelos de abliteration sin STARSEED_ABLITERATION=1 no entran."""
        entorno = {"STARSEED_ABLITERATION": ""}
        modelos = ["abliteration/abliterated-model", "google/gemini-3.6-flash"]
        with mock.patch.dict(os.environ, entorno, clear=True):
            resultado = enjambre.sin_pago(modelos)
            self.assertEqual(resultado, ["google/gemini-3.6-flash"])

    def test_sin_pago_con_abliteration_permitido(self):
        """Modelos de abliteration entran cuando está permitido."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        modelos = ["abliteration/abliterated-model", "google/gemini-3.6-flash"]
        with mock.patch.dict(os.environ, entorno, clear=True):
            with mock.patch.object(enjambre, "abliteration_permitida", return_value=True):
                resultado = enjambre.sin_pago(modelos)
                self.assertEqual(resultado, ["abliteration/abliterated-model", "google/gemini-3.6-flash"])

    def test_sin_pago_con_saldo_bajo_no_entra_abliteration(self):
        """Modelos de abliteration con saldo bajo no entran en sin_pago."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        modelos = ["abliteration/abliterated-model", "google/gemini-3.6-flash"]
        with mock.patch.dict(os.environ, entorno, clear=True):
            with mock.patch.object(enjambre, "abliteration_permitida", return_value=False):
                resultado = enjambre.sin_pago(modelos)
                self.assertEqual(resultado, ["google/gemini-3.6-flash"])


class AbortionProviderIntegration(unittest.TestCase):
    def test_proveedor_en_claves_por_proveedor(self):
        """El proveedor abliteration tiene su clave en CLAVES_POR_PROVEEDOR."""
        self.assertIn("abliteration", enjambre.CLAVES_POR_PROVEEDOR)
        self.assertEqual(
            enjambre.CLAVES_POR_PROVEEDOR["abliteration"],
            ["ABLITERATION_API_KEY"]
        )

    def test_proveedor_en_proovedores_de_pago(self):
        """El proveedor abliteration está en PROVEEDORES_DE_PAGO."""
        self.assertIn("abliteration", enjambre.PROVEEDORES_DE_PAGO)

    def test_proveedor_de_obtiene_abliteration(self):
        """La función proveedor_de devuelve 'abliteration' para modelos de ese proveedor."""
        self.assertEqual(enjambre.proveedor_de("abliteration/abliterated-model"), "abliteration")


if __name__ == "__main__":
    unittest.main()