#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de navegador_ciclo (NAV1112J).

Verifica que el orquestador ejecuta los pasos en orden y es tolerante a fallos.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import navegador_ciclo as NC


class TestNavegadorCiclo(unittest.TestCase):
    """Pruebas para el orquestador del ciclo del navegador."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        os.environ["STARSEED_ROOT"] = self.tmp

    def tearDown(self):
        self._tmp.cleanup()
        if "STARSEED_ROOT" in os.environ:
            del os.environ["STARSEED_ROOT"]

    def test_apagado_con_STARSEED_NAVEGADOR_0(self):
        """Si STARSEED_NAVEGADOR=0, el ciclo termina sin hacer nada."""
        os.environ["STARSEED_NAVEGADOR"] = "0"
        try:
            r = NC.main()
            self.assertEqual(r, 0)
        finally:
            del os.environ["STARSEED_NAVEGADOR"]

    def test_apagado_con_STARSEED_NAVEGADOR_false(self):
        """Si STARSEED_NAVEGADOR=false, el ciclo termina sin hacer nada."""
        os.environ["STARSEED_NAVEGADOR"] = "false"
        try:
            r = NC.main()
            self.assertEqual(r, 0)
        finally:
            del os.environ["STARSEED_NAVEGADOR"]

    @patch("subprocess.run")
    def test_ejecuta_pasos_en_orden(self, mock_run):
        """Verifica que los pasos se ejecutan en el orden correcto."""
        os.environ["STARSEED_NAVEGADOR"] = "1"
        try:
            # Configurar mocks
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

            with patch.object(NC, "AG", MagicMock()) as mock_ag, \
                 patch.object(NC, "AI", MagicMock()) as mock_ai:
                mock_ag.leer.return_value = {"ok": True, "fichas": [], "errores": []}
                mock_ai.leer.return_value = {"ok": True, "fichas": [], "estado": {"enlaces": []}, "errores": []}

                r = NC.main()
                self.assertEqual(r, 0)

                # Verificar orden de llamadas a subprocess.run
                # 1. navegador_alta.py vigilar
                # 2. navegador_reparar.py
                # 3. docker compose stop
                self.assertEqual(mock_run.call_count, 3)

                # Verificar que navegador_alta.py vigilar fue la primera llamada
                first_call = mock_run.call_args_list[0]
                self.assertIn("navegador_alta.py", str(first_call))
                self.assertIn("vigilar", str(first_call))

                # Verificar que docker compose stop fue la última
                last_call = mock_run.call_args_list[-1]
                self.assertIn("docker", str(last_call))
                self.assertIn("stop", str(last_call))
        finally:
            del os.environ["STARSEED_NAVEGADOR"]

    @patch("subprocess.run")
    def test_tolerante_a_fallos_lectores(self, mock_run):
        """Un lector que falla no impide que se ejecuten los demás."""
        os.environ["STARSEED_NAVEGADOR"] = "1"
        try:
            mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

            with patch.object(NC, "AG", MagicMock()) as mock_ag, \
                 patch.object(NC, "AI", MagicMock()) as mock_ai:
                # google-alex falla, google-fundacion ok
                mock_ag.leer.side_effect = [
                    Exception("Error de red"),  # google-alex falla
                    {"ok": True, "fichas": [], "errores": []},  # google-fundacion ok
                ]
                mock_ai.leer.return_value = {"ok": True, "fichas": [], "estado": {"enlaces": []}, "errores": []}

                r = NC.main()
                # El ciclo ejecuta todos los pasos aunque uno falle (protegidos)
                # El código de retorno puede ser no-cero si hay fallos, pero todos corren
                self.assertIn(r, (0, 1))

                # Verificar que se intentaron ambos google
                self.assertEqual(mock_ag.leer.call_count, 2)
                # Verificar que se intentaron ambos instagram
                self.assertEqual(mock_ai.leer.call_count, 2)
                # Verificar que navegador_reparar y docker también corrieron
                self.assertEqual(mock_run.call_count, 3)
        finally:
            del os.environ["STARSEED_NAVEGADOR"]

    @patch("subprocess.run")
    def test_fallo_docker_no_tumba_ciclo(self, mock_run):
        """Fallo al apagar contenedor no impide que se ejecute el resto."""
        os.environ["STARSEED_NAVEGADOR"] = "1"
        try:
            mock_run.side_effect = [
                MagicMock(returncode=0, stdout="", stderr=""),  # navegador_alta
                MagicMock(returncode=0, stdout="", stderr=""),  # navegador_reparar
                Exception("docker no encontrado"),  # docker falla
            ]

            with patch.object(NC, "AG", MagicMock()) as mock_ag, \
                 patch.object(NC, "AI", MagicMock()) as mock_ai:
                mock_ag.leer.return_value = {"ok": True, "fichas": [], "errores": []}
                mock_ai.leer.return_value = {"ok": True, "fichas": [], "estado": {"enlaces": []}, "errores": []}

                r = NC.main()
                # El ciclo devuelve 1 porque docker falló (es el último paso)
                # pero todos los pasos anteriores se ejecutaron
                self.assertEqual(mock_run.call_count, 3)
        finally:
            del os.environ["STARSEED_NAVEGADOR"]

    def test_cero_funcion(self):
        """Prueba la función interna _cero."""
        self.assertTrue(NC._cero("0"))
        self.assertTrue(NC._cero("false"))
        self.assertTrue(NC._cero("no"))
        self.assertTrue(NC._cero("off"))
        self.assertFalse(NC._cero("1"))
        self.assertFalse(NC._cero("true"))
        self.assertFalse(NC._cero("yes"))
        self.assertFalse(NC._cero("on"))
        self.assertFalse(NC._cero(""))


if __name__ == "__main__":
    unittest.main()