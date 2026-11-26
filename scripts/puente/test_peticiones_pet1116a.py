#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para PET1116A: notificación a Genesis del reemplazo del enrutador de modelos."""
import json
import os
import sys
import tempfile
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_telegram as mod
from peticiones_telegram import (
    subir,
    ENV,
    _puente_instancia,
)


def test_subir_notifica_genesis_sobre_reemplazo_enrutador(tmp_path, monkeypatch):
    """subir() envía notificación a Genesis cuando se completa el reemplazo del enrutador PET1116A."""
    # Configurar entorno
    monkeypatch.setenv("STARSEED_PUERTA_FICHA_GENESIS_A1", "test-ficha")
    monkeypatch.setenv("PUERTA_DATOS_URL", "http://localhost:9002")

    # Mock de urllib.request.urlopen
    responses = []
    def mock_urlopen(req, timeout=10):
        responses.append({
            "url": req.full_url,
            "data": req.data.decode() if req.data else None,
            "headers": dict(req.headers),
        })
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = lambda s, *a: None
        return mock_resp

    with patch("urllib.request.urlopen", mock_urlopen):
        resultado = subir("/ruta/ficticia", "PET1116A: enrutador de modelos reemplazado")

    assert resultado == "espejo-ok"
    assert len(responses) == 1
    resp = responses[0]
    assert resp["url"] == "http://localhost:9002/v1/genesis/chats/espejo"
    assert resp["headers"]["Authorization"] == "Bearer test-ficha"
    # Headers pueden venir con diferentes casos
    content_type = None
    for k, v in resp["headers"].items():
        if k.lower() == "content-type":
            content_type = v
            break
    assert content_type == "application/json"

    data = json.loads(resp["data"])
    assert data["fuente"] == "puente:peticiones"
    assert len(data["registros"]) == 1
    registro = data["registros"][0]
    assert registro["de"] == "peticiones-a1"
    assert registro["rol"] == "sistema"
    assert registro["tipo"] == "respuesta"
    assert registro["canal"] == "mando"
    assert "PET1116A" in registro["texto"]
    assert "enrutador de modelos reemplazado" in registro["texto"]


def test_subir_usa_puente_instancia_si_disponible(monkeypatch):
    """subir() usa _puente_instancia.subir_espejo si está disponible."""
    mock_puente = MagicMock()
    mock_puente.subir_espejo.return_value = "espejo-ok"

    # Guardar original y establecer mock
    original_puente = mod._puente_instancia
    mod._puente_instancia = mock_puente

    try:
        resultado = subir("/ruta/ficticia", "PET1116A: enrutador de modelos reemplazado")
        assert resultado == "espejo-ok"
        mock_puente.subir_espejo.assert_called_once_with("Archivo listo: PET1116A: enrutador de modelos reemplazado")
    finally:
        mod._puente_instancia = original_puente


def test_subir_falla_gracefully_si_sin_config(monkeypatch):
    """subir() devuelve 'espejo-sin-puente' si no hay configuración de Genesis."""
    monkeypatch.delenv("STARSEED_PUERTA_FICHA_GENESIS_A1", raising=False)
    monkeypatch.delenv("PUERTA_DATOS_URL", raising=False)

    # Asegurar que _puente_instancia es None
    original_puente = mod._puente_instancia
    mod._puente_instancia = None

    try:
        resultado = subir("/ruta/ficticia", "PET1116A: enrutador de modelos reemplazado")
        assert resultado == "espejo-sin-puente"
    finally:
        mod._puente_instancia = original_puente


def test_subir_falla_gracefully_si_urlopen_falla(monkeypatch):
    """subir() devuelve 'espejo-sin-puente' si la petición HTTP falla."""
    monkeypatch.setenv("STARSEED_PUERTA_FICHA_GENESIS_A1", "test-ficha")
    monkeypatch.setenv("PUERTA_DATOS_URL", "http://localhost:9002")

    def mock_urlopen_fail(req, timeout=10):
        raise Exception("Connection refused")

    original_puente = mod._puente_instancia
    mod._puente_instancia = None

    try:
        with patch("urllib.request.urlopen", mock_urlopen_fail):
            resultado = subir("/ruta/ficticia", "PET1116A: enrutador de modelos reemplazado")
        assert resultado == "espejo-sin-puente"
    finally:
        mod._puente_instancia = original_puente


def test_notificacion_pet1116a_incluye_info_clave(tmp_path, monkeypatch):
    """La notificación PET1116A incluye información clave: rutas, catálogo vivo, salud compartida."""
    monkeypatch.setenv("STARSEED_PUERTA_FICHA_GENESIS_A1", "test-ficha")
    monkeypatch.setenv("PUERTA_DATOS_URL", "http://localhost:9002")

    responses = []
    def mock_urlopen(req, timeout=10):
        responses.append(req.data.decode() if req.data else None)
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = lambda s, *a: None
        return mock_resp

    with patch("urllib.request.urlopen", mock_urlopen):
        subir("/ruta/ficticia", "PET1116A: enrutador de modelos con catálogo vivo FreeLLMAPI, NIM, OpenRouter :free, Hermes y salud compartida")

    assert len(responses) == 1
    data = json.loads(responses[0])
    registro = data["registros"][0]
    texto = registro["texto"]
    assert "PET1116A" in texto
    assert "catálogo vivo" in texto or "FreeLLMAPI" in texto
    assert "NIM" in texto or "OpenRouter" in texto or "Hermes" in texto
    assert "salud" in texto.lower() or "compartida" in texto.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])