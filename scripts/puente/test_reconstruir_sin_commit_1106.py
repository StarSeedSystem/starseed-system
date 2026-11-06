#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for freno_sin_commit and una_pasada guard."""

import sys
import os
# Add repo root to path so that scripts.puente modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

import scripts.puente.reconstruir_mando as rm
import unittest
from unittest import mock


class TestFrenoSinCommit(unittest.TestCase):
    def test_src_modified(self):
        txt = rm.freno_sin_commit([" M src/app/x.ts"])
        self.assertIsNotNone(txt)
        self.assertIn("src/app/x.ts", txt)

    def test_untracked(self):
        txt = rm.freno_sin_commit(["?? src/a.ts.bak"])
        self.assertIsNone(txt)

    def test_not_src(self):
        txt = rm.freno_sin_commit([" M config/x.json"])
        self.assertIsNone(txt)

    def test_propia(self):
        txt = rm.freno_sin_commit([" M PUENTE-DE-MANDO.md"], propias=["PUENTE-DE-MANDO.md"])
        self.assertIsNone(txt)

    def test_many(self):
        lineas = [" M src/a.ts", " M src/b.ts", " M src/c.ts", " M src/d.ts"]
        txt = rm.freno_sin_commit(lineas)
        self.assertIsNotNone(txt)
        self.assertIn("4 archivo", txt)
        self.assertIn("src/a.ts", txt)
        self.assertIn("src/b.ts", txt)
        self.assertIn("src/c.ts", txt)
        self.assertNotIn("src/d.ts", txt)


class TestUnaPasadaGuard(unittest.TestCase):
    def test_blocks_compilacion(self):
        with mock.patch.object(rm, "_entradas", return_value=[]), \
             mock.patch.object(rm, "huella_de", return_value="h"), \
             mock.patch.object(rm, "_leer_estado", return_value={}), \
             mock.patch.object(rm, "genesis_caido", return_value=False), \
             mock.patch.object(rm, "decidir", return_value=(True, "motivo")), \
             mock.patch.object(rm, "_porcelain_src", return_value=[" M src/app/x.ts"]), \
             mock.patch.object(rm, "_guardar") as guardar, \
             mock.patch.object(rm, "compilar_en_el_a1") as compilar:
            result = rm.una_pasada(forzar=False)
        self.assertFalse(result)
        compilar.assert_not_called()
        guardar.assert_called()

    def test_continues_when_clean(self):
        with mock.patch.object(rm, "_entradas", return_value=[]), \
             mock.patch.object(rm, "huella_de", return_value="h"), \
             mock.patch.object(rm, "_leer_estado", return_value={}), \
             mock.patch.object(rm, "genesis_caido", return_value=False), \
             mock.patch.object(rm, "decidir", return_value=(True, "motivo")), \
             mock.patch.object(rm, "_porcelain_src", return_value=[]), \
             mock.patch.object(rm, "freno_de_maquina", return_value="freno"), \
             mock.patch.object(rm, "camino_de_build", return_value=("a1", "porque")), \
             mock.patch.object(rm, "compilar_en_el_a1", return_value=True) as compilar, \
             mock.patch.object(rm, "urgencia_a1", return_value=None):
            result = rm.una_pasada(forzar=False)
        self.assertTrue(result)
        compilar.assert_called_once()

    def test_forzar_bypasses(self):
        with mock.patch.object(rm, "_entradas", return_value=[]), \
             mock.patch.object(rm, "huella_de", return_value="h"), \
             mock.patch.object(rm, "_leer_estado", return_value={}), \
             mock.patch.object(rm, "genesis_caido", return_value=False), \
             mock.patch.object(rm, "decidir", return_value=(True, "motivo")), \
             mock.patch.object(rm, "_porcelain_src", return_value=[" M src/app/x.ts"]), \
             mock.patch.object(rm, "freno_de_maquina", return_value=None), \
             mock.patch.object(rm, "camino_de_build", return_value=("mac", "ok")), \
             mock.patch.object(rm, "reconstruir", return_value={}) as recon:
            result = rm.una_pasada(forzar=True)
        self.assertTrue(result)
        recon.assert_called_once()


if __name__ == "__main__":
    unittest.main()