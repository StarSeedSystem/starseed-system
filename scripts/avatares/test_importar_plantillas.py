#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de importar_plantillas SIN red: solo funciones puras y el manifiesto."""

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importar_plantillas as imp


class TestManifiesto(unittest.TestCase):
    def test_coleccion_dentro_de_limites(self):
        ok, _ = imp.cabe_en_limites([p.bytes_vrm for p in imp.COLECCION])
        self.assertTrue(ok)
        self.assertLessEqual(len(imp.COLECCION), imp.MAX_PLANTILLAS)

    def test_ids_y_archivos_unicos(self):
        ids = [p.id for p in imp.COLECCION]
        archivos = [p.archivo for p in imp.COLECCION]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(archivos), len(set(archivos)))

    def test_procedencia_completa_y_cc0(self):
        for p in imp.COLECCION:
            proc = imp.procedencia_de(p)
            self.assertEqual(proc["licencia"], "CC0-1.0")
            self.assertTrue(proc["autor"])
            self.assertIn("github.com/PabloFMM/numinia-digital-goods-data", proc["enlace_licencia"])
            self.assertTrue(proc["enlace_modelo"].endswith(p.archivo))

    def test_id_referenciable(self):
        for p in imp.COLECCION:
            self.assertRegex(imp.ref_biblioteca(p.id), r"^biblioteca:[\w./:-]{1,160}$")


class TestFormatoVrm(unittest.TestCase):
    def test_es_glb_valido(self):
        cabecera = b"glTF" + (2).to_bytes(4, "little") + (100).to_bytes(4, "little")
        self.assertTrue(imp.es_glb(cabecera))

    def test_es_glb_rechazos(self):
        self.assertFalse(imp.es_glb(b""))
        self.assertFalse(imp.es_glb(b"glTF"))                      # corto
        self.assertFalse(imp.es_glb(b"JSON" + b"\x00" * 8))        # no es GLB
        self.assertFalse(imp.es_glb(b"glTF" + (1).to_bytes(4, "little") + b"\x00" * 4))  # GLB v1


class TestLimites(unittest.TestCase):
    def test_limite_cantidad(self):
        ok, motivo = imp.cabe_en_limites([1] * (imp.MAX_PLANTILLAS + 1))
        self.assertFalse(ok)
        self.assertIn("límite", motivo)

    def test_limite_total(self):
        self.assertFalse(imp.cabe_en_limites([imp.MAX_TOTAL_BYTES // 2] * 3)[0])

    def test_limite_fichero(self):
        self.assertFalse(imp.cabe_en_limites([imp.MAX_FICHERO_BYTES + 1])[0])


class TestUrls(unittest.TestCase):
    def test_url_fuente(self):
        p = imp.COLECCION[0]
        self.assertIn("/avatars/", imp.url_fuente(p, p.archivo))
        self.assertIn("/thumbnails/", imp.url_fuente(p, p.miniatura))


if __name__ == "__main__":
    unittest.main(verbosity=2)
