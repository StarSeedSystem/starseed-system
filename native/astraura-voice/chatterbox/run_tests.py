#!/usr/bin/env python3
"""
Ejecutor simple de pruebas para el servicio Chatterbox.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from test_servidor import *

def run_test(test_func):
    """Ejecuta una prueba y reporta el resultado."""
    try:
        test_func()
        print(f"✓ {test_func.__name__}")
        return True
    except Exception as e:
        print(f"✗ {test_func.__name__}: {e}")
        return False

def main():
    """Ejecuta todas las pruebas."""
    print("Ejecutando pruebas del servicio Chatterbox...")
    
    tests = [
        test_dispositivo,
        test_modelo_simulado,
        test_marca_agua_conservada,
        test_generar_conserva_marca_agua,
        test_stream_por_frases,
        test_endpoint_salud,
        test_idioma_espanol_usa_multilingual,
        test_idioma_ingles_usa_turbo,
        test_descarga_por_inactividad,
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if run_test(test):
            passed += 1
    
    print(f"\nResultado: {passed}/{total} pruebas pasaron")
    
    if passed == total:
        print("¡Todas las pruebas pasaron!")
        return 0
    else:
        print("Algunas pruebas fallaron.")
        return 1

if __name__ == "__main__":
    sys.exit(main())