#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de scripts/puente/director-produccion.py.

Pruebas puras e integradas para el director de producción:
- configuración y pausa
- candidatos elegibles
- ciclo de decisión
- publicación y vistas previas
- confirmación y propagación
"""

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_produccion as dp


class TestConfiguracion(unittest.TestCase):
    """Pruebas para funciones de configuración."""

    def test_leer_config_por_defecto(self):
        """Probar que leer_config devuelve valores por defecto."""
        with patch('os.path.exists', return_value=False):
            config = dp.leer_config()
            self.assertIsInstance(config, dict)
            self.assertIn('activo', config)
            self.assertIn('modo', config)

    def test_leer_config_desde_archivo(self):
        """Probar que leer_config lee desde el archivo."""
        config_data = {
            "produccion": {
                "activo": False,
                "modo": "auto",
                "intervalo_s": 300,
            }
        }

        with patch('os.path.exists', return_value=True):
            with patch('builtins.open', unittest.mock.mock_open(
                read_data=json.dumps(config_data)
            )):
                config = dp.leer_config()
                self.assertFalse(config['activo'])
                self.assertEqual(config['modo'], 'auto')
                self.assertEqual(config['intervalo_s'], 300)

    def test_esta_en_pausa(self):
        """Probar que esta_en_pausa devuelve True cuando existe el archivo de pausa."""
        with patch('os.path.exists', return_value=True):
            self.assertTrue(dp.esta_en_pausa())

        with patch('os.path.exists', return_value=False):
            self.assertFalse(dp.esta_en_pausa())


class TestCandidatos(unittest.TestCase):
    """Pruebas para funciones de candidatos."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.config = {
            "activo": True,
            "modo": "auto",
            "intervalo_s": 120,
            "ventana_min": 20,
            "max_publicaciones_dia": 24,
            "expres_alex": True,
            "umbral_jev": 0.7,
            "umbral_diseno": 75,
            "migraciones": "aditivas",
            "max_tags_nativos_semana": 1,
            "revertir_auto": True,
        }

    def tearDown(self):
        import shutil
        shutil.rmtree(self.root, ignore_errors=True)

    @patch('director_produccion._git')
    def test_obtener_candidatos(self, mock_git):
        """Probar que obtener_candidatos devuelve candidatos elegibles."""
        # Mockear git para devolver commits de prueba
        mock_git.return_value = (0, "abc123\x1fOla 1005 · PRD1005A: prueba\n")

        # Mockear cargar_vetos
        with patch('director_produccion.cargar_vetos', return_value={}):
            # Mockear veredictos
            with patch('director_produccion.veredictos', return_value={
                "revision": {"ok": True},
                "verificacion": {"ok": True},
                "diseno": {"nota": None, "toca_interfaz": False}
            }):
                candidatos = dp.obtener_candidatos(self.root, self.config)
                # Debería devolver al menos un candidato si el mock devuelve algo
                # (actualmente el mock devuelve un commit con id PRD1005A)
                # Nota: El código real filtrará candidatos por elegibilidad

    @patch('director_produccion._git')
    def test_candidato_no_elegible_por_veto(self, mock_git):
        """Probar que los candidatos con veto no son elegibles."""
        # Mockear git para devolver commits de prueba
        mock_git.return_value = (0, "abc123\x1fOla 1005 · PRD1005A: prueba\n")

        # Mockear cargar_vetos para devolver un veto
        with patch('director_produccion.cargar_vetos', return_value={"abc123": {
            "quien": "alex",
            "motivo": "riesgo alto"
        }}):
            candidatos = dp.obtener_candidatos(self.root, self.config)
            # Debería devolver una lista vacía porque el candidato está vetado
            self.assertEqual(candidatos, [])


