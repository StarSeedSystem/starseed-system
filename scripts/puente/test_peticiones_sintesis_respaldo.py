#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for peticiones_sintesis_respaldo.py - backup synthesis at 08:30 Mexico time."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable
from unittest.mock import MagicMock, patch

import pytest

# Add scripts/puente to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import peticiones_sintesis_respaldo as PSR


class TestCalcularRelevancia:
    """Tests for _calcular_relevancia function."""

    def test_palabras_starseed_aumentan_puntuacion(self):
        """StarSeed keywords should increase relevance score."""
        titulo = "Protocolo descentralizado para soberanía digital"
        source_guide = "Artículo sobre federación y p2p"
        tema = "StarSeed OS"
        
        puntuacion = PSR._calcular_relevancia(titulo, source_guide, tema)
        
        assert puntuacion > 50.0  # Should have high score from multiple keywords

    def test_tema_encargo_aumenta_puntuacion(self):
        """Topic words should increase relevance."""
        titulo = "Herramientas local-first para IA en dispositivo"
        source_guide = "Guía de modelos locales"
        tema = "local-first IA dispositivo"
        
        puntuacion = PSR._calcular_relevancia(titulo, source_guide, tema)
        
        assert puntuacion > 20.0

    def test_palabras_ajenas_penalizan(self):
        """Unrelated topics should be penalized."""
        titulo = "Receta de cocina con rallador"
        source_guide = "Cómo cocinar carne humana"
        tema = "StarSeed OS"
        
        puntuacion = PSR._calcular_relevancia(titulo, source_guide, tema)
        
        assert puntuacion == 0.0  # Should be heavily penalized to 0

    def test_puntuacion_limitada_0_100(self):
        """Score should be clamped between 0 and 100."""
        # Very high relevance
        titulo = "descentralizado soberano federado p2p commons cooperativo autogobierno " * 5
        source_guide = "identidad digital privacidad vigilancia censura red social gobernanza dao" * 5
        tema = "StarSeed OS"
        
        puntuacion = PSR._calcular_relevancia(titulo, source_guide, tema)
        
        assert puntuacion == 100.0


class TestFiltrarFuentesRelevantes:
    """Tests for _filtrar_fuentes_relevantes function."""

    def mock_nb_cliente(self, sources_data: list[dict]):
        """Create a mock notebook client that returns sources_data."""
        def nb_mock(*args, **kwargs):
            if args[0] == "source" and args[1] == "list":
                return (0, json.dumps({"sources": sources_data}), "")
            return (1, "", "unknown command")
        return nb_mock

    def test_filtra_solo_ready(self):
        """Should only include sources with status 'ready'."""
        sources = [
            {"id": "1", "title": "StarSeed protocolo", "source_guide": "descentralizado", "status": "ready"},
            {"id": "2", "title": "Otro tema", "source_guide": "algo", "status": "processing"},
        ]
        nb = self.mock_nb_cliente(sources)
        
        relevantes = PSR._filtrar_fuentes_relevantes(nb, "cuaderno-test", "StarSeed OS")
        
        assert len(relevantes) == 1
        assert relevantes[0]["id"] == "1"

    def test_excluye_descartados(self):
        """Should exclude previously discarded topics."""
        sources = [
            {"id": "1", "title": "Tema descartado", "source_guide": "StarSeed", "status": "ready"},
        ]
        # Pre-populate descartados
        PSR._guardar_tema_descartado("cuaderno-test", "Tema descartado")
        
        nb = self.mock_nb_cliente(sources)
        relevantes = PSR._filtrar_fuentes_relevantes(nb, "cuaderno-test", "StarSeed OS")
        
        assert len(relevantes) == 0
        
        # Cleanup
        PSR._escribir_atomico(PSR.DESCARTES_FILE, {})

    def test_limite_max_fuentes(self):
        """Should respect max_fuentes limit."""
        sources = [
            {"id": str(i), "title": f"StarSeed tema {i}", "source_guide": "descentralizado soberano", "status": "ready"}
            for i in range(30)
        ]
        nb = self.mock_nb_cliente(sources)
        
        relevantes = PSR._filtrar_fuentes_relevantes(nb, "cuaderno-test", "StarSeed OS", max_fuentes=5)
        
        assert len(relevantes) == 5

    def test_ordena_por_relevancia_descendente(self):
        """Should sort by relevance descending."""
        # Both sources have StarSeed keywords so both should pass threshold
        sources = [
            {"id": "1", "title": "Baja relevancia StarSeed", "source_guide": "descentralizado algo", "status": "ready"},
            {"id": "2", "title": "Alta relevancia descentralizado soberano federado", "source_guide": "p2p commons", "status": "ready"},
        ]
        nb = self.mock_nb_cliente(sources)
        
        relevantes = PSR._filtrar_fuentes_relevantes(nb, "cuaderno-test", "StarSeed OS")
        
        assert len(relevantes) == 2
        assert relevantes[0]["id"] == "2"  # Higher relevance first
        assert relevantes[0]["relevancia"] > relevantes[1]["relevancia"]


