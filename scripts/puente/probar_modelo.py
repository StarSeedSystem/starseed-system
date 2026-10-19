#!/usr/bin/env python3
# scripts/puente/probar_modelo.py
"""
Probador de modelos para el vigía de modelos y versiones.
Contrato: architecture/vigia-modelos.md
"""

import os
import sys
import time
import json
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, Callable
# Intentar importar psutil para medir memoria, pero tener una alternativa
try:
    import psutil  # Para medir memoria
    PSUTIL_DISPONIBLE = True
except ImportError:
    PSUTIL_DISPONIBLE = False
    # Definir una función alternativa para obtener memoria del proceso
    def get_memory_mb():
        return 0  # Valor predeterminado si psutil no está disponible

# Añadir el directorio scripts/puente al path para importar
sys.path.insert(0, str(Path(__file__).parent))

def probar_modelo_voz(
    entrada: str,
    prueba_func: Callable[[str], Tuple[bool, float, int]],
    modelo_actual: Optional[str] = None,
    tiempo_actual: Optional[float] = None,
    memoria_actual: Optional[int] = None
) -> Dict[str, Any]:
    """
    Prueba un modelo de voz y decide si quedarse con él o volver atrás.
    
    Args:
        entrada: Identificador del modelo (ej: "HF-Team/VoiceModel")
        prueba_func: Función que prueba el modelo y devuelve (éxito, tiempo_segundos, memoria_bytes)
        modelo_actual: Identificador del modelo actual (opcional)
        tiempo_actual: Tiempo de referencia del modelo actual en segundos (opcional)
        memoria_actual: Memoria de referencia del modelo actual en bytes (opcional)
        
    Returns:
        Dict con la decisión y métricas:
        {
            "quedarse": bool,  # True si se debe quedar con el nuevo modelo
            "razon": str,      # Explicación de la decisión
            "tiempo": float,   # Tiempo medido en segundos
            "memoria": int,    # Memoria utilizada en bytes
            "exito": bool,     # Si la prueba fue exitosa
            "mejora_tiempo": float,  # Porcentaje de mejora/empeoramiento en tiempo
            "mejora_memoria": float  # Porcentaje de mejora/empeoramiento en memoria
        }
    """
    # Ejecutar la prueba del modelo
    exito, tiempo_medido, memoria_utilizada = prueba_func(entrada)
    
    resultado = {
        "exito": exito,
        "tiempo": tiempo_medido,
        "memoria": memoria_utilizada,
        "quedarse": False,
        "razon": "",
        "mejora_tiempo": 0.0,
        "mejora_memoria": 0.0
    }
    
    if not exito:
        resultado["razon"] = "La prueba del modelo falló"
        return resultado
    
    # Si no hay modelo actual para comparar, siempre quedarse si funciona
    if modelo_actual is None or tiempo_actual is None or memoria_actual is None:
        resultado["quedarse"] = True
        resultado["razon"] = "Modelo funcional y no hay modelo actual para comparar"
        return resultado
    
    # Calcular mejoras (porcentaje: positivo = mejora, negativo = empeoramiento)
    if tiempo_actual > 0:
        resultado["mejora_tiempo"] = ((tiempo_actual - tiempo_medido) / tiempo_actual) * 100
    
    if memoria_actual > 0:
        resultado["mejora_memoria"] = ((memoria_actual - memoria_utilizada) / memoria_actual) * 100
    
    # Decidir si quedarse con el nuevo modelo
    # Criterios:
    # 1. Si el nuevo modelo es al menos un 15% mejor en tiempo → quedarse
    # 2. Si proporciona una capacidad nueva (no se mide aquí, se asume que la prueba_func lo indica)
    # 3. Si no es peor que el actual en más de un 15% en tiempo → quedarse
    # 4. En caso contrario → volver atrás
    
    if resultado["mejora_tiempo"] >= 15.0:
        resultado["quedarse"] = True
        resultado["razon"] = f"Mejora significativa en tiempo: {resultado['mejora_tiempo']:.1f}%"
    elif resultado["mejora_tiempo"] >= -15.0:  # No es peor en más de un 15%
        resultado["quedarse"] = True
        resultado["razon"] = f"Rendimiento aceptable: {resultado['mejora_tiempo']:.1f}% (umbral: -15%)"
    else:
        resultado["quedarse"] = False
        resultado["razon"] = f"Empeoramiento significativo en tiempo: {resultado['mejora_tiempo']:.1f}% (umbral: -15%)"
    
    return resultado

