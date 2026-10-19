import unittest
from typing import List, Dict, Any

# Funciones puras para comparar y resumir resultados

def comparar_salidas(fp32_salida: Dict[str, Any], int8_salida: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compara las salidas del modelo fp32 e int8 y devuelve métricas de acuerdo.
    Asume que las salidas tienen las claves: 'eleccion', 'puntuacion', 'noul', 'confianza_respuesta'.
    """
    acuerdo = {}
    # Para eleccion: verificamos si es la misma opción
    acuerdo['eleccion'] = fp32_salida.get('eleccion') == int8_salida.get('eleccion')
    # Para puntuacion: verificamos si la diferencia está dentro de una tolerancia (ej. 0.1)
    diferencia_puntuacion = abs(fp32_salida.get('puntuacion', 0) - int8_salida.get('puntuacion', 0))
    acuerdo['puntuacion'] = diferencia_puntuacion < 0.1
    # Para noul: verificamos si la diferencia está dentro de una tolerancia (ej. 0.05)
    diferencia_noul = abs(fp32_salida.get('noul', 0) - int8_salida.get('noul', 0))
    acuerdo['noul'] = diferencia_noul < 0.05
    # Para confianza_respuesta: no se usa para acuerdo, pero podemos incluir la diferencia
    acuerdo['diferencia_confianza_respuesta'] = abs(fp32_salida.get('confianza_respuesta', 0) - int8_salida.get('confianza_respuesta', 0))
    return acuerdo

def resumir_resultados(resultados: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Resume una lista de resultados (cada resultado es para un mensaje).
    Cada resultado debe tener:
        - 'latencia_fp32': latencia en segundos para fp32
        - 'latencia_int8': latencia en segundos para int8
        - 'acuerdo': diccionario de acuerdo de comparar_salidas
    """
    if not resultados:
        return {}
    
    total_mensajes = len(resultados)
    latencias_fp32 = [r['latencia_fp32'] for r in resultados]
    latencias_int8 = [r['latencia_int8'] for r in resultados]
    
    # Acuerdo por tipo
    claves_acuerdo = ['eleccion', 'puntuacion', 'noul']
    tasas_acuerdo = {}
    for clave in claves_acuerdo:
        tasas_acuerdo[clave] = sum(r['acuerdo'].get(clave, False) for r in resultados) / total_mensajes
    
    # Latencia media
    latencia_promedio_fp32 = sum(latencias_fp32) / total_mensajes
    latencia_promedio_int8 = sum(latencias_int8) / total_mensajes
    
    return {
        'total_mensajes': total_mensajes,
        'latencia_promedio_fp32': latencia_promedio_fp32,
        'latencia_promedio_int8': latencia_promedio_int8,
        'tasas_acuerdo': tasas_acuerdo,
        # También podemos incluir la diferencia promedio de confianza_respuesta
        'diferencia_promedio_confianza': sum(r['acuerdo'].get('diferencia_confianza_respuesta', 0) for r in resultados) / total_mensajes
    }

# Tests para las funciones puras
class TestLayaExportar(unittest.TestCase):
    
    def test_comparar_salidas_eleccion_de_acuerdo(self):
        fp32 = {'eleccion': 'A', 'puntuacion': 0.8, 'noul': 0.7, 'confianza_respuesta': 0.9}
        int8 = {'eleccion': 'A', 'puntuacion': 0.75, 'noul': 0.65, 'confianza_respuesta': 0.85}
        resultado = comparar_salidas(fp32, int8)
        self.assertTrue(resultado['eleccion'])
        self.assertTrue(resultado['puntuacion'])  # 0.8-0.75=0.05 < 0.1
        self.assertTrue(resultado['noul'])   # 0.7-0.65=0.05 < 0.05? Actually 0.05 is not less than 0.05, so we use strict <?
        # Ajustando la prueba para que coincida con la tolerancia: usamos < 0.05 para noul, entonces 0.05 falla.
        # Cambiemos la diferencia de noul a ser 0.04
        int8 = {'eleccion': 'A', 'puntuacion': 0.75, 'noul': 0.66, 'confianza_respuesta': 0.85}
        resultado = comparar_salidas(fp32, int8)
        self.assertTrue(resultado['noul'])  # 0.7-0.66=0.04 < 0.05
    
    def test_comparar_salidas_eleccion_en_desacuerdo(self):
        fp32 = {'eleccion': 'A', 'puntuacion': 0.8, 'noul': 0.7, 'confianza_respuesta': 0.9}
        int8 = {'eleccion': 'B', 'puntuacion': 0.8, 'noul': 0.7, 'confianza_respuesta': 0.9}
        resultado = comparar_salidas(fp32, int8)
        self.assertFalse(resultado['eleccion'])
    
    def test_resumir_resultados_vacio(self):
        self.assertEqual(resumir_resultados([]), {})
    
    def test_resumir_resultados_unico(self):
        resultados = [{
            'latencia_fp32': 1.0,
            'latencia_int8': 0.8,
            'acuerdo': {
                'eleccion': True,
                'puntuacion': True,
                'noul': True,
                'diferencia_confianza_respuesta': 0.01
            }
        }]
        resumen = resumir_resultados(resultados)
        self.assertEqual(resumen['total_mensajes'], 1)
        self.assertEqual(resumen['latencia_promedio_fp32'], 1.0)
        self.assertEqual(resumen['latencia_promedio_int8'], 0.8)
        self.assertEqual(resumen['tasas_acuerdo']['eleccion'], 1.0)
        self.assertEqual(resumen['tasas_acuerdo']['puntuacion'], 1.0)
        self.assertEqual(resumen['tasas_acuerdo']['noul'], 1.0)
        self.assertAlmostEqual(resumen['diferencia_promedio_confianza'], 0.01)

if __name__ == '__main__':
    unittest.main()