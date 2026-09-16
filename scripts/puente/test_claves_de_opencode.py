"""Pruebas de claves_de_opencode: la lista de claves se deduce, no se escribe a mano."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from claves_de_opencode import faltantes, variables_de, variables_necesarias

CONFIG = {
    "provider": {
        "nvidia": {"options": {"baseURL": "https://integrate.api.nvidia.com/v1",
                               "apiKey": "{env:NVIDIA_API_KEY}"}},
        "groq": {"options": {"apiKey": "{env:GROQ_API_KEY}"}},
        "openrouter": {"options": {"apiKey": "{env:OPENROUTER_API_KEY}"},
                       "models": {"cohere/north-mini-code:free": {"name": "North Mini Code"}}},
        "llm7": {"options": {"apiKey": "sin-clave"}},
    }
}


class TestVariablesDe(unittest.TestCase):
    def test_encuentra_la_sintaxis_de_opencode(self):
        self.assertEqual(variables_de("{env:GROQ_API_KEY}"), ["GROQ_API_KEY"])

    def test_varias_en_la_misma_cadena(self):
        self.assertEqual(variables_de("{env:A} y {env:B}"), ["A", "B"])

    def test_un_valor_literal_no_es_una_variable(self):
        self.assertEqual(variables_de("sin-clave"), [])

    def test_aguanta_lo_que_no_es_texto(self):
        self.assertEqual(variables_de(None), [])
        self.assertEqual(variables_de(42), [])


class TestVariablesNecesarias(unittest.TestCase):
    def test_saca_todas_las_de_la_configuracion(self):
        v = variables_necesarias(CONFIG)
        for n in ("NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"):
            self.assertIn(n, v)

    def test_groq_ya_no_se_queda_fuera(self):
        # El caso real: la lista escrita a mano se olvidaba de Groq y sus modelos
        # fallaban en silencio aunque la clave fuese válida.
        self.assertIn("GROQ_API_KEY", variables_necesarias(CONFIG))

    def test_no_inventa_claves_donde_hay_literales(self):
        self.assertNotIn("sin-clave", variables_necesarias(CONFIG))

    def test_recorre_todo_el_arbol_no_solo_apiKey(self):
        c = {"provider": {"x": {"options": {"headers": {"X-Firma": "{env:FIRMA_RARA}"}}}}}
        self.assertIn("FIRMA_RARA", variables_necesarias(c))

    def test_suma_las_extra_sin_repetir(self):
        v = variables_necesarias(CONFIG, extra=("GROQ_API_KEY", "TELEGRAM_BOT_TOKEN"))
        self.assertEqual(v.count("GROQ_API_KEY"), 1)
        self.assertIn("TELEGRAM_BOT_TOKEN", v)

    def test_orden_estable(self):
        self.assertEqual(variables_necesarias(CONFIG), variables_necesarias(CONFIG))

    def test_configuracion_vacia(self):
        self.assertEqual(variables_necesarias({}), [])
        self.assertEqual(variables_necesarias(None), [])


class TestFaltantes(unittest.TestCase):
    def test_avisa_de_la_que_no_existe(self):
        self.assertEqual(
            faltantes(["A", "B"], {"A"}), ["B"])

    def test_nada_que_avisar(self):
        self.assertEqual(faltantes(["A"], {"A", "B"}), [])

    def test_entradas_vacias(self):
        self.assertEqual(faltantes(None, None), [])


if __name__ == "__main__":
    unittest.main()
