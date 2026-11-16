#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de abliteration.ai en la flota (MOD1116).

Verifica que el proveedor 'abliteration' solo entra en la rotación cuando:
- STARSEED_ABLITERATION=1
- abliteration_creditos.permitido() devuelve ok con el estado de ~/.starseed/abliteration-uso.json

Sin la variable no entra; con la variable y saldo bajo el margen no entra;
con tope del día alcanzado no entra; con todo bien entra.
STARSEED_PAGO=1 no cambia el comportamiento de los demás proveedores de pago.
"""
import importlib.util
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class AbliterationFlota(unittest.TestCase):
    """Pruebas de integración de abliteration en la rotación de escritores."""

    def setUp(self):
        # Guardar estado original
        self._proveedores_pago_original = enjambre.PROVEEDORES_DE_PAGO
        self._env_abliteration = os.environ.get("STARSEED_ABLITERATION")
        self._env_pago = os.environ.get("STARSEED_PAGO")
        # Asegurar que abliteration está en PROVEEDORES_DE_PAGO para las pruebas
        if "abliteration" not in enjambre.PROVEEDORES_DE_PAGO:
            enjambre.PROVEEDORES_DE_PAGO = enjambre.PROVEEDORES_DE_PAGO + ("abliteration",)

    def tearDown(self):
        enjambre.PROVEEDORES_DE_PAGO = self._proveedores_pago_original
        if self._env_abliteration is None:
            os.environ.pop("STARSEED_ABLITERATION", None)
        else:
            os.environ["STARSEED_ABLITERATION"] = self._env_abliteration
        if self._env_pago is None:
            os.environ.pop("STARSEED_PAGO", None)
        else:
            os.environ["STARSEED_PAGO"] = self._env_pago

    def test_sin_variable_no_entra(self):
        """Sin STARSEED_ABLITERATION=1, el modelo de abliteration se filtra."""
        os.environ.pop("STARSEED_ABLITERATION", None)
        modelos = ["abliteration/abliterated-model", "nvidia/nemotron-3-ultra-550b-a55b"]
        filtrados = enjambre.sin_pago(modelos)
        self.assertNotIn("abliteration/abliterated-model", filtrados)
        self.assertIn("nvidia/nemotron-3-ultra-550b-a55b", filtrados)

    def test_con_variable_permitido_ok_entra(self):
        """Con variable y abliteration_creditos.permitido=True, el modelo entra."""
        os.environ["STARSEED_ABLITERATION"] = "1"
        modelos = ["abliteration/abliterated-model", "nvidia/nemotron-3-ultra-550b-a55b"]
        with mock.patch("scripts.puente.abliteration_creditos.permitido", return_value=(True, "ok")):
            filtrados = enjambre.sin_pago(modelos)
        self.assertIn("abliteration/abliterated-model", filtrados)
        self.assertIn("nvidia/nemotron-3-ultra-550b-a55b", filtrados)

    def test_con_variable_saldo_bajo_margen_no_entra(self):
        """Con variable pero saldo bajo el margen, el modelo no entra."""
        os.environ["STARSEED_ABLITERATION"] = "1"
        modelos = ["abliteration/abliterated-model"]
        with mock.patch("scripts.puente.abliteration_creditos.permitido", return_value=(False, "saldo bajo el margen")):
            filtrados = enjambre.sin_pago(modelos)
        self.assertNotIn("abliteration/abliterated-model", filtrados)

    def test_con_variable_tope_dia_alcanzado_no_entra(self):
        """Con variable pero tope del día alcanzado, el modelo no entra."""
        os.environ["STARSEED_ABLITERATION"] = "1"
        modelos = ["abliteration/abliterated-model"]
        with mock.patch("scripts.puente.abliteration_creditos.permitido", return_value=(False, "tope del día alcanzado")):
            filtrados = enjambre.sin_pago(modelos)
        self.assertNotIn("abliteration/abliterated-model", filtrados)

    def test_con_variable_lectura_vieja_no_entra(self):
        """Con variable pero lectura vieja, el modelo no entra."""
        os.environ["STARSEED_ABLITERATION"] = "1"
        modelos = ["abliteration/abliterated-model"]
        with mock.patch("scripts.puente.abliteration_creditos.permitido", return_value=(False, "lectura vieja (más de 6 h)")):
            filtrados = enjambre.sin_pago(modelos)
        self.assertNotIn("abliteration/abliterated-model", filtrados)

    def test_import_falla_no_entra(self):
        """Si no se puede importar abliteration_creditos, el modelo no entra."""
        os.environ["STARSEED_ABLITERATION"] = "1"
        modelos = ["abliteration/abliterated-model"]
        with mock.patch.dict(sys.modules, {"scripts.puente.abliteration_creditos": None}):
            filtrados = enjambre.sin_pago(modelos)
        self.assertNotIn("abliteration/abliterated-model", filtrados)

    def test_starseed_pago_1_no_cambia_otros_proveedores(self):
        """STARSEED_PAGO=1 deja entrar a todos los proveedores de pago, pero abliteration sigue su propia regla."""
        os.environ["STARSEED_PAGO"] = "1"
        os.environ.pop("STARSEED_ABLITERATION", None)
        modelos = ["abliteration/abliterated-model", "xai/grok-4.6", "anthropic/claude-3-opus"]
        filtrados = enjambre.sin_pago(modelos)
        # Con STARSEED_PAGO=1, xai y anthropic entran
        self.assertIn("xai/grok-4.6", filtrados)
        self.assertIn("anthropic/claude-3-opus", filtrados)
        # Pero abliteration NO entra sin su variable
        self.assertNotIn("abliteration/abliterated-model", filtrados)

    def test_starseed_pago_1_y_abliteration_ok_entra(self):
        """STARSEED_PAGO=1 y STARSEED_ABLITERATION=1 con permitido ok: todos entran."""
        os.environ["STARSEED_PAGO"] = "1"
        os.environ["STARSEED_ABLITERATION"] = "1"
        modelos = ["abliteration/abliterated-model", "xai/grok-4.6"]
        with mock.patch("scripts.puente.abliteration_creditos.permitido", return_value=(True, "ok")):
            filtrados = enjambre.sin_pago(modelos)
        self.assertIn("abliteration/abliterated-model", filtrados)
        self.assertIn("xai/grok-4.6", filtrados)


if __name__ == "__main__":
    unittest.main()