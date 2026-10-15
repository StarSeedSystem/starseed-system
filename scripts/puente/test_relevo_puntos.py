#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for relevo_puntos module."""

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# Import the module to test
try:
    from scripts.puente import relevo_puntos
except ImportError:
    # If the module doesn't exist yet, we'll skip the tests
    relevo_puntos = None


class TestRelevoPuntos(unittest.TestCase):
    """Test cases for relevo_puntos module."""

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_devuelve_ramas_pendientes_correctamente(self):
        puntos = {
            "t1": {"rama": "ola/A1", "sha": "abc123", "t": 1000.0},
            "t2": {"rama": "ola/B2", "sha": "def456", "t": 1100.0},
            "t3": {"rama": "main", "sha": "xyz789", "t": 1200.0},  # No es ola/*
            "t4": {"rama": "ola/C3", "sha": None, "t": 1300.0},   # Sha nulo
        }
        enviados = {
            "ola/A1": "abc123",  # Ya enviado, mismo sha
            "ola/B2": "sha-antiguo",  # Sha diferente, debería enviarse
            # ola/C3 no está en enviados, pero su sha es nulo, no debería enviarse
        }
        resultado = relevo_puntos.por_enviar(puntos, enviados)
        self.assertEqual(resultado, ["ola/B2"])

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_devuelve_lista_vacia_si_no_hay_pendientes(self):
        puntos = {
            "t1": {"rama": "ola/A1", "sha": "abc123", "t": 1000.0},
        }
        enviados = {
            "ola/A1": "abc123",
        }
        resultado = relevo_puntos.por_enviar(puntos, enviados)
        self.assertEqual(resultado, [])

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_ignora_ramas_no_ola(self):
        puntos = {
            "t1": {"rama": "main", "sha": "abc123", "t": 1000.0},
            "t2": {"rama": "feature/xyz", "sha": "def456", "t": 1100.0},
        }
        enviados = {}
        resultado = relevo_puntos.por_enviar(puntos, enviados)
        self.assertEqual(resultado, [])

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_retorna_error_si_no_hay_puntos(self):
        with patch('scripts.puente.relevo_puntos._leer_json') as mock_leer_json:
            mock_leer_json.return_value = {}
            resultado = relevo_puntos.enviar_puntos()
            self.assertFalse(resultado["ok"])
            self.assertEqual(resultado["motivo"], "no hay puntos de control")

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_retorna_no_si_nada_que_enviar(self):
        with patch('scripts.puente.relevo_puntos._leer_json') as mock_leer_json:
            mock_leer_json.side_effect = [
                {"t1": {"rama": "ola/A1", "sha": "abc123", "t": 1000.0}},  # puntos
                {"ola/A1": "abc123"}  # enviados
            ]
            resultado = relevo_puntos.enviar_puntos()
            self.assertTrue(resultado["ok"])
            self.assertEqual(resultado["no"], "nada que enviar")

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_envia_rama_cuando_es_necesario_y_cabe(self):
        # Puntos: una rama que necesita ser enviada
        with patch('scripts.puente.relevo_puntos._leer_json') as mock_leer_json:
            mock_leer_json.side_effect = [
                {"t1": {"rama": "ola/A1", "sha": "nuevo-sha", "t": 1000.0}},  # puntos
                {}  # enviados (vacío)
            ]
            
            # Crear un archivo temporal para simular el bundle
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.bundle') as temp_bundle:
                temp_bundle.write(b"contenido ficticio del bundle")
                temp_bundle_path = temp_bundle.name
                
                try:
                    # Mock de _crear_pakete para retornar la ruta del archivo temporal
                    with patch('scripts.puente.relevo_puntos._crear_pakete') as mock_crear_pakete:
                        mock_crear_pakete.return_value = temp_bundle_path
                        with patch('scripts.puente.relevo_puntos._tamano_mb') as mock_tamano_mb:
                            mock_tamano_mb.return_value = 5.0  # 5 MB, dentro del tope de 20 MB
                            with patch('scripts.puente.relevo_puntos._oracle_nodo') as mock_oracle_nodo:
                                mock_oracle_nodo._ssh_bytes = MagicMock()
                                with patch('scripts.puente.relevo_puntos._escribir_json') as mock_escribir_json:
                                    resultado = relevo_puntos.enviar_puntos()
                                    
                                    self.assertTrue(resultado["ok"])
                                    self.assertEqual(resultado["enviadas"], 1)
                                    self.assertEqual(resultado["ramas"], ["ola/A1"])
                                    mock_oracle_nodo._ssh_bytes.assert_called_once()
                                    # Verificar que se actualizó el registro de enviados
                                    mock_escribir_json.assert_called_once()
                                    args, _ = mock_escribir_json.call_args
                                    self.assertEqual(args[0], relevo_puntos.RELEVO_ENVIADOS)
                                    enviados_actuales = args[1]
                                    self.assertEqual(enviados_actuales.get("ola/A1"), "nuevo-sha")
                finally:
                    # Limpiar el archivo temporal
                    if os.path.exists(temp_bundle_path):
                        os.unlink(temp_bundle_path)

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_respeto_tope_tamano_envia_mas_recientes_primero(self):
        # Puntos: tres ramas con timestamps diferentes
        puntos_mock = {
            "t1": {"rama": "ola/A1", "sha": "sha1", "t": 1000.0},      # Más antiguo
            "t2": {"rama": "ola/B2", "sha": "sha2", "t": 2000.0},      # Medio
            "t3": {"rama": "ola/C3", "sha": "sha3", "t": 3000.0},      # Más reciente
        }
        with patch('scripts.puente.relevo_puntos._leer_json') as mock_leer_json:
            mock_leer_json.side_effect = [
                puntos_mock,  # puntos
                {}            # enviados
            ]
            
            # Crear archivos temporales para simular los bundles
            temp_bundles = []
            try:
                # Simular que solo caben las dos más recientes en el paquete
                def crear_pakete_side_effect(ramas, *args, **kwargs):
                    # Crear un archivo temporal para este llamado
                    with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.bundle') as f:
                        f.write(b"contenido ficticio del bundle")
                        temp_bundle_path = f.name
                    temp_bundles.append(temp_bundle_path)
                    # Simular tamaño basado en número de ramas (simplificado)
                    if len(ramas) <= 2:
                        return temp_bundle_path
                    return None  # Más de 2 ramas supera el tope
                
                with patch('scripts.puente.relevo_puntos._crear_pakete') as mock_crear_pakete:
                    mock_crear_pakete.side_effect = crear_pakete_side_effect
                    with patch('scripts.puente.relevo_puntos._tamano_mb') as mock_tamano_mb:
                        mock_tamano_mb.return_value = 15.0  # Siempre dentro del tope cuando se llama con <=2 ramas
                        with patch('scripts.puente.relevo_puntos._oracle_nodo') as mock_oracle_nodo:
                            mock_oracle_nodo._ssh_bytes = MagicMock()
                            with patch('scripts.puente.relevo_puntos._escribir_json') as mock_escribir_json:
                                resultado = relevo_puntos.enviar_puntos()
                                
                                self.assertTrue(resultado["ok"])
                                self.assertEqual(resultado["enviadas"], 2)
                                # Debería enviar las más recientes: C3 y B2 (en ese orden por el sorting)
                                self.assertEqual(set(resultado["ramas"]), {"ola/B2", "ola/C3"})
                                # Verificar que se intentó crear bundle con las ramas correctas
                                mock_crear_pakete.assert_any_call(["ola/C3", "ola/B2"])
            finally:
                # Limpiar los archivos temporales
                for path in temp_bundles:
                    if os.path.exists(path):
                        os.unlink(path)

    @unittest.skipIf(relevo_puntos is None, "relevo_puntos module not available")
    def test_mantiene_enviados_previos_y_añade_nuevos(self):
        puntos_mock = {
            "t1": {"rama": "ola/A1", "sha": "sha1", "t": 1000.0},
            "t2": {"rama": "ola/B2", "sha": "sha2", "t": 2000.0},
        }
        enviados_iniciales = {
            "ola/A1": "sha1",  # Ya enviado
            "ola/X9": "sha-x"  # Otra rama enviada previamente
        }
        with patch('scripts.puente.relevo_puntos._leer_json') as mock_leer_json:
            mock_leer_json.side_effect = [
                puntos_mock,      # puntos
                enviados_iniciales  # enviados
            ]
            # Crear un archivo temporal para simular el bundle
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.bundle') as temp_bundle:
                temp_bundle.write(b"contenido ficticio del bundle")
                temp_bundle_path = temp_bundle.name
                
                try:
                    with patch('scripts.puente.relevo_puntos._crear_pakete') as mock_crear_pakete:
                        mock_crear_pakete.return_value = temp_bundle_path
                        with patch('scripts.puente.relevo_puntos._tamano_mb') as mock_tamano_mb:
                            mock_tamano_mb.return_value = 5.0
                            with patch('scripts.puente.relevo_puntos._oracle_nodo') as mock_oracle_nodo:
                                mock_oracle_nodo._ssh_bytes = MagicMock()
                                with patch('scripts.puente.relevo_puntos._escribir_json') as mock_escribir_json:
                                    resultado = relevo_puntos.enviar_puntos()
                                    
                                    self.assertTrue(resultado["ok"])
                                    # Verificar que el registro final incluye tanto los enviados previos como los nuevos
                                    mock_escribir_json.assert_called_once()
                                    args, _ = mock_escribir_json.call_args
                                    enviados_finales = args[1]
                                    self.assertEqual(enviados_finales.get("ola/A1"), "sha1")  # Previo mantenido
                                    self.assertEqual(enviados_finales.get("ola/B2"), "sha2")  # Nuevo añadido
                                    self.assertEqual(enviados_finales.get("ola/X9"), "sha-x")  # Otro previo mantenido
                finally:
                    # Limpiar el archivo temporal
                    if os.path.exists(temp_bundle_path):
                        os.unlink(temp_bundle_path)


if __name__ == '__main__':
    unittest.main()