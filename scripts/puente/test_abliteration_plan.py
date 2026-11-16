#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para los límites del plan gratuito de abliteration.ai y la fábrica (MQA8)."""

import unittest
from scripts.puente.abliteration_creditos import (
    PLAN_RPM,
    PLAN_TPM,
    PLAN_PETICIONES_DIA,
    PLAN_A_LA_VEZ,
    FABRICA_RPM,
    FABRICA_PETICIONES_DIA,
    FABRICA_A_LA_VEZ,
    cabe_peticion,
    solo_texto,
)


class TestAbliterationPlan(unittest.TestCase):
    """Pruebas unitarias para constantes, cabe_peticion y solo_texto."""

    def test_constantes(self):
        """Verificar valores de las constantes del plan y la fábrica."""
        self.assertEqual(PLAN_RPM, 60)
        self.assertEqual(PLAN_TPM, 1_000_000)
        self.assertEqual(PLAN_PETICIONES_DIA, 10_000)
        self.assertEqual(PLAN_A_LA_VEZ, 4)
        self.assertEqual(FABRICA_RPM, 30)
        self.assertEqual(FABRICA_PETICIONES_DIA, 5_000)
        self.assertEqual(FABRICA_A_LA_VEZ, 2)

    def test_cabe_peticion_debajo_y_limite(self):
        """Probar peticiones justo por debajo y justo en cada límite."""
        ok, motivo = cabe_peticion(4999, 29, 1)
        self.assertTrue(ok)
        self.assertEqual(motivo, "ok")

        ok_dia, _ = cabe_peticion(5000, 29, 1)
        self.assertFalse(ok_dia)

        ok_rpm, _ = cabe_peticion(4999, 30, 1)
        self.assertFalse(ok_rpm)

        ok_curso, _ = cabe_peticion(4999, 29, 2)
        self.assertFalse(ok_curso)

    def test_cabe_peticion_none(self):
        """Probar respuesta cuando algún dato es None."""
        ok1, mot1 = cabe_peticion(None, 10, 1)
        self.assertFalse(ok1)
        self.assertIn("None", mot1)

        ok2, mot2 = cabe_peticion(100, None, 1)
        self.assertFalse(ok2)
        self.assertIn("None", mot2)

        ok3, mot3 = cabe_peticion(100, 10, None)
        self.assertFalse(ok3)
        self.assertIn("None", mot3)

    def test_solo_texto(self):
        """Probar filtrado solo_texto con texto, data: e imágenes por URL remota."""
        msg_texto = [{"role": "user", "content": "Consulta solo texto"}]
        self.assertTrue(solo_texto(msg_texto))

        msg_data = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Imagen local data"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgo..."}},
                ],
            }
        ]
        self.assertTrue(solo_texto(msg_data))

        msg_http = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": "http://ejemplo.com/foto.png"}},
                ],
            }
        ]
        self.assertFalse(solo_texto(msg_http))

        msg_https = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": "https://ejemplo.com/foto.jpg"}},
                ],
            }
        ]
        self.assertFalse(solo_texto(msg_https))



if __name__ == "__main__":
    unittest.main()
