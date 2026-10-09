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

    def test_elegir_archivo_archivo_explicito(self):
        capa = {
            "id": "test-1",
            "archivo": "model.gguf",
            "sha256": "abc123",
            "tamano_bytes": 1000,
        }
        arbol = []
        resultado = cr.elegir_archivo(capa, arbol)
        self.assertEqual(resultado, ("model.gguf", "abc123", 1000))

    def test_elegir_archivo_ambiguo(self):
        capa = {
            "id": "test-2",
            "formato": "gguf",
        }
        arbol = [
            {"path": "model-1.gguf", "lfs": {"oid": "sha1"}, "size": 100},
            {"path": "model-2.gguf", "lfs": {"oid": "sha2"}, "size": 200},
        ]
        resultado = cr.elegir_archivo(capa, arbol)
        self.assertIsNone(resultado)

    def test_elegir_archivo_gguf_con_i2s(self):
        capa = {
            "id": "test-3",
            "formato": "gguf",
        }
        arbol = [
            {"path": "model-1.gguf", "lfs": {"oid": "sha1"}, "size": 100},
            {"path": "bitnet-b1.58-2b-4t-i2_s.gguf", "lfs": {"oid": "sha2"}, "size": 200},
        ]
        resultado = cr.elegir_archivo(capa, arbol)
        self.assertEqual(resultado, ("bitnet-b1.58-2b-4t-i2_s.gguf", "sha2", 200))

    def test_elegir_archivo_gguf_con_q4(self):
        capa = {
            "id": "test-4",
            "formato": "gguf",
        }
        arbol = [
            {"path": "model-1.gguf", "lfs": {"oid": "sha1"}, "size": 100},
            {"path": "bitnet-b1.58-2b-4t-q4.gguf", "lfs": {"oid": "sha2"}, "size": 200},
        ]
        resultado = cr.elegir_archivo(capa, arbol)
        self.assertEqual(resultado, ("bitnet-b1.58-2b-4t-q4.gguf", "sha2", 200))

    def test_elegir_archivo_sin_candidatos(self):
        capa = {
            "id": "test-5",
            "formato": "gguf",
        }
        arbol = [
            {"path": "model.onnx", "lfs": {"oid": "sha1"}, "size": 100},
        ]
        resultado = cr.elegir_archivo(capa, arbol)
        self.assertIsNone(resultado)

    def test_verificar_capas_con_getter(self):
        config = {
            "capas": [
                {
                    "id": "verificada",
                    "sha256": "por-verificar",
                    "fuente_oficial": "https://huggingface.co/test/test-repo",
                    "formato": "gguf",
                },
                {
                    "id": "sin-red",
                    "sha256": "",
                    "fuente_oficial": "https://huggingface.co/test/test-repo-inexistente",
                    "formato": "gguf",
                },
                {
                    "id": "ambigua",
                    "sha256": "por-verificar",
                    "fuente_oficial": "https://huggingface.co/test/test-repo-ambig",
                    "formato": "gguf",
                },
            ]
        }
        
        def getter_mock(url):
            if "test-repo/tree" in url:
                return [
                    {"path": "model.gguf", "oid": "abc123", "size": 1000, "type": "file", "lfs": {}},
                ]
            elif "test-repo-inexistente/tree" in url:
                raise Exception("No encontrado")
            elif "test-repo-ambig/tree" in url:
                return [
                    {"path": "model-1.gguf", "oid": "sha1", "size": 100, "type": "file", "lfs": {}},
                    {"path": "model-2.gguf", "oid": "sha2", "size": 200, "type": "file", "lfs": {}},
                ]
            return []
        
        config_nueva, informe = cr.verificar_capas(config, getter=getter_mock)
        self.assertEqual(len(informe), 3)
        self.assertIn("verificada", informe[0])
        self.assertIn("sin-red", informe[1])
        self.assertIn("ambigua", informe[2])
        
        capa_verificada = config_nueva["capas"][0]
        self.assertEqual(capa_verificada["archivo"], "model.gguf")
        self.assertEqual(capa_verificada["sha256"], "abc123")
        self.assertEqual(capa_verificada["tamano_bytes"], 1000)
        self.assertEqual(capa_verificada["verificado"], capa_verificada["verificado"])

    def test_verificar_capas_sin_escribir_cambia_archivo(self):
        config = {
            "capas": [
                {
                    "id": "test-cambia",
                    "sha256": "",
                    "fuente_oficial": "https://huggingface.co/test/test-repo-cambia",
                    "formato": "gguf",
                },
            ]
        }
        
        def getter_mock(url):
            if "test-repo-cambia/tree" in url:
                return [
                    {"path": "model.gguf", "lfs": {"oid": "sha1"}, "size": 1000},
                ]
            return []
        
        config_nueva, informe = cr.verificar_capas(config, getter=getter_mock)
        
        self.assertEqual(len(config_nueva["capas"]), 1)
        self.assertEqual(config_nueva["capas"][0]["sha256"], "sha1")
        
        self.assertEqual(len(informe), 1)
        self.assertIn("verificada", informe[0])

if __name__ == "__main__":
    unittest.main()
