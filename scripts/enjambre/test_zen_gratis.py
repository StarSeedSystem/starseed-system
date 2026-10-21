# -*- coding: utf-8 -*-
"""OpenCode Zen en la rotación (2026-10-21): solo los gratuitos y solo donde hay clave."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class ZenGratis(unittest.TestCase):
    def test_sin_clave_no_entra(self):
        self.assertEqual(enjambre.con_zen(["google/a", "nvidia/b"], False), ["google/a", "nvidia/b"])

    def test_con_clave_va_tras_gemini_sin_repetir(self):
        r = enjambre.con_zen(["google/a", "opencode/big-pickle", "nvidia/b"], True)
        self.assertEqual(r[0], "google/a")
        self.assertEqual(r.count("opencode/big-pickle"), 1)
        self.assertEqual(r[1], "opencode/glm-5.3-flash-free")
        self.assertEqual(r[-1], "nvidia/b")

    def test_solo_gratuitos(self):
        for m in enjambre.MODELOS_ZEN_GRATIS:
            self.assertTrue(m.endswith("-free") or m == "opencode/big-pickle", m)

    def test_clave_por_entorno_o_auth(self):
        self.assertTrue(enjambre.hay_clave_zen({"OPENCODE_API_KEY": "x"}, "/no/existe"))
        self.assertFalse(enjambre.hay_clave_zen({}, "/no/existe"))
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"opencode": {"type": "api"}}, f)
        try:
            self.assertTrue(enjambre.hay_clave_zen({}, f.name))
        finally:
            os.unlink(f.name)


if __name__ == "__main__":
    unittest.main()