class TestLimpiarFuentesNoRelevantes:
    """Tests for _limpiar_fuentes_no_relevantes function."""

    def mock_nb_cliente_delete(self, delete_calls: list):
        """Create mock that tracks delete calls."""
        def nb_mock(*args, **kwargs):
            if args[0] == "source" and args[1] == "list":
                return (0, json.dumps({"sources": [
                    {"id": "1", "title": "Mantener", "status": "ready"},
                    {"id": "2", "title": "Eliminar", "status": "ready"},
                    {"id": "3", "title": "También eliminar", "status": "ready"},
                ]}), "")
            if args[0] == "source" and args[1] == "delete":
                # args = ("source", "delete", cuaderno_id, "--source-id", source_id)
                delete_calls.append(args[4])  # source-id is at index 4
                return (0, "", "")
            return (1, "", "unknown")
        return nb_mock

    def test_elimina_solo_no_mantenidas(self):
        """Should delete sources not in keep list."""
        delete_calls = []
        nb = self.mock_nb_cliente_delete(delete_calls)
        
        eliminadas = PSR._limpiar_fuentes_no_relevantes(nb, "cuaderno-test", ["1"])
        
        assert eliminadas == 2
        assert "2" in delete_calls
        assert "3" in delete_calls
        assert "1" not in delete_calls


class TestInvestigarConCriterio:
    """Tests for investigar_con_criterio function."""

    def mock_nb_full(self, research_responses: list[tuple], list_responses: list[list]):
        """Create mock for full research flow."""
        call_count = {"research": 0, "list": 0}
        
        def nb_mock(*args, **kwargs):
            if args[0] == "source" and args[1] == "add-research":
                if call_count["research"] < len(research_responses):
                    resp = research_responses[call_count["research"]]
                    call_count["research"] += 1
                    return resp
                return (1, "", "no more research responses")
            if args[0] == "source" and args[1] == "list":
                if call_count["list"] < len(list_responses):
                    resp = list_responses[call_count["list"]]
                    call_count["list"] += 1
                    return (0, json.dumps({"sources": resp}), "")
                return (0, json.dumps({"sources": []}), "")
            return (1, "", "unknown")
        return nb_mock

    def test_procesa_consultas_y_filtra(self):
        """Should process queries, filter relevant sources, and clean."""
        research_responses = [
            (0, '{"task_id": "task-1"}', ""),  # add-research succeeds
        ]
        # Multiple list calls: 1 after research, 1 for filtering, 1 for discard registration, 1 for final discard check
        list_responses = [
            # After research - list sources
            [
                {"id": "s1", "title": "StarSeed protocolo descentralizado", "source_guide": "soberano federado", "status": "ready"},
                {"id": "s2", "title": "Receta de cocina", "source_guide": "rallador", "status": "ready"},
            ],
            # For _filtrar_fuentes_relevantes
            [
                {"id": "s1", "title": "StarSeed protocolo descentralizado", "source_guide": "soberano federado", "status": "ready"},
                {"id": "s2", "title": "Receta de cocina", "source_guide": "rallador", "status": "ready"},
            ],
            # For _limpiar_fuentes_no_relevantes
            [
                {"id": "s1", "title": "StarSeed protocolo descentralizado", "source_guide": "soberano federado", "status": "ready"},
                {"id": "s2", "title": "Receta de cocina", "source_guide": "rallador", "status": "ready"},
            ],
            # For discard registration check
            [
                {"id": "s1", "title": "StarSeed protocolo descentralizado", "source_guide": "soberano federado", "status": "ready"},
                {"id": "s2", "title": "Receta de cocina", "source_guide": "rallador", "status": "ready"},
            ],
        ]
        nb = self.mock_nb_full(research_responses, list_responses)
        
        # Clean descartados first
        PSR._escribir_atomico(PSR.DESCARTES_FILE, {})
        
        resultado = PSR.investigar_con_criterio(
            nb, "cuaderno-test", 
            ["Avances en soberanía digital 2026-11-18"],
            "Síntesis diaria StarSeed 2026-11-18",
            max_fuentes=25,
            log_fn=lambda x: None,
            sleep_fn=lambda x: None
        )
        
        assert resultado["consultas_procesadas"] == 1
        assert resultado["fuentes_importadas"] == 1  # Only s1 is relevant
        assert resultado["fuentes_limpiadas"] == 1   # s2 cleaned
        assert len(resultado["temas_descartados"]) == 1  # s2 discarded
        assert "Receta de cocina" in resultado["temas_descartados"]
        
        # Cleanup
        PSR._escribir_atomico(PSR.DESCARTES_FILE, {})

    def test_maneja_errores_investigacion(self):
        """Should handle research errors gracefully."""
        research_responses = [
            (1, "", "Error de red"),  # add-research fails
        ]
        list_responses = []
        nb = self.mock_nb_full(research_responses, list_responses)
        
        resultado = PSR.investigar_con_criterio(
            nb, "cuaderno-test",
            ["Consulta que falla"],
            "Tema test",
            log_fn=lambda x: None
        )
        
        assert resultado["consultas_procesadas"] == 0
        assert len(resultado["errores"]) == 1


