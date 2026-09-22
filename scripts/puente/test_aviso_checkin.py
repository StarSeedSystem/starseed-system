#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para el módulo aviso_checkin."""

import unittest
from aviso_checkin import necesita_checkin, mensaje


class TestAvisoCheckin(unittest.TestCase):
    def test_necesita_checkin_por_motivo(self):
        """Detecta check-in por el motivo en el estado de salud."""
        salud = {
            "apinex": {
                "motivo": "Daily check-in required to use free models. Please visit https://apinex.bond/airdrop?tab=quests to check in.",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            },
            "nim": {
                "motivo": "",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            }
        }
        registros = []  # No se usan en este caso
        resultado = necesita_checkin(salud, registros)
        self.assertEqual(len(resultado), 1)
        self.assertEqual(resultado[0][0], "apinex")
        self.assertIn("apinex.bond", resultado[0][1])

    def test_necesita_checkin_por_registro(self):
        """Detecta check-in por un registro reciente."""
        salud = {
            "apinex": {
                "motivo": "",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            },
            "xkiro": {
                "motivo": "",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            }
        }
        registros = [
            "2026-09-22 11:00:00 [proveedor=apinex] daily check-in required",
            "2026-09-22 11:05:00 [proveedor=xkiro] algo normal"
        ]
        resultado = necesita_checkin(salud, registros)
        self.assertEqual(len(resultado), 1)
        self.assertEqual(resultado[0][0], "apinex")
        self.assertIn("apinex.bond", resultado[0][1])

    def test_necesita_checkin_multiple_proveedores(self):
        """Detecta check-in en múltiples proveedores."""
        salud = {
            "apinex": {
                "motivo": "check-in required",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            },
            "xkiro": {
                "motivo": "Daily check-in required",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            },
            "nim": {
                "motivo": "",
                "estado": "vivo",
                "desde": "2026-09-22 10:00:00"
            }
        }
        registros = []
        resultado = necesita_checkin(salud, registros)
        self.assertEqual(len(resultado), 2)
        proveedores = {item[0] for item in resultado}
        self.assertIn("apinex", proveedores)
        self.assertIn("xkiro", proveedores)
        # Verificamos los enlaces
        enlaces = {item[0]: item[1] for item in resultado}
        self.assertIn("apinex.bond", enlaces["apinex"])
        self.assertIn("api.xkiro.com", enlaces["xkiro"])

    def test_mensaje_formato_correcto(self):
        """Verifica que el mensaje tenga el formato esperado."""
        proveedor = "apinex"
        enlace = "https://apinex.bond/airdrop?tab=quests"
        msg = mensaje(proveedor, enlace)
        esperado = (
            "AVISO A ALEX · apinex pide check-in diario: https://apinex.bond/airdrop?tab=quests "
            "· queda apartado hasta que vuelva a responder; cuando lo hagas, escribe /checkin apinex al bot o starseed-puente decir «checkin apinex»"
        )
        self.assertEqual(msg, esperado)


if __name__ == '__main__':
    unittest.main()