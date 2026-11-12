#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(PRB1111W) La entrada «pruebas» de instalar-servicios.py: el director de pruebas bajo launchd, sin tocar nada real."""
import os
import plistlib
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_instalar_servicios_produccion import _cargar_con_solo  # noqa: E402


class TestEntradaPruebas(unittest.TestCase):
    def test_solo_pruebas_genera_su_plist(self):
        with tempfile.TemporaryDirectory() as tmp:
            mod = _cargar_con_solo(tmp, "pruebas")
            ag = os.path.join(tmp, "Library", "LaunchAgents")
            self.assertEqual(os.listdir(ag), ["com.starseed.pruebas.plist"])
            with open(os.path.join(ag, "com.starseed.pruebas.plist"), "rb") as f:
                p = plistlib.load(f)
            args = p["ProgramArguments"]
            self.assertTrue(args[1].endswith("scripts/puente/director_pruebas.py"))
            self.assertEqual(args[2], "--bucle")
            self.assertTrue(p["KeepAlive"] is True or isinstance(p["KeepAlive"], dict))


if __name__ == "__main__":
    unittest.main()
