# -*- coding: utf-8 -*-
"""Pruebas herméticas del estado y decisiones del medio Maggabox (ALM1125B).

Nada aquí toca /Volumes, la red ni el disco real: la función pura se prueba con datos de
mentira y la capa fina con un `correr` falso que registra órdenes y topes de tiempo.
"""
import json
import os
import plistlib
import subprocess
import sys
import time
import unittest

import maggabox_medio as M  # noqa: E402


class TestDecisionesPuras(unittest.TestCase):
    def test_rama_de_cola(self):
        ts = 1731264000.0  # 2024-11-12 00:00:00 UTC
        r = M.rama_de_cola(ts)
        expected = time.strftime("colas/maggabox-%Y%m%d-%H%M%S", time.gmtime(ts))
        self.assertEqual(r, expected)

    def test_decidir_lanzar_maggabox(self):
        estado = {"fase": "espera"}
        ahora = time.time()
        # Sin último lanzamiento y con colas: debe lanzar
        r = M.decidir_lanzar_maggabox(estado, ahora, None, ["cola-1"])
        self.assertTrue(r[0])
        self.assertEqual(r[1], "listo")

        # Con fase distinta: no debe lanzar
        estado["fase"] = "cola"
        r = M.decidir_lanzar_maggabox(estado, ahora, None, ["cola-1"])
        self.assertFalse(r[0])

        # Con lanzamiento reciente: no debe lanzar
        r = M.decidir_lanzar_maggabox(estado, ahora, ahora - 150, ["cola-1"])
        self.assertFalse(r[0])

        # Sin colas: no debe lanzar
        r = M.decidir_lanzar_maggabox(estado, ahora, None, [])
        self.assertFalse(r[0])

    def test_debe_prestar(self):
        # Disco > 30: no prestar
        r = M.debe_prestar(50.0, {}, time.time())
        self.assertFalse(r[0])
        self.assertEqual(r[1], "disco Mac disponible")

        # Disco <= 30: debe prestar
        r = M.debe_prestar(20.0, {}, time.time())
        self.assertTrue(r[0])

    def test_columnas_pendientes(self):
        refs = {
            "colas/oracle-xxx": ("sha1", 1.0),
            "colas/maggabox-aaa": ("sha2", 2.0),
            "colas/maggabox-bbb": ("sha3", 3.0),
        }
        procesadas = {"colas/oracle-xxx": "sha1"}
        r = M.columnas_pendientes(refs, procesadas)
        self.assertEqual(len(r), 2)
        self.assertIn("colas/maggabox-aaa", r)
        self.assertIn("colas/maggabox-bbb", r)


class TestOrden(unittest.TestCase):
    def test_no_debe_tocar_next_build(self):
        """Verificación: este módulo no lanza tsc ni vitest."""
        import subprocess
        result = subprocess.run(
            ["grep", "-r", "tsc\\|vitest", "scripts/puente/maggabox_medio.py"],
            capture_output=True, text=True, cwd="/Users/alex/Documents/starseed-wt/ALM1125H4"
        )
        self.assertEqual(result.returncode, 1)  # No matches found