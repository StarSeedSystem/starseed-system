#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de capas_renovar.py (2026-10-09).

La primera versión tomaba el `oid` de git (sha1 del blob) como si fuera el
sha256 del archivo y sus pruebas lo daban por bueno; además parcheaban
`cr.fetch_json` sin restaurarlo. Aquí: sha256 = `lfs.oid` y nada más, y todo
parche se deshace con mock.patch.object.
"""
import hashlib
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import capas_renovar as cr  # noqa: E402

SHA_A = "a" * 64
SHA_B = "b" * 64
SHA_C = "c" * 64
GIT_OID = "1" * 40  # id de blob de git: NO es un sha256


def lfs(path, sha, size=100):
    return {"type": "file", "path": path, "oid": GIT_OID, "size": size, "lfs": {"oid": sha, "size": size}}


class TestSha256(unittest.TestCase):
    def test_sha256_stream_no_vacio(self):
        data = b"contenido real de modelo"
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td) / "model.bin"
            sha = cr.sha256_stream("http://example.com/model", dest, getter=lambda url: data)
            self.assertEqual(sha, hashlib.sha256(data).hexdigest())
            self.assertEqual(dest.read_bytes(), data)

    def test_oid_de_git_no_es_sha256(self):
        self.assertIsNone(cr._sha256_lfs({"path": "x.gguf", "oid": GIT_OID}))
        self.assertIsNone(cr._sha256_lfs({"path": "x.gguf", "oid": GIT_OID, "lfs": {}}))
        self.assertEqual(cr._sha256_lfs(lfs("x.gguf", SHA_A)), SHA_A)


class TestElegirArchivo(unittest.TestCase):
    def test_un_solo_gguf(self):
        archivos, _ = cr.elegir_archivo({"formato": "gguf"}, [lfs("ggml-model-i2_s.gguf", SHA_A, 1187801280)])
        self.assertEqual(archivos, [{"path": "ggml-model-i2_s.gguf", "sha256": SHA_A, "bytes": 1187801280}])

    def test_descarta_f16_y_prefiere_q2_0_exacto(self):
        arbol = [lfs("T-4B-F16.gguf", SHA_A), lfs("T-4B-PQ2_0.gguf", SHA_B),
                 lfs("T-4B-Q2_0.gguf", SHA_C), lfs("T-4B-Q2_0_g64.gguf", "d" * 64)]
        archivos, _ = cr.elegir_archivo({"formato": "gguf"}, arbol)
        self.assertEqual(archivos[0]["path"], "T-4B-Q2_0.gguf")

    def test_ambigua_no_adivina(self):
        arbol = [lfs("B-27B-PQ2_0.gguf", SHA_A), lfs("B-27B-PTQ1_0.gguf", SHA_B),
                 lfs("B-27B-mmproj-Q8_0.gguf", SHA_C)]
        archivos, candidatos = cr.elegir_archivo({"formato": "gguf"}, arbol)
        self.assertIsNone(archivos)
        self.assertIn("B-27B-PQ2_0.gguf", candidatos)

    def test_duplicados_mismo_sha_cuentan_una_vez(self):
        arbol = [lfs("Bonsai-1.7B-Q1_0.gguf", SHA_A), lfs("Bonsai-1.7B.gguf", SHA_A)]
        archivos, _ = cr.elegir_archivo({"formato": "gguf"}, arbol)
        self.assertEqual(archivos[0]["sha256"], SHA_A)

    def test_onnx_va_con_sus_datos(self):
        arbol = [lfs("onnx/model_q2.onnx", SHA_A, 10), lfs("onnx/model_q2.onnx_data", SHA_B, 1000),
                 lfs("onnx/model_q2f16.onnx", SHA_C, 10)]
        archivos, _ = cr.elegir_archivo({"formato": "onnx"}, arbol)
        self.assertEqual([a["path"] for a in archivos], ["onnx/model_q2.onnx", "onnx/model_q2.onnx_data"])

    def test_archivo_fijado_se_busca_en_el_arbol(self):
        capa = {"formato": "gguf", "archivo": "lm-i2_s.gguf", "archivos_extra": ["vae-i8_s.gguf"]}
        arbol = [lfs("lm-i2_s.gguf", SHA_A, 5), lfs("vae-i8_s.gguf", SHA_B, 7)]
        archivos, _ = cr.elegir_archivo(capa, arbol)
        self.assertEqual([a["sha256"] for a in archivos], [SHA_A, SHA_B])

    def test_archivo_fijado_ausente_no_verifica(self):
        archivos, _ = cr.elegir_archivo({"formato": "gguf", "archivo": "no-esta.gguf"}, [lfs("otro.gguf", SHA_A)])
        self.assertIsNone(archivos)

    def test_sin_candidatos(self):
        archivos, _ = cr.elegir_archivo({"formato": "gguf"}, [lfs("model.onnx", SHA_A)])
        self.assertIsNone(archivos)


class TestVerificarCapas(unittest.TestCase):
    def _getter(self, url):
        if "test/ok/tree" in url:
            return [lfs("model-Q2_0.gguf", SHA_A, 1000), lfs("model-F16.gguf", SHA_B, 9000)]
        if "test/inexistente/tree" in url:
            raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, None)
        if "test/caido/tree" in url:
            raise OSError("sin red")
        if "test/ambig/tree" in url:
            return [lfs("m-1.gguf", SHA_A), lfs("m-2.gguf", SHA_B)]
        return []

    def test_estados_honestos(self):
        config = {"capas": [
            {"id": "ok", "sha256": "por-verificar", "fuente_oficial": "https://huggingface.co/test/ok", "formato": "gguf"},
            {"id": "inexistente", "sha256": "", "fuente_oficial": "https://huggingface.co/test/inexistente", "formato": "gguf"},
            {"id": "caido", "sha256": "por-verificar", "fuente_oficial": "https://huggingface.co/test/caido", "formato": "gguf"},
            {"id": "ambig", "sha256": "por-verificar", "fuente_oficial": "https://huggingface.co/test/ambig", "formato": "gguf"},
            {"id": "hecha", "sha256": SHA_C, "fuente_oficial": "https://huggingface.co/test/ok", "formato": "gguf"},
        ]}
        nueva, informe = cr.verificar_capas(config, getter=self._getter, hoy="2026-10-09")
        self.assertIn("ok: verificada", informe[0])
        self.assertIn("repo-inexistente", informe[1])
        self.assertIn("sin-red", informe[2])
        self.assertIn("ambigua", informe[3])
        self.assertIn("ya-verificada", informe[4])
        ok = nueva["capas"][0]
        self.assertEqual((ok["archivo"], ok["sha256"], ok["tamano_bytes"], ok["verificado"]),
                         ("model-Q2_0.gguf", SHA_A, 1000, "2026-10-09"))
        for i in (1, 2, 3):  # lo no verificado queda tal cual, sin sha inventado
            self.assertIn(nueva["capas"][i]["sha256"], ("", "por-verificar"))
            self.assertNotIn("verificado", nueva["capas"][i])

    def test_no_toca_la_config_original(self):
        config = {"capas": [{"id": "ok", "sha256": "por-verificar",
                             "fuente_oficial": "https://huggingface.co/test/ok", "formato": "gguf"}]}
        cr.verificar_capas(config, getter=self._getter)
        self.assertEqual(config["capas"][0]["sha256"], "por-verificar")


class TestDetectarNuevas(unittest.TestCase):
    def test_detectar_nuevas_sin_inventar(self):
        config = {"capas": [{"fuente_oficial": "https://huggingface.co/Cactus-Compute/needle3"}]}

        def falso(url, getter=None):
            if "author=Cactus-Compute" in url:
                return [{"id": "Cactus-Compute/needle3"}, {"id": "Cactus-Compute/needle4"}]
            if "/models/Cactus-Compute/needle4" in url:
                return {"lastModified": "2026-01-01"}
            return []

        with mock.patch.object(cr, "fetch_json", side_effect=falso):
            repos = [n["repo"] for n in cr.detectar_nuevas(config)]
        self.assertIn("Cactus-Compute/needle4", repos)
        self.assertNotIn("Cactus-Compute/needle3", repos)

    def test_detectar_no_duplica_existentes(self):
        config = {"capas": [{"fuente_oficial": "https://huggingface.co/prism-ml/Ternary-Bonsai-4B-gguf"}]}
        with mock.patch.object(cr, "fetch_json", side_effect=lambda u, g=None: [{"id": "prism-ml/Ternary-Bonsai-4B-gguf"}]):
            self.assertEqual(cr.detectar_nuevas(config), [])


class TestDescargarEspejo(unittest.TestCase):
    def test_sha_distinto_se_borra(self):
        config = {"capas": [{"id": "x", "fuente_oficial": "https://huggingface.co/a/b",
                             "archivo": "m.gguf", "sha256": SHA_A}]}
        with tempfile.TemporaryDirectory() as td, mock.patch.object(cr, "ESPEJO_DIR", Path(td)):
            informe = cr.descargar_espejo(config, getter=lambda url: b"otro contenido")
            self.assertIn("SHA DISTINTO", informe[0])
            self.assertFalse((Path(td) / "x" / "m.gguf").exists())

    def test_sin_verificar_no_descarga(self):
        config = {"capas": [{"id": "y", "fuente_oficial": "https://huggingface.co/a/b", "sha256": "por-verificar"}]}
        self.assertIn("no se descarga", cr.descargar_espejo(config, getter=lambda url: b"")[0])


if __name__ == "__main__":
    unittest.main()
