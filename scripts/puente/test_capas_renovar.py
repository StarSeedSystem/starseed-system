#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
import json
import tempfile
from pathlib import Path
import hashlib

import sys
sys.path.insert(0, str(Path(__file__).parent))
import capas_renovar as cr

class TestCapasRenovar(unittest.TestCase):
    def test_sha256_stream_no_vacio(self):
        data = b"contenido real de modelo"
        expected = hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / "model.bin"
            def getter(url):
                return data
            sha = cr.sha256_stream("http://example.com/model", dest, getter=getter)
            self.assertEqual(sha, expected)
            self.assertTrue(dest.exists())
            self.assertEqual(dest.read_bytes(), data)

    def test_detectar_nuevas_sin_inventar(self):
        config = {"capas": [{"fuente_oficial": "https://huggingface.co/Cactus-Compute/needle3"}]}
        # mock getter devuelve modelos conocidos
        def mock_fetch(url):
            if "author=Cactus-Compute" in url:
                return [{"id": "Cactus-Compute/needle3"}, {"id": "Cactus-Compute/needle4"}]
            if "/models/Cactus-Compute/needle4" in url:
                return {"lastModified": "2026-01-01"}
            return []
        # fetch_json espera bytes, pero detectar usa fetch_json que espera dict
        # Adaptamos con wrapper
        def getter_bytes(url):
            # retornar bytes JSON
            resp = mock_fetch(url)
            return json.dumps(resp).encode()
        # Para simplificar, reemplazar fetch_json interno
        original = cr.fetch_json
        def fake_fetch(url):
            if "models?author" in url:
                return mock_fetch(url)
            return mock_fetch(url)
        cr.fetch_json = lambda u, g=None: fake_fetch(u)
        nuevas = cr.detectar_nuevas(config, getter=None)
        # Solo needle4 es nuevo
        repos = [n["repo"] for n in nuevas]
        self.assertIn("Cactus-Compute/needle4", repos)
        self.assertNotIn("needle4-reflejo-test", repos)
        cr.fetch_json = original

    def test_detectar_no_duplica_existentes(self):
        config = {"capas": [{"fuente_oficial": "https://huggingface.co/prism-ml/Ternary-Bonsai-4B"}]}
        def fake_fetch(url):
            return [{"id": "prism-ml/Ternary-Bonsai-4B"}]
        cr.fetch_json = lambda u, g=None: fake_fetch(u)
        nuevas = cr.detectar_nuevas(config)
        self.assertEqual(len(nuevas), 0)
        cr.fetch_json = cr.fetch_json

if __name__ == "__main__":
    unittest.main()