def crear_prueba_voz_texto_fijo(texto_prueba: str = "Hola, este es un mensaje de prueba para el sistema de voz.") -> Callable[[str], Tuple[bool, float, int]]:
    """
    Crea una función de prueba para modelos de voz que usa un texto fijo.
    
    Args:
        texto_prueba: Texto que se utilizará para probar la síntesis de voz
        
    Returns:
        Función que toma un identificador de modelo y devuelve (éxito, tiempo_segundos, memoria_bytes)
    """
    def prueba_modelo(entrada: str) -> Tuple[bool, float, int]:
        """
        Prueba un modelo de voz sintetizando el texto_prueba.
        Esta es una implementación de ejemplo que debería ser reemplazada
        por una prueba real que use el motor de voz del OS.
        """
        # En una implementación real, aquí se llamaría al motor de voz del OS
        # Para este ejemplo, simulamos una prueba
        
        # Simular tiempo de procesamiento (entre 0.5 y 2.0 segundos)
        tiempo_simulado = 0.5 + (hash(entrada) % 1500) / 1000.0
        
        # Simular uso de memoria (entre 50 MB y 300 MB)
        memoria_simulada = 50 * 1024 * 1024 + (hash(entrada) % 250) * 1024 * 1024
        
        # Simular éxito/fallo basado en la longitud del identificador
        # (en realidad, esto dependería de si el modelo se puede descargar y usar)
        exito = len(entrada) > 5  # Muy simplificado, solo para el ejemplo
        
        # Esperar el tiempo simulado para hacer la prueba más realista
        time.sleep(tiempo_simulado)
        
        return (exito, tiempo_simulado, int(memoria_simulada))
    
    return prueba_modelo

def main():
    """Función principal para demostrar el uso del probador."""
    if len(sys.argv) < 2:
        print("Uso: python3 probar_modelo.py <identificador_modelo> [modelo_actual]")
        print("Ejemplo: python3 probar_modelo.py HF-Team/VoceroTurbo Qwen/Qwen-Image-2.1")
        sys.exit(1)
    
    entrada = sys.argv[1]
    modelo_actual = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Crear función de prueba
    prueba_func = crear_prueba_voz_texto_fijo()
    
    # Valores de referencia para el modelo actual (en una implementación real
    # estos vendrían de mediciones previas)
    tiempo_actual = 1.2  # segundos
    memoria_actual = 150 * 1024 * 1024  # 150 MB
    
    # Ejecutar prueba
    resultado = probar_modelo_voz(
        entrada=entrada,
        prueba_func=prueba_func,
        modelo_actual=modelo_actual,
        tiempo_actual=tiempo_actual if modelo_actual else None,
        memoria_actual=memoria_actual if modelo_actual else None
    )
    
    # Mostrar resultado
    print(f"Resultado de la prueba para '{entrada}':")
    print(f"  Éxito: {resultado['exito']}")
    print(f"  Tiempo: {resultado['tiempo']:.3f} s")
    print(f"  Memoria: {resultado['memoria'] / (1024*1024):.2f} MB")
    
    if resultado['exito']:
        print(f"  Mejora tiempo: {resultado['mejora_tiempo']:.1f}%")
        print(f"  Mejora memoria: {resultado['mejora_memoria']:.1f}%")
        print(f"  Decisión: {'QUEDARSE' if resultado['quedarse'] else 'VOLVER ATRÁS'}")
        print(f"  Razón: {resultado['razon']}")
    else:
        print(f"  Error: {resultado['razon']}")

if __name__ == "__main__":
    main()