#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for comprobar_en_a1.py
"""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import patch

# Add the scripts/puente directory to sys.path so we can import comprobar_en_a1 as a top-level module
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import comprobar_en_a1


class TestComprobarEnA1(unittest.TestCase):

    def test_a1_occupied(self):
        """When A1 is occupied with a cola, return del_medio=True"""
        with patch('comprobar_en_a1.oracle_nodo.estado') as mock_estado:
            mock_estado.return_value = ({'fase': 'cola'}, None, None)
            ok, detalle, del_medio = comprobar_en_a1.comprobar('base', ['sha1'], ['file.ts'])
            self.assertFalse(ok)
            self.assertEqual(detalle, "A1 ocupado con una cola")
            self.assertTrue(del_medio)

    def test_a1_not_responding(self):
        """When A1 does not respond, return del_medio=True"""
        with patch('comprobar_en_a1.oracle_nodo.estado') as mock_estado:
            mock_estado.return_value = ({}, None, None)
            ok, detalle, del_medio = comprobar_en_a1.comprobar('base', ['sha1'], ['file.ts'])
            self.assertFalse(ok)
            self.assertEqual(detalle, "A1 no responde")
            self.assertTrue(del_medio)

    def test_ts_checks_pass_on_a1(self):
        """When TS checks pass on A1, return success"""
        with patch('comprobar_en_a1.oracle_nodo.estado') as mock_estado, \
             patch('comprobar_en_a1.oracle_nodo.ssh') as mock_ssh, \
             patch('comprobar_en_a1.traer_nube.archivos_ts') as mock_archivos_ts, \
             patch('comprobar_en_a1.traer_nube.pruebas_python') as mock_pruebas_python:
            mock_estado.return_value = ({'fase': 'otro'}, None, None)
            mock_archivos_ts.return_value = ['file.ts']  # There are TS changes
            mock_pruebas_python.return_value = []  # No puente Python tests
            # Simulate successful SSH commands for mktemp, worktree add, cherry-pick, tsc, vitest, and cleanup
            mock_ssh.side_effect = [
                (0, '/tmp/workdir'),  # mktemp
                (0, ''),  # worktree add
                (0, ''),  # cherry-pick sha1
                (0, ''),  # tsc
                (0, ''),  # vitest related
                (0, ''),  # worktree remove
                (0, ''),  # rm -rf
            ]
            ok, detalle, del_medio = comprobar_en_a1.comprobar('base_sha', ['sha1'], ['file.ts'])
            self.assertTrue(ok)
            self.assertIn("verde en A1", detalle)
            self.assertFalse(del_medio)

    def test_ts_checks_fail_on_a1(self):
        """When TS checks fail on A1, return failure with del_medio=False"""
        with patch('comprobar_en_a1.oracle_nodo.estado') as mock_estado, \
             patch('comprobar_en_a1.oracle_nodo.ssh') as mock_ssh, \
             patch('comprobar_en_a1.traer_nube.archivos_ts') as mock_archivos_ts, \
             patch('comprobar_en_a1.traer_nube.pruebas_python') as mock_pruebas_python:
            mock_estado.return_value = ({'fase': 'otro'}, None, None)
            mock_archivos_ts.return_value = ['file.ts']
            mock_pruebas_python.return_value = []
            # Simulate SSH: mktemp success, worktree add success, cherry-pick success, tsc failure
            # Note: even if tsc fails, we still finally run the cleanup commands
            mock_ssh.side_effect = [
                (0, '/tmp/workdir'),  # mktemp
                (0, ''),  # worktree add
                (0, ''),  # cherry-pick sha1
                (1, 'tsc error'),  # tsc fails
                (0, ''),  # worktree remove (in finally)
                (0, ''),  # rm -rf (in finally)
            ]
            ok, detalle, del_medio = comprobar_en_a1.comprobar('base_sha', ['sha1'], ['file.ts'])
            self.assertFalse(ok)
            self.assertEqual(detalle, "tsc falló: tsc error")
            self.assertFalse(del_medio)

if __name__ == '__main__':
    unittest.main()