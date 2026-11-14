#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para sintesis_multiformato.py — sin red, con mocks inyectados."""
import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest

from sintesis_multiformato import (
    AJUSTES,
    ESTADO_PATH,
    FORMATOS,
    _construir_indicaciones,
    _formato_fallido,
    _generar_formato,
    _notebook_titulo,
    _reintentar_formato,
    leer_estado,
    marcar_procesado,
    procesar_sintesis_diaria,
    escribir_estado,
    ya_procesado,
)


@pytest.fixture(autouse=True)
def limpiar_estado():
    """Limpia el archivo de estado antes y después de cada test."""
    if os.path.exists(ESTADO_PATH):
        os.unlink(ESTADO_PATH)
    yield
    if os.path.exists(ESTADO_PATH):
        os.unlink(ESTADO_PATH)


def test_leer_estado_vacio():
    estado = leer_estado()
    assert estado == {"fechas_procesadas": []}


def test_escribir_y_leer_estado():
    escribir_estado({"fechas_procesadas": ["2026-11-13"]})
    estado = leer_estado()
    assert estado["fechas_procesadas"] == ["2026-11-13"]


def test_ya_procesado_falso_inicialmente():
    assert ya_procesado("2026-11-13") is False


def test_marcar_procesado_y_ya_procesado():
    marcar_procesado("2026-11-13")
    assert ya_procesado("2026-11-13") is True


def test_no_repite_marca():
    marcar_procesado("2026-11-13")
    marcar_procesado("2026-11-13")
    estado = leer_estado()
    assert estado["fechas_procesadas"].count("2026-11-13") == 1


def test_notebook_titulo():
    assert _notebook_titulo("2026-11-13") == "Síntesis 2026-11-13"


def test_formatos_lista_completa():
    assert set(FORMATOS) == {
        "report", "audio", "video", "infographic",
        "slide-deck", "mind-map", "quiz", "flashcards", "data-table"
    }


def test_ajustes_tienen_claves_esperadas():
    assert "report" in AJUSTES
    assert "audio" in AJUSTES
    assert AJUSTES["report"]["formato"] == "a medida, detallado"
    assert AJUSTES["audio"]["formato"] == "deep-dive"
    assert AJUSTES["infographic"]["orientacion"] == "vertical"
    assert AJUSTES["infographic"]["detalle"] == "detallada"


def test_construir_indicaciones_report():
    ind = _construir_indicaciones("report", AJUSTES["report"], "Síntesis diaria 2026-11-13")
    assert "informe detallado" in ind.lower()
    assert "2026-11-13" in ind
    assert "recomendaciones" in ind.lower()


def test_construir_indicaciones_audio():
    ind = _construir_indicaciones("audio", AJUSTES["audio"], "Síntesis diaria 2026-11-13")
    assert "conversación" in ind.lower()
    assert "deep-dive" in ind.lower()


def test_construir_indicaciones_video():
    ind = _construir_indicaciones("video", AJUSTES["video"], "Síntesis diaria 2026-11-13")
    assert "vídeo" in ind.lower() or "video" in ind.lower()


def test_construir_indicaciones_infographic():
    ind = _construir_indicaciones("infographic", AJUSTES["infographic"], "Síntesis diaria 2026-11-13")
    assert "infografía" in ind.lower()
    assert "vertical" in ind.lower()


def test_formato_fallido_agrega_al_indice():
    indice: dict[str, Any] = {}
    _formato_fallido(indice, "report", "Error de prueba")
    assert "fallidos" in indice
    assert len(indice["fallidos"]) == 1
    assert indice["fallidos"][0]["tipo"] == "report"
    assert indice["fallidos"][0]["error"] == "Error de prueba"
    assert indice["fallidos"][0]["reintentos"] == 0


def test_generar_formato_llama_lanzar_y_esperar():
    mock_lanzar = MagicMock(return_value="tarea-123")
    mock_esperar = MagicMock(return_value="/tmp/report-multiformato.md")

    ruta = _generar_formato("report", "indicaciones de prueba", "sid-456", mock_lanzar, mock_esperar)

    mock_lanzar.assert_called_once_with("report", "indicaciones de prueba", "sid-456")
    mock_esperar.assert_called_once_with("report", "tarea-123", "multiformato")
    assert ruta == "/tmp/report-multiformato.md"


