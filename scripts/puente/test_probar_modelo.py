"""
Tests para las funciones de probar_modelo.py
"""
import unittest
from probar_modelo import probar_modelo, decidir

class TestProbarModelo(unittest.TestCase):
    def test_probar_modelo_sin_motor(self):
        """Test que cuando no se proporciona motor local, devuelve error apropiado."""
        resultado = probar_modelo("imagen", {})
        self.assertIsInstance(resultado, dict)
        self.assertIn("exitoso", resultado)
        self.assertIn("tiempo_segundos", resultado)
        self.assertIn("memoria_mb", resultado)
        self.assertIn("error", resultado)
        self.assertIn("detalles", resultado)
        self.assertFalse(resultado["exitoso"])
        self.assertEqual(resultado["error"], "No local motor provided")

    def test_decidir_nuevo_fallido(self):
        """Test que si el nuevo modelo falla, se decide volver atrás."""
        nueva = {"exitoso": False}
        actual = None
        self.assertFalse(decidir(nueva, actual))

    def test_decidir_sin_actual(self):
        """Test que si no hay actual y el nuevo funciona, se acepta."""
        nueva = {"exitoso": True, "tiempo_segundos": 1.0}
        actual = None
        self.assertTrue(decidir(nueva, actual))

    def test_decidir_peor_en_tiempo(self):
        """Test que si el nuevo es más de un 15% peor en tiempo, se rechaza."""
        nueva = {"exitoso": True, "tiempo_segundos": 1.2}
        actual = {"exitoso": True, "tiempo_segundos": 1.0}  # 1.2 > 1.0 * 1.15? 1.15 -> 1.2 > 1.15 -> True, so rechazar
        self.assertFalse(decidir(nueva, actual))

    def test_decidir_mejor_o_igual_en_tiempo(self):
        """Test que si el nuevo es igual o mejor en tiempo, se acepta."""
        nueva = {"exitoso": True, "tiempo_segundos": 1.0}
        actual = {"exitoso": True, "tiempo_segundos": 1.0}
        self.assertTrue(decidir(nueva, actual))

        nueva = {"exitoso": True, "tiempo_segundos": 0.9}
        actual = {"exitoso": True, "tiempo_segundos": 1.0}
        self.assertTrue(decidir(nueva, actual))

if __name__ == '__main__':
    unittest.main()