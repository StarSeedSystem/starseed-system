# -*- coding: utf-8 -*-
"""Casos de decidir_relanzamiento: el vigilante obedece al config del Director."""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from config_director import DEFAULTS
from vigilante_logica import decidir_relanzamiento


class DecidirRelanzamientoTest(unittest.TestCase):
    def test_relanza_cuando_hay_trabajo_sin_orquestador(self):
        self.assertEqual(decidir_relanzamiento(DEFAULTS, False, 5), (True, 5, 20))

    def test_no_relanza_si_el_orquestador_ya_vive(self):
        self.assertEqual(decidir_relanzamiento(DEFAULTS, True, 5), (False, 5, 20))

    def test_no_relanza_sin_pendientes(self):
        self.assertEqual(decidir_relanzamiento(DEFAULTS, False, 0), (False, 5, 20))

    def test_pausado_gana_aunque_haya_trabajo(self):
        cfg = dict(DEFAULTS)
        cfg["pausado"] = True
        self.assertEqual(decidir_relanzamiento(cfg, False, 5), (False, 5, 20))


if __name__ == "__main__":
    unittest.main()