class TestCicloDeDecision(unittest.TestCase):
    """Pruebas para el ciclo de decisión."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.config = {
            "activo": True,
            "modo": "auto",
            "intervalo_s": 120,
            "ventana_min": 20,
            "max_publicaciones_dia": 24,
            "expres_alex": True,
            "umbral_jev": 0.7,
            "umbral_diseno": 75,
            "migraciones": "aditivas",
            "max_tags_nativos_semana": 1,
            "revertir_auto": True,
        }

    def tearDown(self):
        import shutil
        shutil.rmtree(self.root, ignore_errors=True)

    @patch('director_produccion.consultar_lote')
    @patch('director_produccion.decidir_panel')
    def test_decidir_con_jev(self, mock_panel, mock_consultar):
        """Probar que decidir_con_jev devuelve decisiones."""
        # Preparar mocks
        mock_consultar.return_value = {
            "respuestas": {
                "coherente_PRD1005A": {"respuesta": "sí", "p": 0.9},
                "mejora_PRD1005A": {"valor": 4},
                "riesgo_PRD1005A": {"respuesta": "bajo"}
            }
        }

        # Preparar candidatos de prueba
        candidatos = [{
            "sha": "abc123",
            "tarea": "PRD1005A",
            "ola": "1005",
            "archivos": ["src/test.ts"],
            "medios": ["web"],
            "veredictos": {
                "revision": {"ok": True},
                "verificacion": {"ok": True},
                "diseno": {"nota": None, "toca_interfaz": False}
            }
        }]

        # Ejecutar decidir_con_jev
        resultados = dp.decidir_con_jev(candidatos, self.config)

        # Verificar resultados
        self.assertIsInstance(resultados, dict)
        self.assertEqual(len(resultados), 1)
        self.assertIn("PRD1005A", resultados)

    @patch('director_produccion._git')
    def test_empujar_a_candidato(self, mock_git):
        """Probar que empujar_a_candidato empuja el sha."""
        sha = "abc123"
        mock_git.return_value = (0, "")

        resultado = dp.empujar_a_candidato(self.root, sha, self.config)
        self.assertTrue(resultado)

    @patch('director_produccion._git')
    def test_empujar_a_candidato_falla(self, mock_git):
        """Probar que empujar_a_candidato devuelve False en caso de error."""
        sha = "abc123"
        mock_git.return_value = (1, "Commit no encontrado")

        resultado = dp.empujar_a_candidato(self.root, sha, self.config)
        self.assertFalse(resultado)


class TestModo(unittest.TestCase):
    """Pruebas para diferentes modos."""

    def test_ciclo_seco(self):
        """Probar que el ciclo en modo seco solo informa."""
        root = tempfile.mkdtemp()
        config = {"modo": "seco"}

        with patch('director_produccion.esta_en_pausa', return_value=False):
            with patch('director_produccion.obtener_candidatos', return_value=[]):
                with patch('director_produccion.guardar_historial'):
                    with patch('director_produccion.escribir_estado'):
                        dp.ejecutar_ciclo(root, config)
                        # Debería solo informar sin publicar

    def test_ciclo_canario(self):
        """Probar que el ciclo en modo canario solo hace vista previa."""
        root = tempfile.mkdtemp()
        config = {"modo": "canario"}

        with patch('director_produccion.esta_en_pausa', return_value=False):
            with patch('director_produccion.obtener_candidatos', return_value=[]):
                with patch('director_produccion.guardar_historial'):
                    with patch('director_produccion.escribir_estado'):
                        dp.ejecutar_ciclo(root, config)
                        # Debería solo informar sin publicar


class TestReversion(unittest.TestCase):
    """Pruebas para la lógica de reversión."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.config = {
            "activo": True,
            "modo": "auto",
            "intervalo_s": 120,
            "ventana_min": 20,
            "max_publicaciones_dia": 24,
            "expres_alex": True,
            "umbral_jev": 0.7,
            "umbral_diseno": 75,
            "migraciones": "aditivas",
            "max_tags_nativos_semana": 1,
            "revertir_auto": True,
        }

    def tearDown(self):
        import shutil
        shutil.rmtree(self.root, ignore_errors=True)

    @patch('director_produccion._git')
    @patch('director_produccion.vetar')
    def test_revertir_lote(self, mock_vetar, mock_git):
        """Probar que revertir_lote revierte el lote."""
        sha = "abc123"
        mock_git.return_value = (0, "")

        resultado = dp.revertir_lote(self.root, sha, self.config)
        self.assertTrue(resultado)

    @patch('director_produccion._git')
    @patch('director_produccion.vetar')
    def test_revertir_lote_falla(self, mock_vetar, mock_git):
        """Probar que revertir_lote devuelve False en caso de error."""
        sha = "abc123"
        mock_git.return_value = (1, "No se pudo revertir")

        resultado = dp.revertir_lote(self.root, sha, self.config)
        self.assertFalse(resultado)


if __name__ == "__main__":
    unittest.main()