def test_reintentar_formato_exito_primera_vez():
    mock_lanzar = MagicMock(return_value="tarea-123")
    mock_esperar = MagicMock(return_value="/tmp/report-multiformato.md")

    ruta = _reintentar_formato("report", "ind", "sid", mock_lanzar, mock_esperar, max_reintentos=2)
    assert ruta == "/tmp/report-multiformato.md"
    assert mock_lanzar.call_count == 1


def test_reintentar_formato_falla_tras_reintentos():
    mock_lanzar = MagicMock(side_effect=Exception("Error persistente"))
    mock_esperar = MagicMock()

    with pytest.raises(Exception, match="Error persistente"):
        _reintentar_formato("report", "ind", "sid", mock_lanzar, mock_esperar, max_reintentos=2)
    assert mock_lanzar.call_count == 2


def test_procesar_sintesis_diaria_ya_procesado():
    marcar_procesado("2026-11-13")

    resultado = procesar_sintesis_diaria(fecha="2026-11-13")

    assert resultado["fecha"] == "2026-11-13"
    assert resultado["estado"] == "ya_procesado"
    assert resultado["formatos"] == []


def test_procesar_sintesis_diaria_llama_funciones_inyectadas():
    mock_ultima = MagicMock(return_value=("fid-123", "Síntesis diaria 2026-11-13"))
    mock_asegurar = MagicMock(return_value="sid-456")
    mock_lanzar = MagicMock(return_value="tarea-789")
    mock_esperar = MagicMock(return_value="/tmp/report-multiformato.md")
    mock_enviar = MagicMock()
    mock_subir_espejo = MagicMock(return_value="espejo-ok")
    mock_subir_drive = MagicMock(return_value="drive-id-abc")
    mock_sesion_viva = MagicMock(return_value=True)

    resultado = procesar_sintesis_diaria(
        fecha="2026-11-13",
        ultima_sintesis_fn=mock_ultima,
        asegurar_fuente_fn=mock_asegurar,
        lanzar_fn=mock_lanzar,
        esperar_y_bajar_fn=mock_esperar,
        enviar_resultado_fn=mock_enviar,
        subir_espejo_fn=mock_subir_espejo,
        _subir_a_drive_fn=mock_subir_drive,
        sesion_viva_fn=mock_sesion_viva,
    )

    assert resultado["fecha"] == "2026-11-13"
    assert resultado["estado"] != "ya_procesado"
    assert len(resultado["formatos"]) == len(FORMATOS)
    assert all(f["estado"] == "ok" for f in resultado["formatos"])
    assert mock_ultima.called
    assert mock_asegurar.called
    assert mock_lanzar.call_count == len(FORMATOS)
    assert mock_esperar.call_count == len(FORMATOS)
    assert mock_enviar.call_count == len(FORMATOS)
    assert mock_subir_espejo.call_count == len(FORMATOS)
    assert mock_subir_drive.call_count == len(FORMATOS)


def test_procesar_sintesis_diaria_reintenta_y_marca_fallido():
    mock_ultima = MagicMock(return_value=("fid-123", "Síntesis diaria 2026-11-13"))
    mock_asegurar = MagicMock(return_value="sid-456")
    mock_lanzar = MagicMock(side_effect=Exception("NotebookLM caído"))
    mock_esperar = MagicMock()
    mock_enviar = MagicMock()
    mock_subir_espejo = MagicMock()
    mock_subir_drive = MagicMock()
    mock_sesion_viva = MagicMock(return_value=True)

    resultado = procesar_sintesis_diaria(
        fecha="2026-11-14",
        ultima_sintesis_fn=mock_ultima,
        asegurar_fuente_fn=mock_asegurar,
        lanzar_fn=mock_lanzar,
        esperar_y_bajar_fn=mock_esperar,
        enviar_resultado_fn=mock_enviar,
        subir_espejo_fn=mock_subir_espejo,
        _subir_a_drive_fn=mock_subir_drive,
        sesion_viva_fn=mock_sesion_viva,
    )

    assert resultado["fecha"] == "2026-11-14"
    assert len(resultado["fallidos"]) == len(FORMATOS)
    assert all(f["estado"] == "fallido" for f in resultado["formatos"])
    assert mock_lanzar.call_count == len(FORMATOS) * 3


