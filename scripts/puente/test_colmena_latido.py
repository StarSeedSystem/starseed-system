#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for nodo_metagenesis_medio.py related to the latido enhancements (COL1012C)."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch

# Import the module we are testing
import sys
sys.path.append(os.path.dirname(__file__))
import nodo_metagenesis_medio as nodo


class TestGetEnCurso(unittest.TestCase):
    """Tests for the _get_en_curso helper function."""

    def test_empty_progreso(self):
        """When progreso.json is empty or missing, en_curso should be empty."""
        with tempfile.TemporaryDirectory() as tmpdir:
            olas = os.path.join(tmpdir, "starseed_memory_root", "olas")
            os.makedirs(olas, exist_ok=True)
            # Create an empty progreso.json
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump({}, f)
            # No puntos-control.json
            result = nodo._get_en_curso(tmpdir, 0.0)
            self.assertEqual(result, [])

    def test_no_working_tasks(self):
        """When there are tasks but none in working phases, en_curso is empty."""
        with tempfile.TemporaryDirectory() as tmpdir:
            olas = os.path.join(tmpdir, "starseed_memory_root", "olas")
            os.makedirs(olas, exist_ok=True)
            progreso = {
                "tarea1": {"fase": "pendiente"},
                "tarea2": {"fase": "revisando"},
            }
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump(progreso, f)
            result = nodo._get_en_curso(tmpdir, 0.0)
            self.assertEqual(result, [])

    def test_working_tasks_without_puntos(self):
        """Working tasks should appear in en_curso even if no punto is available."""
        with tempfile.TemporaryDirectory() as tmpdir:
            olas = os.path.join(tmpdir, "starseed_memory_root", "olas")
            os.makedirs(olas, exist_ok=True)
            progreso = {
                "tarea1": {"fase": "escribiendo"},
                "tarea2": {"fase": "reparando"},
                "tarea3": {"fase": "corrigiendo"},
            }
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump(progreso, f)
            # No puntos-control.json
            result = nodo._get_en_curso(tmpdir, 0.0)
            self.assertEqual(len(result), 3)
            for i, (tid, expected_fase) in enumerate([
                ("tarea1", "escribiendo"),
                ("tarea2", "reparando"),
                ("tarea3", "corrigiendo"),
            ]):
                self.assertEqual(result[i]["id"], tid)
                self.assertEqual(result[i]["fase"], expected_fase)
                self.assertEqual(result[i]["punto"], {})  # Empty dict

    def test_working_tasks_with_puntos(self):
        """Working tasks should include the punto from puntos-control.json."""
        with tempfile.TemporaryDirectory() as tmpdir:
            olas = os.path.join(tmpdir, "starseed_memory_root", "olas")
            os.makedirs(olas, exist_ok=True)
            progreso = {
                "tarea1": {"fase": "escribiendo"},
                "tarea2": {"fase": "reparando"},
            }
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump(progreso, f)
            puntos = {
                "tarea1": {"rama": "main", "sha": "abc123", "t": 1000.0},
                "tarea2": {"rama": "feature", "sha": "def456", "t": 2000.0},
            }
            with open(os.path.join(olas, "puntos-control.json"), "w") as f:
                json.dump(puntos, f)
            result = nodo._get_en_curso(tmpdir, 0.0)
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["id"], "tarea1")
            self.assertEqual(result[0]["fase"], "escribiendo")
            self.assertEqual(result[0]["punto"], {"rama": "main", "sha": "abc123", "t": 1000.0})
            self.assertEqual(result[1]["id"], "tarea2")
            self.assertEqual(result[1]["fase"], "reparando")
            self.assertEqual(result[1]["punto"], {"rama": "feature", "sha": "def456", "t": 2000.0})

    def test_limit_to_eight(self):
        """Only up to eight tasks should be returned."""
        with tempfile.TemporaryDirectory() as tmpdir:
            olas = os.path.join(tmpdir, "starseed_memory_root", "olas")
            os.makedirs(olas, exist_ok=True)
            progreso = {}
            for i in range(10):
                progreso[f"tarea{i}"] = {"fase": "escribiendo"}
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump(progreso, f)
            result = nodo._get_en_curso(tmpdir, 0.0)
            self.assertEqual(len(result), 8)
            for i in range(8):
                self.assertEqual(result[i]["id"], f"tarea{i}")
                self.assertEqual(result[i]["fase"], "escribiendo")
                self.assertEqual(result[i]["punto"], {})


