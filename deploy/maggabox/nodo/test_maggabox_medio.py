# -*- coding: utf-8 -*-
"""Pruebas puras de maggabox_medio.py (ALM1125H1).

Herméticas: no tocan /Volumes, la red, SSH ni el disco real.
"""

from __future__ import annotations

import os
import sys
import time
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maggabox_medio as M


class SondaMaggabox(unittest.TestCase):
    def test_sonda_viva_sin_response(self):
        with patch.object(M, '_ssh_cmd', return_value=(1, "ssh error")):
            viva, detalle = M._sonda_maggabox()
            self.assertFalse(viva)
            self.assertIn("sin respuesta", detalle)

    def test_sonda_disco_bajo(self):
        with patch.object(M, '_ssh_cmd') as mock_ssh:
            mock_ssh.side_effect = [(0, "25G\n"), (0, "8")]
            viva, detalle = M._sonda_maggabox()
            self.assertFalse(viva)
            self.assertIn("disco bajo", detalle)

    def test_sonda_ram_baja(self):
        with patch.object(M, '_ssh_cmd') as mock_ssh:
            mock_ssh.side_effect = [(0, "100G\n"), (0, "2")]
            viva, detalle = M._sonda_maggabox()
            self.assertFalse(viva)
            self.assertIn("RAM baja", detalle)

    def test_sonda_viva(self):
        with patch.object(M, '_ssh_cmd') as mock_ssh:
            mock_ssh.side_effect = [(0, "100G\n"), (0, "8")]
            viva, detalle = M._sonda_maggabox()
            self.assertTrue(viva)


class DecidirLanzar(unittest.TestCase):
    def test_rechaza_si_en_otra_fase(self):
        ahora = time.time()
        estado = {"fase": "cola", "desde": ahora}
        ok, motivo = M.decidir_lanzar_maggabox(estado, ahora, None, ["cola-1"])
        self.assertFalse(ok)
        self.assertIn("otra fase", motivo)

    def test_rechaza_lanzamiento_reciente(self):
        ahora = time.time()
        estado = {"fase": "espera", "desde": ahora}
        ok, motivo = M.decidir_lanzar_maggabox(estado, ahora, ahora - 30, ["cola-1"])
        self.assertFalse(ok)
        self.assertIn("reciente", motivo)

    def test_rechaza_sin_colas(self):
        ahora = time.time()
        estado = {"fase": "espera", "desde": ahora}
        ok, motivo = M.decidir_lanzar_maggabox(estado, ahora, ahora - 300, [])
        self.assertFalse(ok)
        self.assertIn("sin colas", motivo)

    @patch.object(M, '_sonda_maggabox')
    def test_rechaza_maggabox_no_viva(self, mock_sonda):
        mock_sonda.return_value = (False, "no viva")
        ahora = time.time()
        estado = {"fase": "espera", "desde": ahora}
        ok, motivo = M.decidir_lanzar_maggabox(estado, ahora, None, ["cola-1"])
        self.assertFalse(ok)
        self.assertIn("no viva", motivo)

    @patch.object(M, '_sonda_maggabox')
    def test_acepta_si_listo(self, mock_sonda):
        mock_sonda.return_value = (True, "viva")
        ahora = time.time()
        estado = {"fase": "espera", "desde": ahora}
        ok, motivo = M.decidir_lanzar_maggabox(estado, ahora, None, ["cola-1"])
        self.assertTrue(ok)
        self.assertIn("listo", motivo)


class DebePrestar(unittest.TestCase):
    def test_no_presta_si_disco_disponible(self):
        estado = {"viva": True, "detalle": "viva"}
        ok, motivo = M.debe_prestar(50, estado, time.time())
        self.assertFalse(ok)
        self.assertIn("disponible", motivo)

    @patch.object(M, '_sonda_maggabox')
    def test_no_presta_maggabox_no_viva(self, mock_sonda):
        mock_sonda.return_value = (False, "no viva")
        estado = {}
        ok, motivo = M.debe_prestar(5, estado, time.time())
        self.assertFalse(ok)
        self.assertIn("no viva", motivo)

    @patch.object(M, '_sonda_maggabox')
    def test_presta_si_disco_bajo(self, mock_sonda):
        mock_sonda.return_value = (True, "viva")
        estado = {"viva": True, "detalle": "viva"}
        ok, motivo = M.debe_prestar(5, estado, time.time())
        self.assertTrue(ok)
        self.assertIn("bajo", motivo)


class RamaDeCola(unittest.TestCase):
    def test_formato_rama(self):
        ts = time.mktime(time.strptime("20261125-143022", "%Y%m%d-%H%M%S"))
        rama = M.rama_de_cola(ts)
        self.assertTrue(rama.startswith("colas/maggabox-"))
        self.assertTrue(rama.endswith(".json"))


class EstadoNodoMedio(unittest.TestCase):
    def test_estado_debe_llamar_sonda(self):
        """Test que verifica que el método estado() devuelve el diccionario correcto."""
        nodo = M.NodoMaggabox()
        self.assertIn("fase", nodo.vivo)
        self.assertIn("desde", nodo.vivo)
        self.assertIn("vivo", nodo.estado() or {})


if __name__ == "__main__":
    unittest.main()