def test_procesar_sintesis_diaria_no_envia_en_silencio():
    """Verifica que ningún formato se queda sin enviar en silencio: todos aparecen en el índice."""
    mock_ultima = MagicMock(return_value=("fid-123", "Síntesis diaria 2026-11-15"))
    mock_asegurar = MagicMock(return_value="sid-456")
    mock_lanzar = MagicMock(return_value="tarea-789")
    mock_esperar = MagicMock(return_value="/tmp/x.md")
    mock_enviar = MagicMock()
    mock_subir_espejo = MagicMock(return_value="espejo-ok")
    mock_subir_drive = MagicMock(return_value="drive-id")
    mock_sesion_viva = MagicMock(return_value=True)

    resultado = procesar_sintesis_diaria(
        fecha="2026-11-15",
        ultima_sintesis_fn=mock_ultima,
        asegurar_fuente_fn=mock_asegurar,
        lanzar_fn=mock_lanzar,
        esperar_y_bajar_fn=mock_esperar,
        enviar_resultado_fn=mock_enviar,
        subir_espejo_fn=mock_subir_espejo,
        _subir_a_drive_fn=mock_subir_drive,
        sesion_viva_fn=mock_sesion_viva,
    )

    # Todos los formatos deben estar en el índice, ni uno solo ausente
    tipos_en_indice = {f["tipo"] for f in resultado["formatos"]}
    assert tipos_en_indice == set(FORMATOS)

    # Cada formato tiene estado explícito (ok o fallido)
    for f in resultado["formatos"]:
        assert f["estado"] in ("ok", "fallido")


def test_procesar_sintesis_diaria_no_repite_mismo_dia():
    """Segunda llamada el mismo día devuelve ya_procesado sin regenerar."""
    mock_ultima = MagicMock(return_value=("fid-123", "Síntesis diaria 2026-11-16"))
    mock_asegurar = MagicMock(return_value="sid-456")
    mock_lanzar = MagicMock(return_value="tarea-789")
    mock_esperar = MagicMock(return_value="/tmp/x.md")
    mock_enviar = MagicMock()
    mock_subir_espejo = MagicMock(return_value="espejo-ok")
    mock_subir_drive = MagicMock(return_value="drive-id")
    mock_sesion_viva = MagicMock(return_value=True)

    # Primera llamada
    r1 = procesar_sintesis_diaria(
        fecha="2026-11-16",
        ultima_sintesis_fn=mock_ultima,
        asegurar_fuente_fn=mock_asegurar,
        lanzar_fn=mock_lanzar,
        esperar_y_bajar_fn=mock_esperar,
        enviar_resultado_fn=mock_enviar,
        subir_espejo_fn=mock_subir_espejo,
        _subir_a_drive_fn=mock_subir_drive,
        sesion_viva_fn=mock_sesion_viva,
    )

    # Segunda llamada - no debe volver a llamar a las funciones de generación
    r2 = procesar_sintesis_diaria(
        fecha="2026-11-16",
        ultima_sintesis_fn=mock_ultima,
        asegurar_fuente_fn=mock_asegurar,
        lanzar_fn=mock_lanzar,
        esperar_y_bajar_fn=mock_esperar,
        enviar_resultado_fn=mock_enviar,
        subir_espejo_fn=mock_subir_espejo,
        _subir_a_drive_fn=mock_subir_drive,
        sesion_viva_fn=mock_sesion_viva,
    )

    assert r1["fecha"] == "2026-11-16"
    assert r2["estado"] == "ya_procesado"
    assert r2["formatos"] == []
    # Las funciones de generación solo se llamaron en la primera vez
    assert mock_ultima.call_count == 1
    assert mock_asegurar.call_count == 1
    assert mock_lanzar.call_count == len(FORMATOS)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])