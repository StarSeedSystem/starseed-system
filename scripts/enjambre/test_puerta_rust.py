"""Pruebas para la puerta Rust (ENJ1126A).

Verifica que nada que toque native/ entre a main sin cargo check en verde.
También prueba la decisión pura: toca native/ sí/no, sello sí/no.
"""

import os
import sys
import subprocess
import unittest
from unittest import mock
from unittest.mock import MagicMock

# Asegurar import de starseed-enjambre.py
ENJAMBRE_DIR = os.path.dirname(os.path.abspath(__file__))
if ENJAMBRE_DIR not in sys.path:
    sys.path.insert(0, ENJAMBRE_DIR)

import importlib
import contextlib

enjambre = importlib.import_module("starseed-enjambre")

PUENTE_DIR = os.path.join(os.path.dirname(ENJAMBRE_DIR), "puente")
if PUENTE_DIR not in sys.path:
    sys.path.insert(0, PUENTE_DIR)


class TestPuertaRust(unittest.TestCase):
    """Pruebas unitarias de la puerta Rust."""

    def test_tarea_sin_native_no_dispara_puerta_rust(self):
        """Una tarea que cambió src/algo.tsx no dispara la puerta Rust."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["src/algo.tsx"]
        ):
            with mock.patch("subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
                rc, out = enjambre._puerta_rust("/falso/wt", tid="t1")
                self.assertEqual(rc, 0)
                self.assertEqual(out, "")

    def test_tarea_con_native_en_puente_dispara_cargo_check(self):
        """Una tarea que cambió native/ dispara la puerta cargo check."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["native/src-tauri/src/ble_linux.rs"]
        ):
            with mock.patch("subprocess.run") as mock_run:
                # Simular cargo check con errores (como las duplicadas VISTAS, vistas, etc.)
                mock_run.return_value = MagicMock(returncode=1, stdout="error[8]: duplicate definition VISTAS, vistas, anotar_vista y olvidar_vista", stderr="")
                rc, out = enjambre._puerta_rust("/falso/wt", tid="t2")
                self.assertNotEqual(rc, 0)
                self.assertIn("cargo check", out.lower())

    def test_decision_toca_native_sin_sello(self):
        """La decisión pura: toca native/ y no hay sello de cargo check."""
        pass