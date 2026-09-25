#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Latidos de agentes externos (2026-09-25): Claude en Cowork y sus subagentes en el Mando."""
import json
import os
import tempfile
import time
import unittest
from unittest import mock

import latido_externo as LE


class LatidoExterno(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.p = mock.patch.object(LE, "DIR_OLAS", self._tmp.name)
        self.p.start()

    def tearDown(self):
        self.p.stop()
        self._tmp.cleanup()

    def test_empezar_fase_terminar(self):
        LE.main(["empezar", "fondo-adaptativo", "Fondo con calidad adaptativa", "--minutos", "30"])
        with open(LE.ruta("cowork"), encoding="utf-8") as f:
            d = json.load(f)
        t = d["tareas"]["fondo-adaptativo"]
        self.assertEqual(t["modelo"], "anthropic/claude-opus-5.5")
        self.assertEqual(t["donde"], "cowork")
        self.assertGreater(t["hasta"], time.time() + 29 * 60)
        LE.main(["fase", "fondo-adaptativo", "tests"])
        with open(LE.ruta("cowork"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["tareas"]["fondo-adaptativo"]["fase"], "tests")
        LE.main(["terminar", "fondo-adaptativo"])
        with open(LE.ruta("cowork"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["tareas"], {})

    def test_id_invalido_no_escribe(self):
        with self.assertRaises(SystemExit):
            LE.main(["empezar", "../fuera", "x"])
        self.assertFalse(os.path.exists(LE.ruta("cowork")))

    def test_subagente_con_otro_modelo(self):
        LE.main(["empezar", "memorias", "Página de memorias", "--modelo", "anthropic/claude-sonnet (subagente)"])
        with open(LE.ruta("cowork"), encoding="utf-8") as f:
            self.assertIn("sonnet", json.load(f)["tareas"]["memorias"]["modelo"])


if __name__ == "__main__":
    unittest.main()
