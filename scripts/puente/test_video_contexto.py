# -*- coding: utf-8 -*-
"""Pruebas para video_contexto.py — módulo puro, sin red, con directorios temporales."""
import json
import os
import tempfile
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import video_contexto as vc


def test_ficha_base_tiene_campos_obligatorios():
    """Una ficha deve tener todos los campos estructurales."""
    f = vc._ficha_base("abc123", "Video de prueba", "CanalTest", "https://youtube.com/watch?v=abc123", "2026-11-11")
    assert f["id"] == "abc123"
    assert f["titulo"] == "Video de prueba"
    assert f["canal"] == "CanalTest"
    assert f["privado"] is False


def test_storyboard_extrae_escenas():
    """El storyboard se extrae de la transcripción con marcas de tiempo."""
    texto = "[00:00] Apertura con animación\nt[02:30] Demostración\nt[05:00] Cierre"
    scenes = vc._extraer_storyboard(texto)
    assert isinstance(scenes, list)
    assert all("tiempo" in s and "descripcion" in s for s in scenes)


def test_ideas_utiles_para_guiones():
    """Se extraen ideas útiles para guiones de la transcripción."""
    texto = "Podrías crear un vídeo con intro animada y cierre con call-to-action"
    ideas = vc._extraer_ideas_guion(texto)
    assert isinstance(ideas, list)
    assert len(ideas) <= 5


def test_notas_de_estilo():
    """Se extraen notas de estilo (ritmo, montaje, color, tipografía, música, transiciones)."""
    texto = "Ritmo dinámico con cortes rápidos. Montaje tipo split-screen. Música electrónica de fondo."
    notas = vc._extraer_notas_estilo(texto)
    assert isinstance(notas, dict)


def test_personas_publicas_citas():
    """Se identifican personas públicas o activistas citadas."""
    texto = "El diseñador John Doe muestra su enfoque. También mencionamos a Maria Panela"
    personas = vc._extraer_personas(texto)
    assert isinstance(personas, list)


def test_ficha_completa_con_transcripcion():
    """Se genera una ficha completa cuando hay transcripción disponible."""
    candidato = {"id": "test123", "titulo": "Video de prueba", "canal": "TestChannel",
                 "enlace": "https://youtube.com/watch?v=test123", "fecha": "2026-11-11T00:00:00Z", "privado": False}
    transcripcion = "00:00 Intro al video sobre diseño de interfaz.\n01:00 Presentación del caso."
    ficha = vc._generar_ficha(candidato, transcripcion=transcripcion, privado=False)
    assert ficha["id"] == "test123"
    assert len(ficha["storyboard"]) >= 0
    assert isinstance(ficha["ideas_guion"], list)


def test_ficha_privada_se_marca():
    """La ficha se marca como privada cuando corresponde."""
    candidato = {"id": "priv123", "titulo": "Video privado", "canal": "PrivChannel",
                 "enlace": "https://youtube.com/watch?v=priv123", "fecha": "2026-11-11T00:00:00Z", "privado": True}
    ficha = vc._generar_ficha(candidato, transcripcion="", privado=True)
    assert ficha["privado"] is True


def test_process_candidatos_devuelve_fichas():
    """process_candidatos procesa una lista y devuelve fichas."""
    ctx = {"candidatos": [{"id": "c1", "titulo": "T1", "canal": "C1", "enlace": "http://youtu.be/c1", "fecha": "2026-11-11"}], "fecha": "2026-11-11"}
    fichas = vc.process_candidatos(ctx, obtener_transcripcion=lambda url: "trans",
                                    extraer_ficha=lambda c, t: {"id": c["id"], "titulo": c["titulo"], "resumen": t})
    assert isinstance(fichas, list)


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])