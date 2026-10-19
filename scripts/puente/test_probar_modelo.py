#!/usr/bin/env python3
# scripts/puente/test_probar_modelo.py
"""
Tests para probar_modelo.py sin usar red real.
Contrato: architecture/vigia-modelos.md
"""

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

# Añadir el directorio scripts/puente al path para importar
sys.path.insert(0, str(Path(__file__).parent))

from probar_modelo import (
    probar_imagen,
    probar_oiido,
    probar_voz,
    probar_palabra,
    probar_razon,
    probar_reflejo,
    probar_vision,
    probar_incrustaciones,
    probar_audio_musica,
    probar_motores,
    decidir,
    probar_modelo,
    PRUEBAS_POR_AREA
)

def test_probar_imagen():
    exito, tiempo, memoria = probar_imagen("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_oiido():
    exito, tiempo, memoria = probar_oiido("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_voz():
    exito, tiempo, memoria = probar_voz("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_palabra():
    exito, tiempo, memoria = probar_palabra("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_razon():
    exito, tiempo, memoria = probar_razon("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_reflejo():
    exito, tiempo, memoria = probar_reflejo("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_vision():
    exito, tiempo, memoria = probar_vision("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_incrustaciones():
    exito, tiempo, memoria = probar_incrustaciones("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_audio_musica():
    exito, tiempo, memoria = probar_audio_musica("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0
def test_probar_motores():
    exito, tiempo, memoria = probar_motores("ruta/falsa")
    assert exito == True and isinstance(tiempo, float) and tiempo > 0 and isinstance(memoria, int) and memoria > 0

def test_decidir_capacidad_nueva():
    assert decidir(10.0, 100000, 5.0, 50000, True)

def test_decidir_sin_actual():
    assert decidir(2.0, 20000, 0.0, 0)
    assert not decidir(0.0, 0, 0.0, 0)

def test_decidir_peor_tiempo():
    assert not decidir(12.0, 10000, 10.0, 10000)
    assert decidir(11.0, 10000, 10.0, 10000)

def test_decidir_peor_memoria():
    assert not decidir(10.0, 12000, 10.0, 10000)
    assert decidir(10.0, 11000, 10.0, 10000)

def test_decidir_mejor():
    assert decidir(8.0, 8000, 10.0, 10000)
    assert decidir(10.0, 10000, 10.0, 10000)

def test_probar_modelo_sin_actual():
    with tempfile.TemporaryDirectory() as tmp_dir:
        modelo_path = os.path.join(tmp_dir, "modelo")
        Path(modelo_path).touch()
        resultado = probar_modelo(
            entrada="test/imagen",
            area="imagen",
            modelo_path=modelo_path,
            modelo_actual_path=None,
            capacidad_nueva=False
        )
        assert resultado == True

if __name__ == "__main__":
    test_probar_imagen()
    test_probar_oiido()
    test_probar_voz()
    test_probar_palabra()
    test_probar_razon()
    test_probar_reflejo()
    test_probar_vision()
    test_probar_incrustaciones()
    test_probar_audio_musica()
    test_probar_motores()
    test_decidir_capacidad_nueva()
    test_decidir_sin_actual()
    test_decidir_peor_tiempo()
    test_decidir_peor_memoria()
    test_decidir_mejor()
    test_probar_modelo_sin_actual()
    print("Todos los tests pasaron")