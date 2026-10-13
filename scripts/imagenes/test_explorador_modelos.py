#!/usr/bin/env python3
"""Tests for explorador_modelos.py."""

import json
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from pathlib import Path
import sys
import os

# Add the scripts directory to the path to import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from explorador_modelos import (
    leer_modelos_imagenes,
    obtener_modelos_tendencia,
    obtener_modelos_me_gusta,
    comprobar_actualizaciones,
    obtener_versiones_motores,
    escribir_propuesta,
    filtrar_modelos_dignos,
    crear_cola_catalogo,
    http_get_json,
)

class TestExploradorModelos(unittest.TestCase):
    """Test cases for explorador_modelos.py."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        pass

    def tearDown(self) -> None:
        """Tear down test fixtures."""
        pass

    def test_obtener_modelos_tendencia(self) -> None:
        """Test obtaining trending models."""
        mock_data = [
            {
                "modelId": "test/model-1",
                "likes": 100,
                "lastModified": "2026-10-12T00:00:00Z",
                "tags": ["test"],
                "pipeline_tag": "text-to-image",
            }
        ]
        with patch('explorador_modelos.http_get_json') as mock_get:
            mock_get.return_value = mock_data
            result = obtener_modelos_tendencia()
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["id"], "test/model-1")
            self.assertEqual(result[0]["likes"], 100)
            self.assertEqual(result[0]["lastModified"], "2026-10-12T00:00:00Z")
            self.assertEqual(result[0]["tags"], ["test"])
            self.assertEqual(result[0]["pipeline_tag"], "text-to-image")

    def test_obtener_modelos_me_gusta(self) -> None:
        """Test obtaining most liked models."""
        mock_data = [
            {
                "modelId": "test/model-2",
                "likes": 200,
                "lastModified": "2026-10-11T00:00:00Z",
                "tags": ["test"],
                "pipeline_tag": "text-to-image",
            }
        ]
        with patch('explorador_modelos.http_get_json') as mock_get:
            mock_get.return_value = mock_data
            result = obtener_modelos_me_gusta()
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["id"], "test/model-2")
            self.assertEqual(result[0]["likes"], 200)
            self.assertEqual(result[0]["lastModified"], "2026-10-11T00:00:00Z")
            self.assertEqual(result[0]["tags"], ["test"])
            self.assertEqual(result[0]["pipeline_tag"], "text-to-image")

    def test_comprobar_actualizaciones(self) -> None:
        """Test checking for updates in existing models."""
        # First, we need to mock the leer_modelos_imagenes function to return a known model
        # We'll patch the file reading or the function itself.
        # Since leer_modelos_imagenes reads a file, we can mock the Path.read_text method.
        # Alternatively, we can patch the function to return a known list.
        with patch('explorador_modelos.leer_modelos_imagenes') as mock_leer:
            mock_leer.return_value = [
                {"id": "test-model", "hf": "test/hf-model"}
            ]
            # Now mock the HTTP call for the model info
            with patch('explorador_modelos.http_get_json') as mock_get:
                # Return model info with a lastModified date newer than the verification date
                mock_get.return_value = {
                    "lastModified": "2026-10-12T00:00:00Z",
                    "license": "apache-2.0",
                    "gated": False,
                }
                result = comprobar_actualizaciones(mock_leer.return_value)
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]["id"], "test-model")
                self.assertEqual(result[0]["hf"], "test/hf-model")
                self.assertEqual(result[0]["last_modified"], "2026-10-12T00:00:00Z")
                self.assertEqual(result[0]["license"], "apache-2.0")
                self.assertEqual(result[0]["gated"], False)

    def test_obtener_versiones_motores(self) -> None:
        """Test obtaining versions of engines."""
        # Mock the GitHub API calls
        def mock_get_json_side_effect(url):
            if "stable-diffusion.cpp" in url and "releases/latest" in url:
                return {"tag_name": "v1.0.0"}
            elif "stable-diffusion.cpp" in url and "tags" in url:
                return [{"name": "v0.9.0"}, {"name": "v1.0.0"}]
            elif "comfyanonymous/ComfyUI" in url and "releases/latest" in url:
                return {"tag_name": "v0.39.0"}
            elif "comfyanonymous/ComfyUI" in url and "tags" in url:
                return [{"name": "v0.38.0"}, {"name": "v0.39.0"}]
            return None

        with patch('explorador_modelos.http_get_json') as mock_get:
            mock_get.side_effect = mock_get_json_side_effect
            result = obtener_versiones_motores()
            self.assertEqual(result["stable-diffusion.cpp"], "v1.0.0")
            self.assertEqual(result["comfyui"], "v0.39.0")

    def test_filtrar_modelos_dignos(self) -> None:
        """Test filtering worthy models."""
        # We need to mock the HTTP call for each model to return license and gated info
        def mock_get_json_side_effect(url):
            if "worthy-model" in url:
                return {
                    "license": "apache-2.0",
                    "gated": False,
                }
            elif "unworthy-license" in url:
                return {
                    "license": "non-commercial",
                    "gated": False,
                }
            elif "unworthy-gated" in url:
                return {
                    "license": "apache-2.0",
                    "gated": True,
                }
            return None

        with patch('explorador_modelos.http_get_json') as mock_get:
            mock_get.side_effect = mock_get_json_side_effect
            modelos = [
                {"id": "worthy-model", "pipeline_tag": ["text-to-image"]},
                {"id": "unworthy-license", "pipeline_tag": ["text-to-image"]},
                {"id": "unworthy-gated", "pipeline_tag": ["text-to-image"]},
                {"id": "not-text-to-image", "pipeline_tag": ["other"]},
            ]
            result = filtrar_modelos_dignos(modelos)
            # Only the worthy-model should pass
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["id"], "worthy-model")

    def test_crear_cola_catalogo(self) -> None:
        """Test creating a queue file."""
        modelos = [
            {"id": "model-1", "hf": "test/model-1"},
            {"id": "model-2", "hf": "test/model-2"},
        ]
        # We need to mock the PROPOSALS_DIR to avoid writing to the actual directory
        # We'll patch the PROPOSALS_DIR in the module
        with patch('explorador_modelos.PROPOSALS_DIR', Path("/tmp")):
            crear_cola_catalogo(modelos)
            # Check that the file was created
            expected_path = Path("/tmp/cola-imagenes-catalogo-" + datetime.now(timezone.utc).strftime("%Y-%m-%d") + ".json")
            self.assertTrue(expected_path.exists())
            # Read the file and check the content
            with open(expected_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(len(data), 2)
            self.assertEqual(data[0]["id"], "model-1")
            self.assertEqual(data[1]["id"], "model-2")
            # Clean up
            expected_path.unlink(missing_ok=True)

    def test_escribir_propuesta(self) -> None:
        """Test writing a proposal."""
        propuesta = {
            "fecha": "2026-10-13",
            "modelos_tendencia": [],
            "modelos_me_gusta": [],
            "actualizaciones_modelos": [],
            "versiones_motores": {},
        }
        # We need to mock the PROPOSALS_DIR to avoid writing to the actual directory
        with patch('explorador_modelos.PROPOSALS_DIR', Path("/tmp")):
            escribir_propuesta(propuesta)
            expected_path = Path("/tmp/propuestas-imagenes.json")
            self.assertTrue(expected_path.exists())
            # Read the file and check the content
            with open(expected_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data["fecha"], "2026-10-13")
            # Clean up
            expected_path.unlink(missing_ok=True)

if __name__ == "__main__":
    unittest.main()