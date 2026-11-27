# -*- coding: utf-8 -*-
"""Pruebas de urgencia_tarea (DIR1127C: lo urgente no se guarda para una Mac que no puede empezar)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import urgencia_tarea as U  # noqa: E402
class TestMacNoPuedeEmpezarDir1127C(unittest.TestCase):
    """DIR1127C: con la Mac sin poder empezar (disco o gobernador), lo urgente no se guarda para ella."""

    def setUp(self):
        self._antes = U.MAC_LIBRE
        # repartir-a-nube.py deja este global según el disco real; otras pruebas lo cargan antes.
        U.MAC_LIBRE = True

    def tearDown(self):
        U.MAC_LIBRE = self._antes

    def test_mac_puede_empezar(self):
        self.assertTrue(U.mac_puede_empezar(None, None))
        self.assertTrue(U.mac_puede_empezar({"retiene_arranques": False}, {"trabajadores": 2}))
        self.assertFalse(U.mac_puede_empezar({"retiene_arranques": True}, {"trabajadores": 2}))
        self.assertFalse(U.mac_puede_empezar({}, {"trabajadores": 0}))
        self.assertTrue(U.mac_puede_empezar({}, {"trabajadores": "x"}))

    def test_no_retiene_si_la_mac_no_puede(self):
        tarea = {"id": "X1", "prioridad": 99}
        self.assertTrue(U.retiene_la_mac(tarea, {"estado": "pendiente"}))
        self.assertFalse(U.retiene_la_mac(tarea, {"estado": "pendiente"}, mac_libre=False))
        U.MAC_LIBRE = False
        self.assertFalse(U.retiene_la_mac(tarea, {"estado": "pendiente"}))


if __name__ == "__main__":
    unittest.main()
