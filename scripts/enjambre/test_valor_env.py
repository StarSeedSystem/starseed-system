# -*- coding: utf-8 -*-
"""(2026-10-10, CAP1010) El lector de ~/.starseed/env entiende lo que escribe el workflow de la
nube (`printf '%s=%q'`): las comas escapadas dejaban cada modelo de Groq con una barra al final."""
import importlib.util
import os
import sys
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
sys.path.insert(0, os.path.dirname(RUTA))
ESPEC = importlib.util.spec_from_file_location("enjambre_valor_env", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
ESPEC.loader.exec_module(enjambre)


class ValorEnv(unittest.TestCase):
    def test_comas_escapadas_por_printf_q(self):
        v = enjambre.valor_env(r"openai/gpt-oss-120b\,qwen/qwen3.8-27b\,openai/gpt-oss-20b")
        self.assertEqual(v.split(","), ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"])

    def test_comillas_y_valores_simples(self):
        self.assertEqual(enjambre.valor_env("'a,b c'"), "a,b c")
        self.assertEqual(enjambre.valor_env('"x"'), "x")
        self.assertEqual(enjambre.valor_env("https://api.groq.com/openai/v1"), "https://api.groq.com/openai/v1")
        self.assertEqual(enjambre.valor_env(" 30 "), "30")
        self.assertEqual(enjambre.valor_env(""), "")


if __name__ == "__main__":
    unittest.main()
