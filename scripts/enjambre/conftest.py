# -*- coding: utf-8 -*-
"""Fixture hermético (autouse) para aislar EVENTOS, ANON, HERMES y RELEVO."""
import importlib.util
import sys
from pathlib import Path
import pytest

# Ruta al módulo real del orquestador (puede cargarse con nombres distintos).
RUTA_ENJAMBRE = Path(__file__).parent / "starseed-enjambre.py"


@pytest.fixture(autouse=True)
def aislador_hermetico(monkeypatch, tmp_path):
    """Parchea EVENTOS, ANON, HERMES y RELEVO en todo módulo importado como enjambre."""
    # Detecta cualquier módulo en sys.modules cuyo archivo sea el orquestador.
    for nombre, mod in list(sys.modules.items()):
        archivo = getattr(mod, "__file__", None)
        if archivo and str(Path(archivo).resolve()) == str(RUTA_ENJAMBRE.resolve()):
            # Aísla EVENTOS a tmp_path (archivo de eventos falso).
            eventos_falso = tmp_path / "eventos.jsonl"
            eventos_falso.write_text("", encoding="utf-8")
            monkeypatch.setattr(mod, "EVENTOS", str(eventos_falso), raising=False)
            # Aísla ANON: sin clave no hay POST al bus de Supabase.
            monkeypatch.setattr(mod, "ANON", "", raising=False)
            # Aísla HERMES y RELEVO: binario inocuo para evitar lanzamientos reales.
            monkeypatch.setattr(mod, "HERMES", "/usr/bin/true", raising=False)
            monkeypatch.setattr(mod, "RELEVO", "/usr/bin/true", raising=False)
