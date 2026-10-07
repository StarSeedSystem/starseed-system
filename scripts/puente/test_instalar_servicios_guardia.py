#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""instalar-servicios.py instala al importarse: con argumentos que no son una raíz y un python
reales (p. ej. los de `unittest discover`) no debe escribir ningún plist (2026-10-07)."""
import os
import subprocess
import sys
import tempfile
import unittest

GUION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar-servicios.py")


class GuardiaDeArgumentos(unittest.TestCase):
    def test_argumentos_de_unittest_no_instalan_nada(self):
        with tempfile.TemporaryDirectory() as casa:
            os.makedirs(os.path.join(casa, "Library", "LaunchAgents"))
            r = subprocess.run([sys.executable, GUION, "discover", "-s"], capture_output=True, text=True,
                               env=dict(os.environ, HOME=casa), timeout=60)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("no instalo nada", r.stderr)
            self.assertEqual(os.listdir(os.path.join(casa, "Library", "LaunchAgents")), [])


if __name__ == "__main__":
    unittest.main()
