#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del motor Blender Voxel (WT1011B) — SIN red ni GPU: se simula Blender.

Ejecutar: python3 -m unittest motores.test_blender_voxel -v
"""
import unittest
from unittest import mock

import blender_voxel as bv


class DisponibleTest(unittest.TestCase):
    def test_disponible_true(self):
        """Test when Blender is available."""
        with mock.patch('subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "Blender 4.2.0\n"
            self.assertTrue(bv.disponible())

    def test_disponible_false(self):
        """Test when Blender is not available."""
        with mock.patch('subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            self.assertFalse(bv.disponible())


if __name__ == "__main__":
    unittest.main()
