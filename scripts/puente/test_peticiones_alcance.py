#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_alcance.py — registro, investigación y descarte."""
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_alcance as mod


def test_registrar_alcance_crea_entrada(tmp_path):
    """registrar_alcance crea una entrada en pendientes.json."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        hash_id = mod.registrar_alcance(
            "Analiza este canal",
            "Nick Saraev",
            "https://youtu.be/kM7lnhS_uE8",
            "test"
        )
        
        assert len(hash_id) == 8
        pendientes = mod.obtener_pendientes()
        assert len(pendientes) == 1
        assert pendientes[0]["hash_id"] == hash_id
        assert pendientes[0]["destinatario"] == "Nick Saraev"
        assert pendientes[0]["canal_url"] == "https://youtu.be/kM7lnhS_uE8"
        assert pendientes[0]["estado"] == "investigando"


def test_registrar_alcance_evita_duplicados(tmp_path):
    """registrar_alcance no duplica entradas para la misma URL."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        id1 = mod.registrar_alcance("texto 1", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        id2 = mod.registrar_alcance("texto 2", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        
        assert id1 == id2
        pendientes = mod.obtener_pendientes()
        assert len(pendientes) == 1


def test_obtener_por_id(tmp_path):
    """obtener_por_id devuelve la entrada correcta."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        hash_id = mod.registrar_alcance("texto", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        entrada = mod.obtener_por_id(hash_id)
    
    assert entrada is not None
    assert entrada["hash_id"] == hash_id
    
    # ID inexistente (need patch for this too)
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"):
        assert mod.obtener_por_id("noexiste") is None


def test_actualizar_alcance(tmp_path):
    """actualizar_alcance modifica los campos correctamente."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
         
        hash_id = mod.registrar_alcance("texto", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        ok = mod.actualizar_alcance(hash_id, estado="completado", informe="informe generado")
        
        assert ok is True
        entrada = mod.obtener_por_id(hash_id)
        assert entrada["estado"] == "completado"
        assert entrada["informe"] == "informe generado"
        
        # ID inexistente
        assert mod.actualizar_alcance("noexiste", estado="x") is False


def test_aprobar_rechazar_marcar_enviado(tmp_path):
    """aprobar_alcance, rechazar_alcance, marcar_enviado funcionan."""
    with patch.object(mod, "PENDIENTES_FILE", tmp_path / "pendientes.json"), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        hash_id = mod.registrar_alcance("texto", "dest", "https://youtu.be/kM7lnhS_uE8", "test")
        
        assert mod.aprobar_alcance(hash_id) is True
        assert mod.obtener_por_id(hash_id)["aprobado"] is True
        assert mod.obtener_por_id(hash_id)["estado"] == "aprobado"
        
        # Nuevo para rechazar
        hash_id2 = mod.registrar_alcance("texto2", "dest", "https://youtu.be/abcdefghijk", "test")
        assert mod.rechazar_alcance(hash_id2) is True
        assert mod.obtener_por_id(hash_id2)["aprobado"] is False
        assert mod.obtener_por_id(hash_id2)["estado"] == "rechazado"
        
        # Nuevo para marcar enviado
        hash_id3 = mod.registrar_alcance("texto3", "dest", "https://youtu.be/abcdefghij2", "test")
        assert mod.marcar_enviado(hash_id3) is True
        assert mod.obtener_por_id(hash_id3)["enviado"] is True
        assert mod.obtener_por_id(hash_id3)["estado"] == "enviado"


def test_asegurar_metodo_canal_youtube_crea_archivo(tmp_path):
    """_asegurar_metodo_canal_youtube crea el archivo método si no existe."""
    metodo_file = tmp_path / "metodos" / "canal-youtube.md"
    with patch.object(mod, "CANAL_YOUTUBE_MD", metodo_file), \
         patch.object(mod, "METODOS_DIR", tmp_path / "metodos"):
        
        mod._asegurar_metodo_canal_youtube()
    
    assert metodo_file.exists()
    contenido = metodo_file.read_text(encoding="utf-8")
    assert "ALC-NICK-1116" in contenido
    assert "Método de investigación de un canal para alcance" in contenido
    assert "Nada se envía a terceros sin aprobación" in contenido


def test_extraer_video_id():
    """_extraer_video_id extrae correctamente IDs de varias URLs."""
    assert mod._extraer_video_id("https://youtu.be/kM7lnhS_uE8") == "kM7lnhS_uE8"
    assert mod._extraer_video_id("https://youtube.com/watch?v=kM7lnhS_uE8") == "kM7lnhS_uE8"
    assert mod._extraer_video_id("https://youtube.com/shorts/kM7lnhS_uE8") == "kM7lnhS_uE8"
    assert mod._extraer_video_id("https://example.com") is None


def test_extraer_canal_id():
    """_extraer_canal_id extrae correctamente handles de canal."""
    assert mod._extraer_canal_id("https://youtube.com/@NickSaraev") == "NickSaraev"
    assert mod._extraer_canal_id("https://youtube.com/c/NickSaraev") == "NickSaraev"
    assert mod._extraer_canal_id("https://youtube.com/channel/UC123") == "UC123"
    assert mod._extraer_canal_id("https://example.com") is None


def test_hash_id_deterministico():
    """_hash_id genera el mismo hash para la misma entrada."""
    h1 = mod._hash_id("https://youtu.be/kM7lnhS_uE8")
    h2 = mod._hash_id("https://youtu.be/kM7lnhS_uE8")
    assert h1 == h2
    assert len(h1) == 8


def test_extraer_palabras_clave_descarte():
    """_extraer_palabras_clave_descarte extrae palabras relevantes."""
    texto = "Descarta el tema del rallador de carne humana del cuaderno de producción"
    palabras = mod._extraer_palabras_clave_descarte(texto)
    
    # No debe contener palabras de parada
    assert "descartar" not in [p.lower() for p in palabras]
    assert "tema" not in [p.lower() for p in palabras]
    assert "del" not in [p.lower() for p in palabras]
    assert "cuaderno" not in [p.lower() for p in palabras]
    
    # Debe contener palabras clave
    assert any("rallador" in p.lower() for p in palabras)
    assert any("carne" in p.lower() for p in palabras)
    assert any("humana" in p.lower() for p in palabras)
    assert any("produccion" in p.lower() or "producción" in p.lower() for p in palabras)


def test_leer_guardar_reglas_descarte(tmp_path):
    """_leer_reglas_descarte y _guardar_regla_descarte funcionan."""
    reglas_file = tmp_path / "reglas_descarte.json"
    with patch.object(mod, "REGLAS_FILE", reglas_file):
        # Inicialmente vacía
        reglas = mod._leer_reglas_descarte()
        assert reglas == {"reglas": []}
        
        # Guardar una regla
        mod._guardar_regla_descarte("tema rallador", ["rallador", "carne"], ["sintesis", "produccion"])
        
        reglas = mod._leer_reglas_descarte()
        assert len(reglas["reglas"]) == 1
        assert reglas["reglas"][0]["tema"] == "tema rallador"
        assert reglas["reglas"][0]["palabras_clave"] == ["rallador", "carne"]
        assert reglas["reglas"][0]["cuadernos_afectados"] == ["sintesis", "produccion"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])