#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para el motor image-to-3dlab del taller de avatares."""

import importlib.util
import os
import sys
import platform
from unittest.mock import patch, MagicMock

# Cargar el módulo directamente para evitar problemas con los guiones en el nombre
spec = importlib.util.spec_from_file_location(
    "image_to_3dlab", 
    os.path.join(os.path.dirname(__file__), "image_to_3dlab.py")
)
image_to_3dlab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(image_to_3dlab)
disponible = image_to_3dlab.disponible
generar = image_to_3dlab.generar


def test_disponible_no_mac():
    """Test que disponible() devuelve False en sistemas que no sean macOS."""
    with patch('platform.system', return_value='Linux'):
        disp, motivo = disponible()
        assert disp is False
        assert "Solo disponible en macOS" in motivo


def test_disponible_no_apple_silicon():
    """Test que disponible() devuelve False en Mac Intel."""
    with patch('platform.system', return_value='Darwin'):
        with patch('platform.machine', return_value='x86_64'):
            disp, motivo = disponible()
            assert disp is False
            assert "Requiere Apple Silicon (ARM64)" in motivo


def test_disponible_memoria_insuficiente():
    """Test que disponible() devuelve False con menos de 32 GB de RAM."""
    with patch('platform.system', return_value='Darwin'):
        with patch('platform.machine', return_value='arm64'):
            with patch('subprocess.run') as mock_run:
                # Simular sysctl hw.memsize devolviendo 16 GB
                mock_result = MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = str(16 * (1024 ** 3))  # 16 GB en bytes
                mock_run.return_value = mock_result
                
                disp, motivo = disponible()
                assert disp is False
                assert "Requiere 32 GB de RAM o más" in motivo
                assert "16.0 GB" in motivo


def test_disponible_memoria_suficiente_no_instalado():
    """Test que disponible() devuelve False cuando tiene los requisitos pero no está instalado."""
    with patch('platform.system', return_value='Darwin'):
        with patch('platform.machine', return_value='arm64'):
            with patch('subprocess.run') as mock_run:
                # Simular sysctl hw.memsize devolviendo 32 GB
                mock_result = MagicMock()
                mock_result.returncode = 0
                mock_result.stdout = str(32 * (1024 ** 3))  # 32 GB en bytes
                mock_run.return_value = mock_result
                
                disp, motivo = disponible()
                assert disp is False
                assert "no instalado" in motivo


def test_generar_no_disponible():
    """Test que generar() devuelve fallo 'no-instalado' cuando no está disponible."""
    # Parchear directamente en el módulo
    with patch.object(image_to_3dlab, 'disponible', return_value=(False, "no-instalado")):
        resultado = generar("/tmp/entrada.png", "/tmp/salida", 1024, False)
        
        assert resultado["ok"] is False
        assert resultado["fallo"] == "no-instalado"
        assert resultado["glb"] is None
        assert resultado["procedencia"] is None


def test_generar_estructura_resultado():
    """Test que generar() devuelve la estructura correcta cuando está disponible."""
    # Parchear directamente en el módulo
    with patch.object(image_to_3dlab, 'disponible', return_value=(True, "disponible")):
        resultado = generar("/tmp/entrada.png", "/tmp/salida", 1024, False)
        
        # Verificar que tiene todas las claves esperadas
        assert "ok" in resultado
        assert "glb" in resultado
        assert "procedencia" in resultado
        assert "fallo" in resultado
        assert "segundos" in resultado
        assert "pico_memoria_gb" in resultado
        
        # Verificar tipos
        assert isinstance(resultado["ok"], bool)
        assert isinstance(resultado["glb"], str) or resultado["glb"] is None
        assert isinstance(resultado["procedencia"], dict) or resultado["procedencia"] is None
        assert resultado["fallo"] is None or isinstance(resultado["fallo"], str)
        assert isinstance(resultado["segundos"], (int, float))
        assert isinstance(resultado["pico_memoria_gb"], (int, float))


if __name__ == "__main__":
    # Ejecutar tests simples si se llama directamente
    test_disponible_no_mac()
    test_disponible_no_apple_silicon()
    test_disponible_memoria_insuficiente()
    test_disponible_memoria_suficiente_no_instalado()
    test_generar_no_disponible()
    test_generar_estructura_resultado()
    print("Todos los tests pasaron")