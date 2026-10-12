# -*- coding: utf-8 -*-
"""Tests for comprobar_en_a1.py."""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Add the current directory to the sys.path so that we can import comprobar_en_a1 and oracle_nodo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import comprobar_en_a1


class TestComprobarEnA1(unittest.TestCase):
    """Tests for the comprobar function."""

    @patch('comprobar_en_a1.oracle_nodo.estado')
    @patch('comprobar_en_a1.oracle_nodo._git')
    @patch('comprobar_en_a1.oracle_nodo.ssh')
    @patch('comprobar_en_a1.oracle_nodo._ip')
    def test_a1_occupied(self, mock_ip, mock_ssh, mock__git, mock_estado):
        """When the A1 is occupied with a cola, returns del_medio=True."""
        mock_estado.return_value = (
            {},  # estado_a1
            {"fase": "cola"},  # nodo
            []   # servicios
        )
        mock_ip.return_value = "1.2.3.4"
        ok, detalle, del_medio = comprobar_en_a1.comprobar(
            base_sha="abc123",
            shas=["def456"],
            cambiados=["src/file.ts"]
        )
        self.assertFalse(ok)
        self.assertIn("A1 ocupado", detalle)
        self.assertTrue(del_medio)
        mock_estado.assert_called_once_with(guardar=False)

    @patch('comprobar_en_a1.oracle_nodo.estado')
    @patch('comprobar_en_a1.oracle_nodo._git')
    @patch('comprobar_en_a1.oracle_nodo.ssh')
    @patch('comprobar_en_a1.oracle_nodo._ip')
    def test_a1_not_responding(self, mock_ip, mock_ssh, mock__git, mock_estado):
        """When the A1 does not respond, returns del_medio=True."""
        mock_estado.side_effect = Exception("No response")
        mock_ip.return_value = "1.2.3.4"
        ok, detalle, del_medio = comprobar_en_a1.comprobar(
            base_sha="abc123",
            shas=["def456"],
            cambiados=["src/file.ts"]
        )
        self.assertFalse(ok)
        self.assertIn("No se pudo obtener el estado del A1", detalle)
        self.assertTrue(del_medio)
        mock_estado.assert_called_once_with(guardar=False)

    @patch('comprobar_en_a1.oracle_nodo.estado')
    @patch('comprobar_en_a1.oracle_nodo._git')
    @patch('comprobar_en_a1.oracle_nodo.ssh')
    @patch('comprobar_en_a1.oracle_nodo._ip')
    def test_no_shas(self, mock_ip, mock_ssh, mock__git, mock_estado):
        """When there are no shas, returns success without doing anything."""
        mock_estado.return_value = (
            {},
            {"fase": "libre"},
            []
        )
        mock_ip.return_value = "1.2.3.4"
        ok, detalle, del_medio = comprobar_en_a1.comprobar(
            base_sha="abc123",
            shas=[],
            cambiados=["src/file.ts"]
        )
        self.assertTrue(ok)
        self.assertEqual(detalle, "No hay shas que comprobar")
        self.assertFalse(del_medio)
        mock_estado.assert_called_once_with(guardar=False)

    @patch('comprobar_en_a1.oracle_nodo.estado')
    @patch('comprobar_en_a1.oracle_nodo._git')
    @patch('comprobar_en_a1.oracle_nodo.ssh')
    @patch('comprobar_en_a1.oracle_nodo._ip')
    @patch('comprobar_en_a1.subprocess.run')
    def test_a1_free_checks_pass(
        self, mock_subprocess_run, mock_ip, mock_ssh, mock__git, mock_estado
    ):
        """When the A1 is free and checks pass, returns success."""
        mock_estado.return_value = (
            {},
            {"fase": "libre"},
            []
        )
        mock_ip.return_value = "1.2.3.4"
        mock__git.return_value = (0, "")
        mock_subprocess_run.return_value = MagicMock(returncode=0, stderr="")
        mock_ssh.return_value = (0, "ALL CHECKS PASSED")

        ok, detalle, del_medio = comprobar_en_a1.comprobar(
            base_sha="abc123",
            shas=["def456"],
            cambiados=["src/file.ts"],
            timeout=900
        )
        self.assertTrue(ok)
        self.assertEqual(detalle, "Todas las pruebas pasaron en el A1")
        self.assertFalse(del_medio)
        # Verify that oracle_nodo.ssh was called
        mock_ssh.assert_called_once()
        # Note: We are not mocking the temporary directory or the actual file operations,
        # but the test should still work because the function uses tempfile.TemporaryDirectory
        # which will create a real temporary directory, and the scp calls are mocked to succeed.

    @patch('comprobar_en_a1.oracle_nodo.estado')
    @patch('comprobar_en_a1.oracle_nodo._git')
    @patch('comprobar_en_a1.oracle_nodo.ssh')
    @patch('comprobar_en_a1.oracle_nodo._ip')
    @patch('comprobar_en_a1.subprocess.run')
    def test_a1_free_checks_fail(
        self, mock_subprocess_run, mock_ip, mock_ssh, mock__git, mock_estado
    ):
        """When the A1 is free but checks fail, returns failure with del_medio=False."""
        mock_estado.return_value = (
            {},
            {"fase": "libre"},
            []
        )
        mock_ip.return_value = "1.2.3.4"
        mock__git.return_value = (0, "")
        mock_subprocess_run.return_value = MagicMock(returncode=0, stderr="")
        mock_ssh.return_value = (1, "TSC FAILED: some error")

        ok, detalle, del_medio = comprobar_en_a1.comprobar(
            base_sha="abc123",
            shas=["def456"],
            cambiados=["src/file.ts"],
            timeout=900
        )
        self.assertFalse(ok)
        self.assertIn("Las pruebas fallaron en el A1", detalle)
        self.assertFalse(del_medio)


if __name__ == '__main__':
    unittest.main()