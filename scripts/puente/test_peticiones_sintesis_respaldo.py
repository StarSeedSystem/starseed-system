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
    """Tests for the 08:30 backup synthesis function (to be implemented)."""

    def test_verifica_sintesis_existente_valida(self):
        """Should check if valid synthesis exists for today (>= 4000 chars)."""
        # This test will pass once the backup function is implemented
        # For now, we define the expected behavior
        pass

    def test_ejecuta_respaldo_si_no_hay_sintesis(self):
        """Should run backup if no valid synthesis exists."""
        pass

    def test_incluye_fuentes_base(self):
        """Should include base sources: protocol, video index, resonance network, contacts, Codex, previous synthesis."""
        pass

    def test_incluye_contexto_vivo_dia(self):
        """Should include live context of the day (SIN1116D)."""
        pass

    def test_lanza_3_investigaciones_profundas(self):
        """Should launch 3 deep research add-research on rotating topic."""
        pass

    def test_genera_informe_protocolo_completo(self):
        """Should generate custom report with full protocol + quality rule."""
        pass

    def test_crea_doc_nombre_exacto(self):
        """Should create Doc with exact name in 'Síntesis diarias'."""
        pass

    def test_envia_resumen_chat(self):
        """Should send 1500-3000 char summary to chat."""
        pass

    def test_lanza_multiformato(self):
        """Should then launch multiformat (9 formats)."""
        pass


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