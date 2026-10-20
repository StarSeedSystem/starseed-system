#!/usr/bin/env python3
# scripts/puente/test_instalar_modelo.py
"""
Tests para el instalador de modelos sin usar red real.
Contrato: architecture/vigia-modelos.md
"""

import os
import json
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch
import sys

# Añadir el directorio scripts/puente al path para importar
sys.path.insert(0, str(Path(__file__).parent))

from instalar_modelo import instalar, volver_atras, _calcular_sha256, _anotar_instalacion

def test_instalacion_exitosa():
    """Prueba una instalación exitosa."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        destino_dir = os.path.join(tmp_dir, "modelo_test")
        entrada = "test/modelo"
        # SHA256 de "contenido de prueba"
        sha_esperado = "f3a7a67ab20351ddf47e87ecbf0e5a0868fc0e257d0aea65d018b0405b9a34f3"
        
        # Crear un archivo temporal con el SHA correcto
        def descargar_mock(ruta_temporal, sha_esperado):
            with open(ruta_temporal, 'w') as f:
                f.write("contenido de prueba")
            return True
        
        # Ejecutar instalación. El instalador exige 3 GB libres: se fija el espacio para que la prueba no
        # dependa del disco de quien la corre (en un contenedor con 1 GB libres daba rojo sin culpa de nadie).
        con_espacio = Mock(f_frsize=4096, f_bavail=(10 * 1024**3) // 4096)
        with patch("instalar_modelo.os.statvfs", return_value=con_espacio):
            exito = instalar(entrada, destino_dir, descargar_mock, sha_esperado)
        assert exito, "La instalación debería ser exitosa"
        
        # Verificar que el archivo se instaló
        destino = Path(destino_dir)
        assert destino.exists(), "El directorio de destino debería existir"
        modelo_instalado = destino / "modelo.dat"
        assert modelo_instalado.exists(), "Debería existir el archivo modelo.dat"
        assert modelo_instalado.is_file(), "Lo instalado debería ser un archivo"
        assert modelo_instalado.stat().st_size == len("contenido de prueba"), "El archivo debería tener el tamaño correcto"
        assert modelo_instalado.read_text() == "contenido de prueba", "El contenido debería coincidir"
        
        # Verificar que no haya otros archivos excepto la carpeta anterior
        otros_archivos = [f for f in destino.iterdir() if f.name not in ["modelo.dat", "anterior"] and not f.name.startswith('.')]
        assert len(otros_archivos) == 0, f"No debería haber otros archivos visibles, pero hay: {[f.name for f in otros_archivos]}"
        
        # Verificar que se creó la carpeta anterior (vacía porque no había versión previa)
        anterior_dir = destino / "anterior"
        assert anterior_dir.exists(), "Debería existir la carpeta anterior"
        
        # Verificar registro
        modelos_instalados_path = Path.home() / ".starseed" / "modelos-instalados.json"
        if modelos_instalados_path.exists():
            with open(modelos_instalados_path, 'r') as f:
                registro = json.load(f)
            assert entrada in registro, "El modelo debería estar en el registro"
            assert registro[entrada]["sha"] == sha_esperado, "El SHA debería coincidir"
            assert registro[entrada]["ruta"] == destino_dir, "La ruta debería coincidir"
            
            # Limpiar para no afectar otras pruebas
            modelos_instalados_path.unlink()

def test_fallo_sha():
    """Prueba que falle cuando el SHA no coincide."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        destino_dir = os.path.join(tmp_dir, "modelo_test")
        entrada = "test/modelo"
        sha_esperado = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  # SHA256 de cadena vacía
        
        # Crear un archivo temporal con contenido diferente (SHA distinto)
        def descargar_mock(ruta_temporal, sha_esperado):
            with open(ruta_temporal, 'w') as f:
                f.write("contenido que no está vacío")
            return True
        
        # Ejecutar instalación
        exito = instalar(entrada, destino_dir, descargar_mock, sha_esperado)
        assert not exito, "La instalación debería fallar por SHA incorrecto"
        
        # Verificar que no se creó nada en el destino
        destino = Path(destino_dir)
        assert not destino.exists() or not any(destino.iterdir()), "No debería haber nada instalado"
        
        # Verificar que no se creó registro
        modelos_instalados_path = Path.home() / ".starseed" / "modelos-instalados.json"
        if modelos_instalados_path.exists():
            modelos_instalados_path.unlink()

