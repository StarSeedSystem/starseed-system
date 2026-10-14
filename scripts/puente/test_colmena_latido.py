#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for the node heartbeat in scripts/puente/nodo_metagenesis_medio.py."""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nodo_metagenesis_medio as nodo


class TestNodoMetagenesisMedio(unittest.TestCase):
    def setUp(self):
        # Create a temporary directory for the repo
        self.temp_dir = tempfile.mkdtemp()
        self.repo_dir = self.temp_dir
        os.makedirs(os.path.join(self.repo_dir, ".git"), exist_ok=True)
        os.makedirs(os.path.join(self.repo_dir, "starseed_memory_root", "olas"), exist_ok=True)

        # Set environment variables
        self.env_patcher = patch.dict(os.environ, {
            "STARSEED_ROOT": self.repo_dir,
            "STARSEED_NODO_DIR": os.path.join(self.temp_dir, ".starseed"),
        })
        self.env_patcher.start()

        # Create a default progreso.json (empty)
        progreso_path = os.path.join(self.repo_dir, "starseed_memory_root", "olas", "progreso.json")
        with open(progreso_path, "w") as f:
            json.dump({}, f)

    def tearDown(self):
        self.env_patcher.stop()
        # Clean up the temporary directory
        for root, dirs, files in os.walk(self.temp_dir, topdown=False):
            for name in files:
                os.remove(os.path.join(root, name))
            for name in dirs:
                os.rmdir(os.path.join(root, name))
        os.rmdir(self.temp_dir)

    def test_medir_returns_expected_keys(self):
        result = nodo.medir("real")
        self.assertIsInstance(result, dict)
        expected_keys = {"medio", "raiz", "salud", "cap", "en_curso", "contenedor", "periodo_s"}
        self.assertEqual(set(result.keys()), expected_keys)

    def test_en_curso_is_list(self):
        result = nodo.medir("real")
        self.assertIsInstance(result["en_curso"], list)

    def test_en_curso_structure(self):
        # Add a task in progreso.json with a working phase
        progreso_path = os.path.join(self.repo_dir, "starseed_memory_root", "olas", "progreso.json")
        progreso = {
            "task1": {
                "fase": "escribiendo",
                # other fields can be empty
            }
        }
        with open(progreso_path, "w") as f:
            json.dump(progreso, f)

        # Also create a puntos-control.json for the task
        puntos_path = os.path.join(self.repo_dir, "starseed_memory_root", "olas", "puntos-control.json")
        puntos = {
            "task1": {
                "rama": "relevo/mac/test",
                "sha": "abc123",
                "t": 1234567890.0
            }
        }
        with open(puntos_path, "w") as f:
            json.dump(puntos, f)

        result = nodo.medir("real")
        self.assertGreaterEqual(len(result["en_curso"]), 1)
        task = result["en_curso"][0]
        self.assertIn("id", task)
        self.assertIn("fase", task)
        self.assertIn("punto", task)
        self.assertIn("rama", task["punto"])
        self.assertIn("sha", task["punto"])
        self.assertIn("t", task["punto"])
        self.assertEqual(task["id"], "task1")
        self.assertEqual(task["fase"], "escribiendo")
        self.assertEqual(task["punto"]["rama"], "relevo/mac/test")
        self.assertEqual(task["punto"]["sha"], "abc123")
        self.assertEqual(task["punto"]["t"], 1234567890.0)

    def test_en_curso_limited_to_8(self):
        # Add more than 8 tasks
        progreso_path = os.path.join(self.repo_dir, "starseed_memory_root", "olas", "progreso.json")
        progreso = {}
        for i in range(10):
            progreso[f"task{i}"] = {"fase": "escribiendo"}
        with open(progreso_path, "w") as f:
            json.dump(progreso, f)

        # Create puntos-control.json for all tasks
        puntos_path = os.path.join(self.repo_dir, "starseed_memory_root", "olas", "puntos-control.json")
        puntos = {}
        for i in range(10):
            puntos[f"task{i}"] = {"rama": f"relevo/mac/test{i}", "sha": f"sha{i}", "t": float(i)}
        with open(puntos_path, "w") as f:
            json.dump(puntos, f)

        result = nodo.medir("real")
        self.assertLessEqual(len(result["en_curso"]), 8)
        self.assertGreaterEqual(len(result["en_curso"]), 1)  # at least one because we have working phases

    def test_contenedor_structure(self):
        result = nodo.medir("real")
        self.assertIsInstance(result["contenedor"], dict)
        expected_keys = {"activo", "agentes", "apto", "motivo"}
        self.assertEqual(set(result["contenedor"].keys()), expected_keys)
        self.assertIsInstance(result["contenedor"]["activo"], bool)
        self.assertIsInstance(result["contenedor"]["agentes"], int)
        self.assertIsInstance(result["contenedor"]["apto"], bool)
        self.assertIsInstance(result["contenedor"]["motivo"], str)

    def test_contenedor_activo_default(self):
        # Test default active for Mac and A1
        with patch("scripts.puente.nodo_metagenesis_medio.detectar_medio") as mock_detect:
            mock_detect.return_value = "mac"
            result = nodo.medir("real")
            self.assertTrue(result["contenedor"]["activo"])

            mock_detect.return_value = "oracle-a1"
            result = nodo.medir("real")
            self.assertTrue(result["contenedor"]["activo"])

            mock_detect.return_value = "neurona"
            result = nodo.medir("real")
            self.assertFalse(result["contenedor"]["activo"])

    def test_contenedor_activo_from_file(self):
        # Create a contendor file
        contendor_dir = os.path.join(os.path.expanduser("~/.starseed"), "nodo-metagenesis")
        os.makedirs(contendor_dir, exist_ok=True)
        contendor_path = os.path.join(contendor_dir, "contenedor.json")
        with open(contendor_path, "w") as f:
            json.dump({"activo": True}, f)

        try:
            result = nodo.medir("real")
            self.assertTrue(result["contenedor"]["activo"])
        finally:
            # Clean up
            if os.path.exists(contendor_path):
                os.remove(contendor_path)

    def test_periodo_s_is_number(self):
        result = nodo.medir("real")
        self.assertIsInstance(result["periodo_s"], (int, float))

    def test_ram_total_mb_function(self):
        # Test the helper function we added
        with patch("scripts.puente.nodo_metagenesis_medio._sh") as mock_sh:
            # Simulate Linux
            with patch("sys.platform", "linux"):
                mock_sh.return_value = (0, "1024000")  # 1024000 KB = 1000 MB
                self.assertEqual(nodo.ram_total_mb(), 1000)
            # Simulate Darwin
            with patch("sys.platform", "darwin"):
                mock_sh.return_value = (0, "2000000000")  # 2000000000 bytes = ~1907 MB
                self.assertEqual(nodo.ram_total_mb(), 1907)  # 2000000000 // (1024*1024) = 1907
            # Simulate error
            with patch("sys.platform", "linux"):
                mock_sh.return_value = (1, "error")
                self.assertIsNone(nodo.ram_total_mb())


if __name__ == "__main__":
    unittest.main()