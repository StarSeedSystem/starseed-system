# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config: el bloque Zen solo declara modelos gratuitos."""
import importlib.util
import json
import os
import tempfile
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opencode-zen_config.py")
_espec = importlib.util.spec_from_file_location("opencode_zen_config", RUTA)
Z = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(Z)


class ZenConfig(unittest.TestCase):
    def test_solo_declara_gratuitos(self):
        self.assertTrue(Z.MODELOS)
        for modelo in Z.MODELOS:
            self.assertTrue(Z.es_gratuito(modelo), modelo)
        self.assertFalse(Z.es_gratuito("opencode/claude-opus-5-5"))
        self.assertFalse(Z.es_gratuito("opencode/gpt-6-astra"))

    def test_bloque_conserva_lo_ajeno_y_no_pone_claves(self):
        previo = {"name": "Zen de Alex", "models": {"de-pago": {"name": "de-pago"}}}
        bloque = Z.bloque_zen(previo)
        self.assertEqual(bloque["name"], "Zen de Alex")
        self.assertIn("de-pago", bloque["models"])
        for modelo in Z.MODELOS:
            self.assertIn(modelo.split("/", 1)[1], bloque["models"])
        self.assertNotIn("apiKey", json.dumps(bloque))

    def test_fusionar_no_muta_ni_pisa_otros_proveedores(self):
        cfg = {"provider": {"nvidia": {"models": {}}}, "lsp": {"typescript": {"disabled": True}}}
        nuevo, cambio = Z.fusionar(cfg)
        self.assertTrue(cambio)
        self.assertIn("opencode", nuevo["provider"])
        self.assertIn("nvidia", nuevo["provider"])
        self.assertTrue(nuevo["lsp"]["typescript"]["disabled"])
        self.assertNotIn("opencode", cfg["provider"])

    def test_idempotente(self):
        nuevo, _ = Z.fusionar({})
        otra, cambio = Z.fusionar(nuevo)
        self.assertFalse(cambio)
        self.assertEqual(nuevo, otra)

    def test_fusionar_declara_los_cuatro(self):
        nuevo, _ = Z.fusionar({})
        modelos = nuevo["provider"]["opencode"]["models"]
        self.assertEqual(len(modelos), len(Z.MODELOS))
        for completo in Z.MODELOS:
            self.assertIn(completo.split("/", 1)[1], modelos)

    def test_hay_clave_por_entorno_archivo_o_auth(self):
        self.assertTrue(Z.hay_clave({"OPENCODE_API_KEY": "x"}, "/no/existe", ()))
        self.assertFalse(Z.hay_clave({}, "/no/existe", ()))
        with tempfile.NamedTemporaryFile("w", delete=False) as f:
            f.write("OPENCODE_API_KEY=abc\n")
        with tempfile.NamedTemporaryFile("w", delete=False) as g:
            ruta_auth = g.name
            json.dump({"opencode": {"type": "api"}}, g)
        with tempfile.NamedTemporaryFile("w", delete=False) as vacio:
            vacio.write("OPENCODE_API_KEY=\n")
        try:
            self.assertTrue(Z.hay_clave({}, "/no/existe", (f.name,)))
            self.assertTrue(Z.hay_clave({}, ruta_auth, ()))
            self.assertFalse(Z.hay_clave({}, "/no/existe", (vacio.name,)))
        finally:
            for ruta in (f.name, ruta_auth, vacio.name):
                os.unlink(ruta)

    def test_fusionar_config_rara_no_revienta(self):
        for raro in (None, {}, {"provider": None}):
            nuevo, _ = Z.fusionar(raro)
            self.assertEqual(len(nuevo["provider"]["opencode"]["models"]), len(Z.MODELOS))


if __name__ == "__main__":
    unittest.main()
