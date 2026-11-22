#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de proveedores gratis (sin red y sin tocar el repo)."""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_proveedores_gratis as V

CAT = "- `openrouter/a/b:free` · deprecated: false\n- `xkiro/c/d:free` · deprecated: false\n"
MET = "## 1. Principios\n\n## 2. Rotación\n\n1. `openrouter/a/b:free`\n2. `xkiro/c/d:free`\n"


class PruebasVigia(unittest.TestCase):
    def test_modelos_de_lee_proveedor_modelo_y_estado(self):
        modelos = V.modelos_de(CAT)
        self.assertEqual([m["id"] for m in modelos], ["openrouter/a/b:free", "xkiro/c/d:free"])
        self.assertEqual((modelos[0]["proveedor"], modelos[0]["modelo"]),
                         ("openrouter", "a/b:free"))
        self.assertFalse(modelos[0]["deprecado"])

    def test_decidir_depreca_al_tercer_fallo_y_resetea(self):
        est, dep = V.decidir({}, {"openrouter/a/b:free": False})
        self.assertEqual((est["openrouter/a/b:free"]["fallos"], dep), (1, set()))
        _, dep = V.decidir({"openrouter/a/b:free": {"fallos": 2}},
                           {"openrouter/a/b:free": False})
        self.assertEqual(dep, {"openrouter/a/b:free"})
        est, dep = V.decidir({"openrouter/a/b:free": {"fallos": 2}},
                             {"openrouter/a/b:free": True})
        self.assertEqual((est["openrouter/a/b:free"]["fallos"], dep), (0, set()))

    def test_marcar_solo_el_deprecado(self):
        texto = V.marcar(CAT, {"openrouter/a/b:free"})
        self.assertIn("`openrouter/a/b:free` · deprecated: true", texto)
        self.assertIn("`xkiro/c/d:free` · deprecated: false", texto)

    def test_rotar_salta_deprecados_y_fija_el_activo(self):
        activo, meta = V.rotar(MET, {"openrouter/a/b:free"})
        self.assertEqual(activo, "xkiro/c/d:free")
        self.assertIn("> **Activo:** `xkiro/c/d:free`", meta)
        self.assertIsNone(V.rotar(MET, {"openrouter/a/b:free", "xkiro/c/d:free"})[0])

    def test_pasada_marca_y_rota_sin_red(self):
        with tempfile.TemporaryDirectory() as d:
            cat = os.path.join(d, "modelos-gratuitos.md")
            met = os.path.join(d, "metodologia-ia.md")
            est = os.path.join(d, "estado.json")
            for ruta, texto in ((cat, CAT), (met, MET), (est, '{"openrouter/a/b:free": {"fallos": 2}}')):
                with open(ruta, "w", encoding="utf-8") as f:
                    f.write(texto)
            with patch.object(V, "sondear", return_value=False):
                resumen = V.pasada(cat, met, est, refrescar=False)
            self.assertIn("1 deprecados", resumen)
            with open(cat, encoding="utf-8") as f:
                self.assertIn("`openrouter/a/b:free` · deprecated: true", f.read())
            with open(met, encoding="utf-8") as f:
                self.assertIn("> **Activo:** `xkiro/c/d:free`", f.read())
            with open(est, encoding="utf-8") as f:
                self.assertEqual(json.load(f)["openrouter/a/b:free"]["fallos"], 3)


if __name__ == "__main__":
    unittest.main()