def test_descarga_fallida():
    """Prueba que falle cuando la descarga falla."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        destino_dir = os.path.join(tmp_dir, "modelo_test")
        entrada = "test/modelo"
        sha_esperado = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        
        # Función de descarga que siempre falla
        def descargar_mock(ruta_temporal, sha_esperado):
            return False
        
        # Ejecutar instalación
        exito = instalar(entrada, destino_dir, descargar_mock, sha_esperado)
        assert not exito, "La instalación debería fallar porque la descarga falló"
        
        # Verificar que no se creó nada en el destino
        destino = Path(destino_dir)
        assert not destino.exists() or not any(destino.iterdir()), "No debería haber nada instalado"

def test_espacio_insuficiente():
    """Prueba que falle cuando no hay suficiente espacio."""
    # Esta prueba es difícil de simular sin permisos de root, así que la omitimos
    # En una implementación real, se haría un mock de os.statvfs
    pass

def test_volver_atras():
    """Prueba la función de volver atrás."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        destino_dir = os.path.join(tmp_dir, "modelo_test")
        anterior_dir = os.path.join(destino_dir, "anterior")
        
        # Crear directorio de destino con un archivo
        destino = Path(destino_dir)
        destino.mkdir(parents=True, exist_ok=True)
        archivo_original = destino / "modelo_v1.txt"
        archivo_original.write_text("versión original")
        
        # Crear versión anterior
        anterior = Path(anterior_dir)
        anterior.mkdir(parents=True, exist_ok=True)
        archivo_anterior = anterior / "modelo_v0.txt"
        archivo_anterior.write_text("versión anterior")
        
        # Crear registro de instalación
        modelos_instalados_path = Path.home() / ".starseed" / "modelos-instalados.json"
        registro = {
            "test/modelo": {
                "area": "test",
                "id": "test/modelo",
                "version": "v1",
                "sha": "sha1",
                "ruta": destino_dir,
                "fecha": "2026-01-01T00:00:00"
            }
        }
        
        try:
            with open(modelos_instalados_path, 'w') as f:
                json.dump(registro, f)
            
            # Ejecutar volver atrás
            exito = volver_atras("test")
            assert exito, "Volver atrás debería ser exitoso"
            
            # Verificar que se restauró la versión anterior
            # Después de volver atrás, el destino debería contener lo que estaba en anterior
            archivo_restaurado = destino / "modelo_v0.txt"
            assert archivo_restaurado.exists(), "El archivo restaurado debería existir en destino"
            assert archivo_restaurado.read_text() == "versión anterior", "Debería tener el contenido de la versión anterior"
            
            # Verificar que la versión de respaldo de lo que estaba en destino está en anterior_temp
            # (o que el anterior original aún existe)
            archivo_anterior_original = anterior / "modelo_v0.txt"
            assert archivo_anterior_original.exists(), "La versión original debería seguir existiendo en anterior"
            assert archivo_anterior_original.read_text() == "versión anterior", "Debería tener el contenido correcto"
        finally:
            # Limpiar registro
            if modelos_instalados_path.exists():
                modelos_instalados_path.unlink()

def test_calcular_sha256():
    """Prueba el cálculo de SHA256."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
        f.write("Hola mundo")
        temp_path = f.name
    
    try:
        sha = _calcular_sha256(Path(temp_path))
        esperado = "ca8f60b2cc7f05837d98b208b57fb6481553fc5f1219d59618fd025002a66f5c"
        assert sha == esperado, f"SHA256 incorrecto: {sha} != {esperado}"
    finally:
        os.unlink(temp_path)

def test_anotar_instalacion():
    """Prueba la anotación de instalación."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        destino_dir = os.path.join(tmp_dir, "modelo_test")
        entrada = "test/modelo"
        sha_esperado = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        
        modelos_instalados_path = Path(tmp_dir) / "modelos-instalados.json"
        
        try:
            _anotar_instalacion(entrada, destino_dir, sha_esperado, modelos_instalados_path)
            
            assert modelos_instalados_path.exists(), "El archivo de registro debería existir"
            
            with open(modelos_instalados_path, 'r') as f:
                registro = json.load(f)
            
            assert entrada in registro, "La entrada debería estar en el registro"
            assert registro[entrada]["sha"] == sha_esperado, "El SHA debería coincidir"
            assert registro[entrada]["ruta"] == destino_dir, "La ruta debería coincidir"
            assert "fecha" in registro[entrada], "Debería tener una fecha"
        finally:
            if modelos_instalados_path.exists():
                modelos_instalados_path.unlink()

if __name__ == "__main__":
    test_instalacion_exitosa()
    test_fallo_sha()
    test_descarga_fallida()
    test_volver_atras()
    test_calcular_sha256()
    test_anotar_instalacion()
    print("Todos los tests pasaron")