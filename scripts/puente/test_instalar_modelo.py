import hashlib
import json
import os
import tempfile
from pathlib import Path
import unittest
from instalar_modelo import instalar, volver_atras

class TestInstalarModelo(unittest.TestCase):
    def test_instalar_success(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            destino_path = os.path.join(tmpdir, "modelo.bin")
            entrada = {
                "area": "imagen",
                "id": "test-model",
                "version": "1.0",
                "url": "http://example.com/fake-model.bin",
            }
            sha_esperado = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            def descargar_mock(url, dest_path):
                Path(dest_path).touch()
            self.assertTrue(instalar(entrada, destino_path, descargar_mock, sha_esperado))
            self.assertTrue(Path(destino_path).exists())
            backup_dir = Path(destino_path).parent / "anterior"
            self.assertTrue(backup_dir.exists())
            reg_path = Path(os.path.expanduser("~/.starseed")) / "modelos-instalados.json"
            self.assertTrue(reg_path.exists())
            with reg_path.open() as f:
                reg = json.load(f)
            self.assertIn("imagen:test-model", reg)

    def test_instalar_sha_mismatch(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            destino_path = os.path.join(tmpdir, "modelo.bin")
            entrada = {
                "area": "imagen",
                "id": "test-model",
                "version": "1.0",
                "url": "http://example.com/fake-model.bin",
            }
            sha_esperado = "wrongsha"
            def descargar_mock(url, dest_path):
                Path(dest_path).write_text("fake")
            self.assertFalse(instalar(entrada, destino_path, descargar_mock, sha_esperado))
            self.assertFalse(Path(destino_path).exists())

    def test_volver_atras(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            destino_path = os.path.join(tmpdir, "modelo.bin")
            entrada_v1 = {
                "area": "imagen",
                "id": "test-model",
                "version": "1.0",
                "url": "http://example.com/v1.bin",
            }
            entrada_v2 = {
                "area": "imagen",
                "id": "test-model",
                "version": "2.0",
                "url": "http://example.com/v2.bin",
            }
            def descargar_mock(url, dest_path):
                if url.endswith("v1.bin"):
                    content = b"v1"
                    Path(dest_path).write_bytes(content)
                    return hashlib.sha256(content).hexdigest()
                else:
                    content = b"v2"
                    Path(dest_path).write_bytes(content)
                    return hashlib.sha256(content).hexdigest()
            # We need to get the SHA from the mock, but the mock doesn't return it to the caller.
            # Instead, we'll compute the SHA here.
            sha_v1 = hashlib.sha256(b"v1").hexdigest()
            sha_v2 = hashlib.sha256(b"v2").hexdigest()
            def descargar_mock(url, dest_path):
                if url.endswith("v1.bin"):
                    Path(dest_path).write_bytes(b"v1")
                else:
                    Path(dest_path).write_bytes(b"v2")
            # Install v1
            self.assertTrue(instalar(entrada_v1, destino_path, descargar_mock, sha_v1))
            # Install v2
            self.assertTrue(instalar(entrada_v2, destino_path, descargar_mock, sha_v2))
            # Now v2 should be active
            self.assertEqual(Path(destino_path).read_text(), "v2")
            # Rollback
            self.assertTrue(volver_atras("imagen"))
            # Now v1 should be active
            self.assertEqual(Path(destino_path).read_text(), "v1")

if __name__ == "__main__":
    unittest.main()