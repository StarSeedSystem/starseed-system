import unittest
from pathlib import Path
import sys
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import utm

class TestUtm(unittest.TestCase):
    def test_build_basico(self):
        url = utm.build_utm_url("https://starseed-os.vercel.app", "instagram", "social", "siembra", "semilla")
        self.assertIn("utm_source=instagram", url)
        self.assertIn("utm_medium=social", url)
        self.assertIn("utm_campaign=siembra", url)
        self.assertIn("utm_content=semilla", url)
        self.assertTrue(url.startswith("https://starseed-os.vercel.app?"))

    def test_preserva_parametros(self):
        url = utm.build_utm_url("https://example.com/?ref=abc#sec", "tiktok", "video", "camp", "estilo")
        self.assertIn("ref=abc", url)
        self.assertIn("#sec", url)
        self.assertIn("utm_source=tiktok", url)

    def test_duplicado_lanza(self):
        with self.assertRaises(ValueError):
            utm.build_utm_url("https://example.com/?utm_source=old", "x", "y", "z", "w")

    def test_espacio_lanza(self):
        with self.assertRaises(ValueError):
            utm.build_utm_url("https://example.com", "insta gram", "social", "camp", "estilo")

    def test_url_sin_esquema_lanza(self):
        with self.assertRaises(ValueError):
            utm.build_utm_url("example.com", "x", "y", "z", "w")

if __name__ == "__main__":
    unittest.main()
