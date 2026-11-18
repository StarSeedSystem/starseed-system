#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_capacidades.py — generación de capacidades.json."""
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_capacidades as mod


def test_generar_capacidades_estructura(tmp_path):
    """generar_capacidades devuelve la estructura completa con todas las capacidades."""
    # Mockear la ruta de salud
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({"detalle": {}}))
    
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    # Verificar estructura principal
    assert "version" in capacidades
    assert "timestamp" in capacidades
    assert "notebooklm" in capacidades
    assert "drive" in capacidades
    assert "docs" in capacidades
    assert "youtube_notebooklm" in capacidades
    assert "higgsfield" in capacidades
    assert "agentes_alcance" in capacidades
    assert "mac_blender" in capacidades
    assert "mac_hyperframes" in capacidades
    assert "enjambre_olas" in capacidades
    assert "mando" in capacidades
    assert "modelos_llm" in capacidades


def test_generar_capacidades_notebooklm_viva(tmp_path):
    """Si NotebookLM está viva, sus capacidades están disponibles."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "notebooklm": {"estado": "viva", "detalle": "ok", "comprobada": "2026-01-01T00:00:00"}
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    nb = capacidades["notebooklm"]
    assert nb["disponible"] is True
    assert nb["estado"] == "viva"
    assert len(nb["formatos"]) == 9


def test_generar_capacidades_notebooklm_caida(tmp_path):
    """Si NotebookLM está caída, formatos vacíos y YouTube requiere NotebookLM."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "notebooklm": {"estado": "caida", "motivo": "auth expired"}
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    nb = capacidades["notebooklm"]
    assert nb["disponible"] is False
    assert nb["formatos"] == []
    
    yt = capacidades["youtube_notebooklm"]
    assert yt["disponible"] is False
    assert yt["estado"] == "requiere_notebooklm"


def test_generar_capacidades_youtube_nblm_caida_nb_viva(tmp_path):
    """Si NotebookLM viva pero YouTube NotebookLM caída, estado sesion_youtube_caida."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "notebooklm": {"estado": "viva", "detalle": "ok", "comprobada": "2026-01-01T00:00:00"},
            "youtube-notebooklm": {"estado": "caida", "motivo": "auth expired"},
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    yt = capacidades["youtube_notebooklm"]
    assert yt["disponible"] is False
    assert yt["estado"] == "sesion_youtube_caida"
    assert yt["detalle"] == "auth expired"
    assert yt["transcripcion"] is False
    assert yt["add_source"] is False


def test_generar_capacidades_drive_docs(tmp_path):
    """Drive y Docs reflejan su estado de salud."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "google-drive": {"estado": "viva", "detalle": "ok"},
            "google-docs": {"estado": "caida", "motivo": "token expired"},
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    assert capacidades["drive"]["disponible"] is True
    assert capacidades["drive"]["archivos"] is True
    assert capacidades["docs"]["disponible"] is False
    assert capacidades["docs"]["documentos"] is False


def test_generar_capacidades_higgsfield_solo_propuesta(tmp_path):
    """Higgsfield siempre tiene solo_propuesta=True."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "higgsfield": {"estado": "viva", "detalle": "ok"}
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    hf = capacidades["higgsfield"]
    assert hf["solo_propuesta"] is True
    assert hf["disponible"] is True


def test_generar_capacidades_agentes_alcance_siempre_disponible(tmp_path):
    """Agentes de alcance siempre disponibles (código local)."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({"detalle": {}}))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    alc = capacidades["agentes_alcance"]
    assert alc["disponible"] is True
    assert alc["estado"] == "vivo"
    assert "investigar_canal_youtube" in alc["funciones"]
    assert "mensaje_pendiente_aprobacion" in alc["funciones"]


def test_generar_capacidades_mac_blender_hyperframes(tmp_path):
    """Blender y HyperFrames solo disponibles si la Mac está viva."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "mac-blender": {"estado": "viva", "detalle": "ok"},
            "mac-hyperframes": {"estado": "caida", "motivo": "Mac dormida"},
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    assert capacidades["mac_blender"]["disponible"] is True
    assert capacidades["mac_blender"]["solo_con_mac_viva"] is True
    assert capacidades["mac_hyperframes"]["disponible"] is False


def test_generar_capacidades_enjambre_olas(tmp_path):
    """enjambre_olas refleja su estado de salud."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "enjambre": {"estado": "viva", "detalle": "ok"},
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    enj = capacidades["enjambre_olas"]
    assert enj["disponible"] is True
    assert enj["estado"] == "viva"
    assert enj["para_codigo"] is True
    assert enj["puertas"] == ["alcance", "cableado", "tsc", "vitest", "revision", "integracion"]


def test_generar_capacidades_mando(tmp_path):
    """mando refleja su estado de salud."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {
            "mando": {"estado": "viva", "detalle": "ok"},
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    m = capacidades["mando"]
    assert m["disponible"] is True
    assert m["estado"] == "viva"
    assert m["genesis_local"] is True
    assert m["puente_ides"] is True


def test_generar_capacidades_modelos_llm_orden(tmp_path):
    """Modelos LLM tienen el orden correcto de rutas."""
    salud_dir = tmp_path / "starseed_memory_root" / "salud"
    salud_dir.mkdir(parents=True)
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({
        "detalle": {},
        "modelos_llm": {
            "ultimo_exito": {"modelo": "minimax-m3.1-flash", "ruta": "nim", "timestamp": "2026-01-01T00:00:00"},
            "fallos_consecutivos": {"gemini-flash": 2}
        }
    }))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": ["gemini-flash", "qwen-2.5"]}))
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.dict(os.environ, {"NIM_KEY": "test", "OPENROUTER_KEY": "test"}, clear=True):
        
        capacidades = mod.generar_capacidades()
    
    modelos = capacidades["modelos_llm"]
    assert modelos["orden_rutas"] == ["freellmapi", "nim", "openrouter_free", "hermes"]
    assert modelos["freellmapi"]["modelos"] == ["gemini-flash", "qwen-2.5"]
    assert modelos["nim"]["disponible"] is True
    assert modelos["openrouter_free"]["disponible"] is True
    assert modelos["fallos_consecutivos"]["gemini-flash"] == 2


def test_main_genera_archivo(tmp_path):
    """main() genera el archivo capacidades.json."""
    salud_dir = tmp_path / "salud"
    salud_dir.mkdir()
    salud_file = salud_dir / "estado.json"
    salud_file.write_text(json.dumps({"detalle": {}}))
    catalogo_file = salud_dir / "catalogo_freellmapi.json"
    catalogo_file.write_text(json.dumps({"modelos": []}))
    
    salida = tmp_path / "capacidades.json"
    
    with patch.object(mod, "SALUD_ESTADO", salud_file), \
         patch.object(mod, "RAIZ_REPO", tmp_path), \
         patch.object(mod, "CAPACIDADES_SALIDA", salida), \
         patch.dict(os.environ, {}, clear=True):
        
        mod.main()
    
    assert salida.exists()
    with open(salida, encoding="utf-8") as f:
        data = json.load(f)
    assert data["version"] == 1
    assert "notebooklm" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])