class TestConstruirCapGobernador(unittest.TestCase):
    """Tests for the _construir_cap_gobernador helper function."""

    def test_basic_info(self):
        """Test that basic medium info is set."""
        result = nodo._construir_cap_gobernador("mac")
        self.assertEqual(result["medio"], "mac")
        self.assertIn(result["so"], ["otro", "windows", "linux"])  # Depending on platform
        self.assertIsInstance(result["herramientas"], dict)
        self.assertEqual(result["medio_app"], "")
        self.assertIsInstance(result["wsl"], bool)
        self.assertIsInstance(result["bateria"], type(None))
        self.assertIsInstance(result["red"], type(None))

    def test_gobernador_json_used(self):
        """When gobernador.json exists, its values are used."""
        with tempfile.TemporaryDirectory() as tmpdir:
            home = os.path.join(tmpdir, "home")
            os.makedirs(home, exist_ok=True)
            with patch.dict(os.environ, {"HOME": home}):
                gobernador_path = os.path.join(home, ".starseed", "gobernador.json")
                os.makedirs(os.path.dirname(gobernador_path), exist_ok=True)
                gov_data = {
                    "ram_total_mb": 8192,
                    "nucleos": 4,
                    "disco_libre_mb": 50000,  # 50 GB in MB
                }
                with open(gobernador_path, "w") as f:
                    json.dump(gov_data, f)
                result = nodo._construir_cap_gobernador("mac")
                self.assertEqual(result["ram_total_mb"], 8192.0)
                self.assertEqual(result["nucleos"], 4.0)
                self.assertEqual(result["disco_libre_gb"], 50000.0 / 1024.0)  # ~48.828 GB

    def test_fallback_to_system_info(self):
        """When gobernador.json is missing, fallback to system info is used."""
        with tempfile.TemporaryDirectory() as tmpdir:
            home = os.path.join(tmpdir, "home")
            os.makedirs(home, exist_ok=True)
            with patch.dict(os.environ, {"HOME": home}):
                # Ensure no gobernador.json
                gobernador_path = os.path.join(home, ".starseed", "gobernador.json")
                if os.path.exists(gobernador_path):
                    os.remove(gobernador_path)
                result = nodo._construir_cap_gobernador("mac")
                # We just check that the fields are set to something reasonable
                self.assertIsInstance(result["ram_total_mb"], float)
                self.assertIsInstance(result["nucleos"], float)
                self.assertIsInstance(result["disco_libre_gb"], float)
                # The values should be >= 0 or None
                if result["ram_total_mb"] is not None:
                    self.assertGreaterEqual(result["ram_total_mb"], 0)
                if result["nucleos"] is not None:
                    self.assertGreaterEqual(result["nucleos"], 0)
                if result["disco_libre_gb"] is not None:
                    self.assertGreaterEqual(result["disco_libre_gb"], 0)


class TestMedir(unittest.TestCase):
    """Tests for the medir function with the new fields."""

    def test_medir_includes_new_fields(self):
        """The medir function should return en_curso, contenedor, and periodo_s."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Set up a fake repo
            repo_dir = os.path.join(tmpdir, "repo")
            os.makedirs(repo_dir, exist_ok=True)
            os.makedirs(os.path.join(repo_dir, ".git"), exist_ok=True)
            # Set up the starseed_memory_root/olas directory
            olas_dir = os.path.join(repo_dir, "starseed_memory_root", "olas")
            os.makedirs(olas_dir, exist_ok=True)
            # Write a progreso.json with one working task
            progreso = {
                "tarea1": {"fase": "escribiendo"}
            }
            with open(os.path.join(olas_dir, "progreso.json"), "w") as f:
                json.dump(progreso, f)
            # Write an empty puntos-control.json
            with open(os.path.join(olas_dir, "puntos-control.json"), "w") as f:
                json.dump({}, f)
            # Set up the nodo-metagenesis directory
            nodo_dir = os.path.join(os.path.expanduser("~"), ".starseed", "nodo-metagenesis")
            os.makedirs(nodo_dir, exist_ok=True)
            # Write a contenedor.json with activo: true
            with open(os.path.join(nodo_dir, "contenedor.json"), "w") as f:
                json.dump({"activo": True, "t": 1000.0}, f)
            # Patch the environment to point to our fake repo
            with patch.dict(os.environ, {"STARSEED_ROOT": repo_dir}):
                # We also need to patch the homedir for the contenedor.json? 
                # The function uses CARPETA which is based on STARSEED_NODO_DIR or ~/.starseed/nodo-metagenesis
                # We'll set STARSEED_NODO_DIR to our fake nodo_dir
                with patch.dict(os.environ, {"STARSEED_NODO_DIR": nodo_dir}):
                    result = nodo.medir("real", 0.0)
                    # Check that the new fields are present
                    self.assertIn("en_curso", result)
                    self.assertIn("contenedor", result)
                    self.assertIn("periodo_s", result)
                    # Check en_curso is a list with one element
                    self.assertIsInstance(result["en_curso"], list)
                    self.assertEqual(len(result["en_curso"]), 1)
                    self.assertEqual(result["en_curso"][0]["id"], "tarea1")
                    self.assertEqual(result["en_curso"][0]["fase"], "escribiendo")
                    # Check contenedor structure
                    self.assertIsInstance(result["contenedor"], dict)
                    self.assertIn("activo", result["contenedor"])
                    self.assertIn("agentes", result["contenedor"])
                    self.assertIn("apto", result["contenedor"])
                    self.assertIn("motivo", result["contenedor"])
                    # Check periodo_s is a float
                    self.assertIsInstance(result["periodo_s"], float)
                    # In our implementation, it's 0.0
                    self.assertEqual(result["periodo_s"], 0.0)