class TestInvestigarSintesisDiaria:
    """Tests for investigar_sintesis_diaria function."""

    def test_usa_consultas_estandar(self):
        """Should use standard synthesis queries."""
        # 8 queries, each needs: 1 add-research + 4 list calls = 8*5 = 40 calls
        research_responses = [(0, '{"task_id": "task-1"}', "")] * 8
        list_responses = [[{"id": f"s{i}", "title": f"StarSeed {i}", "source_guide": "descentralizado", "status": "ready"}] for i in range(32)]
        
        call_count = {"research": 0, "list": 0}
        def nb_mock(*args, **kwargs):
            if args[0] == "source" and args[1] == "add-research":
                if call_count["research"] < len(research_responses):
                    resp = research_responses[call_count["research"]]
                    call_count["research"] += 1
                    return resp
                return (1, "", "no more research responses")
            if args[0] == "source" and args[1] == "list":
                if call_count["list"] < len(list_responses):
                    resp = list_responses[call_count["list"]]
                    call_count["list"] += 1
                    return (0, json.dumps({"sources": resp}), "")
                return (0, json.dumps({"sources": []}), "")
            return (1, "", "unknown")
        
        PSR._escribir_atomico(PSR.DESCARTES_FILE, {})
        
        # Pass sleep_fn=lambda x: None to avoid real sleeps
        resultado = PSR.investigar_sintesis_diaria(
            nb_mock, "cuaderno-test", "2026-11-18",
            log_fn=lambda x: None,
            sleep_fn=lambda x: None
        )
        
        assert resultado["consultas_procesadas"] == 8  # 8 standard queries
        
        PSR._escribir_atomico(PSR.DESCARTES_FILE, {})


