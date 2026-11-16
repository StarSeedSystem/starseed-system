import unittest
from scripts.puente.abliteration_creditos import cabe_peticion, solo_texto

class TestAbliterationPlan(unittest.TestCase):
    def test_cabe_peticion(self):
        # Casos None
        self.assertEqual(cabe_peticion(None, 0, 0), (False, "falta dato"))
        self.assertEqual(cabe_peticion(0, None, 0), (False, "falta dato"))
        self.assertEqual(cabe_peticion(0, 0, None), (False, "falta dato"))
        
        # Límites fábrica
        # OK
        self.assertEqual(cabe_peticion(4999, 29, 1), (True, "ok"))
        # Justo en límite
        self.assertEqual(cabe_peticion(5000, 30, 2), (False, "límite diario alcanzado"))
        self.assertEqual(cabe_peticion(4999, 30, 1), (False, "límite RPM alcanzado"))
        self.assertEqual(cabe_peticion(4999, 29, 2), (False, "límite concurrencia alcanzado"))

    def test_solo_texto(self):
        # Texto normal
        self.assertTrue(solo_texto([{"texto": "hola"}]))
        # Imagen data (debe pasar)
        self.assertTrue(solo_texto([{"texto": "hola", "imagen": "data:image/png;base64,..."}]))
        # URL remota (no debe pasar)
        self.assertFalse(solo_texto([{"texto": "hola", "imagen": "https://remota.com/img.png"}]))
        self.assertFalse(solo_texto([{"texto": "hola", "imagen": "http://remota.com/img.png"}]))

if __name__ == "__main__":
    unittest.main()
