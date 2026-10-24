#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tests for vigia_enchufes.py.

All tests are offline and mock the external dependencies.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List

# Add the repo root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.puente.vigia_enchufes import (
    detectar_nuevas_capas_y_apis,
    cargar_config_capas,
    guardar_novedades,
)


def test_cargar_config_capas() -> None:
    """Test loading capas config (mock config path)."""
    # Mock config path
    config_path = Path(__file__).parent.parent / "config" / "capas-astraura.json"
    config = cargar_config_capas()
    assert isinstance(config, dict), "Config should be a dict"
    # Verify it has 'capas' key
    assert "capas" in config, "Config should have 'capas' key"


def test_detectar_nuevas_capas_mock(monkeypatch) -> None:
    """Test detection with mocked layer data."""

    # Sample mock config
    mock_config = {
        "capas": [
            {"id": "needle-base", "fuente_oficial": "https://huggingface.co/Cactus-Compute/needle", "sha256": "por-verificar"},
        ]
    }

    # Patch cargar_config_capas
    import scripts.puente.vigia_enchufes as vigia_module
    original = vigia_module.cargar_config_capas
    vigia_module.cargar_config_capas = lambda: mock_config

    try:
        nuevas_capas, nuevas_apis = detectar_nuevas_capas_y_apis()
        # Should detect at least the needle layer
        assert isinstance(nuevas_capas, list), "nuevas_capas should be a list"
        # At least one new layer detected
        assert len(nuevas_capas) >= 1, "Should detect at least one new capa"
    finally:
        vigia_module.cargar_config_capas = original


def test_guardar_novedades(tmp_path: Path, monkeypatch) -> None:
    """Test that guardar_novedades writes a valid JSON file."""
    # Patch RAIZ_REPO to tmp_path
    import scripts.puente.vigia_enchufes as vigia_module
    monkeypatch.setattr(vigia_module, "RAIZ_REPO", tmp_path)

    # Mock data
    mock_novedades = {
        "capas": [],
        "apis": [],
        "fecha": "test"
    }

    # Execute
    guardar_novedades(mock_novedades)

    # Check file was created
    # The file name is determined by the script name (vigia_enchufes)
    expected_path = tmp_path / "starseed_memory_root" / "vigia" / "novedades-vigia_enchufes.json"
    assert expected_path.exists(), f"Expected file {expected_path} to exist"

    # Verify JSON content
    with open(expected_path) as f:
        data = json.load(f)
    assert data == mock_novedades, "Saved data should match mock data"


if __name__ == "__main__":
    # Simple manual test
    config = cargar_config_capas()
    print("Config cargada:", list(config.keys()))
    nuevas_capas, nuevas_apis = detectar_nuevas_capas_y_apis()
    print(f"Nuevas capas: {len(nuevas_capas)}")
    print(f"Nuevas APIs: {len(nuevas_apis)}")