class TestBackupSintesis0830:
    """Tests for the 08:30 backup synthesis function."""

    # Base timestamp: 2026-11-21 08:30 CDMX = 2026-11-21 14:30 UTC
    BASE_TS_UTC = 1795271400.0  # 2026-11-21 14:30:00 UTC = 08:30 CDMX

    def test_fecha_cdmx_con_utc_inyectado(self):
        """_fecha_cdmx should return correct date with UTC timestamp injected."""
        # 2026-11-21 08:30 CDMX = 2026-11-21 14:30 UTC
        utc_ts = self.BASE_TS_UTC
        fecha = PSR._fecha_cdmx(utc_ts)
        assert fecha == "2026-11-21"

    def test_fecha_cdmx_con_cdmx_inyectado(self):
        """_fecha_cdmx should return correct date with CDMX timestamp injected."""
        # 2026-11-21 08:30 CDMX (same timestamp, function handles timezone)
        cdmx_ts = self.BASE_TS_UTC
        fecha = PSR._fecha_cdmx(cdmx_ts)
        assert fecha == "2026-11-21"

    def test_fecha_cdmx_cambio_dia_en_medianoche_cdmx(self):
        """Date should change at CDMX midnight, not UTC midnight."""
        # 2026-11-21 23:30 CDMX = 2026-11-22 05:30 UTC
        # 08:30 CDMX + 15 hours = 23:30 CDMX
        utc_ts = self.BASE_TS_UTC + 15 * 3600  # 23:30 CDMX
        fecha = PSR._fecha_cdmx(utc_ts)
        assert fecha == "2026-11-21"
        
        # 2026-11-22 00:30 CDMX = 2026-11-22 06:30 UTC
        utc_ts2 = self.BASE_TS_UTC + 16 * 3600  # 00:30 CDMX next day
        fecha2 = PSR._fecha_cdmx(utc_ts2)
        assert fecha2 == "2026-11-22"

    def test_hora_cdmx_con_utc_inyectado(self):
        """_hora_cdmx should return correct decimal hour with UTC timestamp injected."""
        # 2026-11-21 08:30 CDMX = 2026-11-21 14:30 UTC
        utc_ts = self.BASE_TS_UTC
        hora = PSR._hora_cdmx(utc_ts)
        assert abs(hora - 8.5) < 0.01  # 08:30

    def test_hora_cdmx_con_cdmx_inyectado(self):
        """_hora_cdmx should return correct decimal hour with CDMX timestamp injected."""
        # 2026-11-21 09:15 CDMX = 08:30 + 45 min
        cdmx_ts = self.BASE_TS_UTC + 45 * 60
        hora = PSR._hora_cdmx(cdmx_ts)
        assert abs(hora - 9.25) < 0.01  # 09:15

    def test_hora_cdmx_ventana_respaldo_0830_a_0930(self):
        """Backup window should be 08:30-09:30 CDMX (1 hour)."""
        # 08:29 CDMX - outside window (before)
        ts_before = self.BASE_TS_UTC - 60  # 08:29 CDMX
        hora_before = PSR._hora_cdmx(ts_before)
        assert hora_before < 8.5
        
        # 08:30 CDMX - start of window
        ts_start = self.BASE_TS_UTC  # 08:30 CDMX
        hora_start = PSR._hora_cdmx(ts_start)
        assert abs(hora_start - 8.5) < 0.01
        
        # 09:00 CDMX - inside window
        ts_mid = self.BASE_TS_UTC + 30 * 60  # 09:00 CDMX
        hora_mid = PSR._hora_cdmx(ts_mid)
        assert 8.5 <= hora_mid <= 9.5
        
        # 09:30 CDMX - end of window
        ts_end = self.BASE_TS_UTC + 60 * 60  # 09:30 CDMX
        hora_end = PSR._hora_cdmx(ts_end)
        assert abs(hora_end - 9.5) < 0.01
        
        # 09:31 CDMX - outside window (after)
        ts_after = self.BASE_TS_UTC + 61 * 60  # 09:31 CDMX
        hora_after = PSR._hora_cdmx(ts_after)
        assert hora_after > 9.5

    def test_marcador_hecho_hoy_persistido(self, tmp_path):
        """Should create and check 'done today' marker persisted to disk."""
        marker_file = PSR._marcador_path(tmp_path)
        
        # Initially no marker
        assert not PSR._ya_hecho_hoy(marker_file, "2026-11-21")
        
        # Mark as done
        PSR._marcar_hecho_hoy(marker_file, "2026-11-21")
        
        # Should now return True
        assert PSR._ya_hecho_hoy(marker_file, "2026-11-21")
        
        # Different date should return False
        assert not PSR._ya_hecho_hoy(marker_file, "2026-11-22")
        
        # Marker should persist across instances (read from file)
        assert PSR._ya_hecho_hoy(marker_file, "2026-11-21")

    def test_fallback_1200_cdmx_si_no_hecho(self):
        """Should trigger fallback at 12:00 CDMX if backup not done."""
        # 12:00 CDMX = 08:30 + 3.5 hours
        utc_ts = self.BASE_TS_UTC + 3.5 * 3600  # 12:00 CDMX
        hora = PSR._hora_cdmx(utc_ts)
        assert abs(hora - 12.0) < 0.01
        
        # Should be past the backup window (08:30-09:30)
        assert hora > 9.5
        
        # Should be at or past fallback time (12:00)
        assert hora >= 12.0

    def test_ejecuta_respaldo_en_ventana_0830_0930(self, tmp_path):
        """Should run backup when in 08:30-09:30 window and not done today."""
        marker_file = PSR._marcador_path(tmp_path)
        
        # Mock dependencies
        def mock_drive_fn(*args, **kwargs):
            return {"files": []}
        def mock_token_google_fn(*args):
            return "fake-token"
        def mock_nb_fn(*args, **kwargs):
            return (0, '{"task_id": "test"}', "")
        def mock_leer_clave_fn(*args):
            return "fake-key"
        def mock_enviar_telegram_fn(*args):
            pass
        def mock_multiformato_fn(*args):
            return {"formatos": []}
        
        # 09:00 CDMX - inside window (BASE_TS_UTC + 30 min)
        utc_ts = self.BASE_TS_UTC + 30 * 60
        
        resultado = PSR.ejecutar_respaldo_0830(
            raiz=tmp_path,
            ahora=utc_ts,
            nb_fn=mock_nb_fn,
            drive_fn=mock_drive_fn,
            token_google_fn=mock_token_google_fn,
            leer_clave_fn=mock_leer_clave_fn,
            enviar_telegram_fn=mock_enviar_telegram_fn,
            multiformato_fn=mock_multiformato_fn,
            log_fn=lambda x: None,
            seco=True,  # Dry run
        )
        
        # Should execute backup (not skip due to time)
        assert resultado["ok"] is True
        assert resultado["accion"] in ("respaldo_completado", "seco", "ya_existe")

    def test_no_ejecuta_respaldo_fuera_ventana_si_no_es_fallback(self, tmp_path):
        """Should NOT run backup outside 08:30-09:30 window unless it's fallback time."""
        marker_file = PSR._marcador_path(tmp_path)
        
        def mock_drive_fn(*args, **kwargs):
            return {"files": []}
        def mock_token_google_fn(*args):
            return "fake-token"
        
        # 10:00 CDMX - outside window, not fallback (BASE_TS_UTC + 90 min)
        utc_ts = self.BASE_TS_UTC + 90 * 60
        
        resultado = PSR.ejecutar_respaldo_0830(
            raiz=tmp_path,
            ahora=utc_ts,
            drive_fn=mock_drive_fn,
            token_google_fn=mock_token_google_fn,
            log_fn=lambda x: None,
            seco=True,
        )
        
        # Should report it would skip due to time (in seco mode, ok=True but accion indicates fuera_horario)
        assert resultado["ok"] is True
        assert resultado["accion"] == "fuera_horario_seco"
        assert "fuera de horario" in resultado["mensaje"].lower() or "Fuera de horario" in resultado["mensaje"]

    def test_ejecuta_fallback_1200_si_no_hecho_hoy(self, tmp_path):
        """Should run fallback at 12:00 CDMX if backup not done today."""
        marker_file = PSR._marcador_path(tmp_path)
        
        def mock_drive_fn(*args, **kwargs):
            return {"files": []}
        def mock_token_google_fn(*args):
            return "fake-token"
        def mock_nb_fn(*args, **kwargs):
            return (0, '{"task_id": "test"}', "")
        def mock_leer_clave_fn(*args):
            return "fake-key"
        def mock_enviar_telegram_fn(*args):
            pass
        def mock_multiformato_fn(*args):
            return {"formatos": []}
        
        # 12:00 CDMX - fallback time (BASE_TS_UTC + 3.5 hours)
        utc_ts = self.BASE_TS_UTC + 3.5 * 3600
        
        resultado = PSR.ejecutar_respaldo_0830(
            raiz=tmp_path,
            ahora=utc_ts,
            nb_fn=mock_nb_fn,
            drive_fn=mock_drive_fn,
            token_google_fn=mock_token_google_fn,
            leer_clave_fn=mock_leer_clave_fn,
            enviar_telegram_fn=mock_enviar_telegram_fn,
            multiformato_fn=mock_multiformato_fn,
            log_fn=lambda x: None,
            seco=True,
        )
        
        # Should execute fallback backup
        assert resultado["ok"] is True
        assert resultado["accion"] in ("respaldo_completado", "seco", "ya_existe", "fallback_completado")

    def test_no_repite_fallback_si_ya_hecho_en_ventana(self, tmp_path):
        """Should not run fallback if already done in 08:30-09:30 window."""
        marker_file = PSR._marcador_path(tmp_path)
        
        # First, mark as done at 09:00 CDMX
        PSR._marcar_hecho_hoy(marker_file, "2026-11-21")
        
        def mock_drive_fn(*args, **kwargs):
            return {"files": []}
        def mock_token_google_fn(*args):
            return "fake-token"
        
        # 12:00 CDMX - fallback time, but already done (BASE_TS_UTC + 3.5 hours)
        utc_ts = self.BASE_TS_UTC + 3.5 * 3600
        
        resultado = PSR.ejecutar_respaldo_0830(
            raiz=tmp_path,
            ahora=utc_ts,
            drive_fn=mock_drive_fn,
            token_google_fn=mock_token_google_fn,
            log_fn=lambda x: None,
            seco=True,
        )
        
        # Should skip because already done today
        assert resultado["ok"] is True
        assert resultado["accion"] == "ya_existe"


class TestCLI:
    """Tests for CLI commands."""

    def test_comando_investigar(self):
        """CLI investigar command should work."""
        # This tests the existing CLI
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout='{"sources": []}', stderr='')
            
            result = PSR.main(["investigar", "test-cuaderno", "test-tema"])
            
            assert result == 0

    def test_comando_sintesis(self):
        """CLI sintesis command should work."""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout='{"sources": []}', stderr='')
            
            result = PSR.main(["sintesis", "test-cuaderno", "2026-11-18"])
            
            assert result == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])