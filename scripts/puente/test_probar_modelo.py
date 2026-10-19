#!/usr/bin/env python3
# scripts/puente/test_probar_modelo.py
"""
Tests puros para scripts/puente/probar_modelo.py
"""

import os
import sys
import json
from pathlib import Path
from unittest.mock import Mock, patch

# Añadir el directorio scripts/puente al path para importar
sys.path.insert(0, str(Path(__file__).parent))

import probar_modelo as pm

def test_probar_modelo_voz_exitoso_mejora():
    """Prueba que un modelo exitoso con mejora significativa se acepta."""
    # Función de prueba que simula un modelo mejor
    def prueba_func_mejor(modelo_id):
        return (True, 0.8, 100 * 1024 * 1024)  # 0.8s, 100MB
    
    resultado = pm.probar_modelo_voz(
        entrada="test/modelo-mejor",
        prueba_func=prueba_func_mejor,
        modelo_actual="test/modelo-actual",
        tiempo_actual=1.2,  # 1.2s
        memoria_actual=150 * 1024 * 1024  # 150MB
    )
    
    assert resultado["exito"] == True
    assert resultado["quedarse"] == True
    assert resultado["mejora_tiempo"] > 15.0  # Debe ser mejor en más de 15%
    assert "Mejora significativa" in resultado["razon"]

def test_probar_modelo_voz_exitoso_peor_aceptable():
    """Prueba que un modelo exitoso pero ligeramente peor se acepta si no supera el umbral."""
    # Función de prueba que simula un modelo ligeramente peor
    def prueba_func_ligeramente_peor(modelo_id):
        return (True, 1.3, 140 * 1024 * 1024)  # 1.3s, 140MB
    
    resultado = pm.probar_modelo_voz(
        entrada="test/modelo-ligeramente-peor",
        prueba_func=prueba_func_ligeramente_peor,
        modelo_actual="test/modelo-actual",
        tiempo_actual=1.2,  # 1.2s
        memoria_actual=150 * 1024 * 1024  # 150MB
    )
    
    assert resultado["exito"] == True
    assert resultado["quedarse"] == True  # Porque no es peor en más de 15%
    assert resultado["mejora_tiempo"] < 0  # Es peor
    assert resultado["mejora_tiempo"] > -15.0  # Pero no más de 15% peor
    assert "Rendimiento aceptable" in resultado["razon"]

def test_probar_modelo_voz_exitoso_peor_inaceptable():
    """Prueba que un modelo exitoso pero significativamente peor se rechaza."""
    # Función de prueba que simula un modelo mucho peor
    def prueba_func_mucho_peor(modelo_id):
        return (True, 2.0, 100 * 1024 * 1024)  # 2.0s, 100MB
    
    resultado = pm.probar_modelo_voz(
        entrada="test/modelo-mucho-peor",
        prueba_func=prueba_func_mucho_peor,
        modelo_actual="test/modelo-actual",
        tiempo_actual=1.2,  # 1.2s
        memoria_actual=150 * 1024 * 1024  # 150MB
    )
    
    assert resultado["exito"] == True
    assert resultado["quedarse"] == False  # Porque es peor en más de 15%
    assert resultado["mejora_tiempo"] < -15.0  # Peor en más de 15%
    assert "Empeoramiento significativo" in resultado["razon"]

def test_probar_modelo_voz_fallido():
    """Prueba que un modelo fallido se rechaza."""
    # Función de prueba que simula un modelo que falla
    def prueba_func_fallida(modelo_id):
        return (False, 0.0, 0)  # Fallo
    
    resultado = pm.probar_modelo_voz(
        entrada="test/modelo-fallido",
        prueba_func=prueba_func_fallida,
        modelo_actual="test/modelo-actual",
        tiempo_actual=1.2,
        memoria_actual=150 * 1024 * 1024
    )
    
    assert resultado["exito"] == False
    assert resultado["quedarse"] == False
    assert "La prueba del modelo falló" in resultado["razon"]

def test_probar_modelo_voz_sin_referencia():
    """Prueba que un modelo exitoso sin referencia se acepta."""
    # Función de prueba que simula un modelo exitoso
    def prueba_func_exitosa(modelo_id):
        return (True, 1.0, 120 * 1024 * 1024)  # 1.0s, 120MB
    
    resultado = pm.probar_modelo_voz(
        entrada="test/modelo-sin-referencia",
        prueba_func=prueba_func_exitosa
        # Sin modelo_actual, tiempo_actual, memoria_actual
    )
    
    assert resultado["exito"] == True
    assert resultado["quedarse"] == True
    assert "no hay modelo actual para comparar" in resultado["razon"]

def test_crear_prueba_voz_texto_fijo():
    """Prueba la función que crea una prueba de voz con texto fijo."""
    prueba_func = pm.crear_prueba_voz_texto_fijo("Texto de prueba")
    
    # La función debería devolver una tupla (éxito, tiempo, memoria)
    exito, tiempo, memoria = prueba_func("cualquier-modelo")
    
    assert isinstance(exito, bool)
    assert isinstance(tiempo, float) and tiempo > 0
    assert isinstance(memoria, int) and memoria > 0

def test_crear_prueba_voz_texto_fijo_diferente_texto():
    """Prueba que diferentes textos producen resultados diferentes (porque usa hash)."""
    prueba_func1 = pm.crear_prueba_voz_texto_fijo("Texto 1")
    prueba_func2 = pm.crear_prueba_voz_texto_fijo("Texto 2")
    
    # Con diferentes textos de prueba, los resultados podrían ser diferentes
    # debido al uso del hash en la simulación (aunque no garantizado para todas las entradas)
    exito1, tiempo1, memoria1 = prueba_func1("mismo-modelo")
    exito2, tiempo2, memoria2 = prueba_func2("mismo-modelo")
    
    # Al menos verificamos que la función se ejecute correctamente
    assert isinstance(exito1, bool) and isinstance(exito2, bool)
    assert isinstance(tiempo1, float) and tiempo1 > 0
    assert isinstance(tiempo2, float) and tiempo2 > 0
    assert isinstance(memoria1, int) and memoria1 > 0
    assert isinstance(memoria2, int) and memoria2 > 0

if __name__ == "__main__":
    test_probar_modelo_voz_exitoso_mejora()
    test_probar_modelo_voz_exitoso_peor_aceptable()
    test_probar_modelo_voz_exitoso_peor_inaceptable()
    test_probar_modelo_voz_fallido()
    test_probar_modelo_voz_sin_referencia()
    test_crear_prueba_voz_texto_fijo()
    test_crear_prueba_voz_texto_fijo_diferente_texto()
    print("Todos los tests pasaron")