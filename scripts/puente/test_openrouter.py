"""openrouter: atribución y preferencias solo en peticiones a OpenRouter y solo en `:free`."""
import unittest

import openrouter as orr


class OpenRouter(unittest.TestCase):
    def test_cabeceras_solo_en_openrouter(self):
        base = {"Authorization": "Bearer x"}
        con = orr.cabeceras("https://openrouter.ai/api/v1/chat/completions", base)
        self.assertEqual(con["X-Title"], orr.TITULO)
        self.assertEqual(con["HTTP-Referer"], orr.SITIO)
        self.assertEqual(con["Authorization"], "Bearer x")
        self.assertEqual(orr.cabeceras("https://api.groq.com/openai/v1", base), base)

    def test_preferencias_solo_en_free(self):
        c = orr.cuerpo("https://openrouter.ai/api/v1/chat/completions", {"model": "nex-agi/nex-n2.5-pro:free", "messages": []})
        self.assertTrue(c["provider"]["require_parameters"])
        self.assertEqual(c["provider"]["sort"], "throughput")
        self.assertEqual(c["transforms"], ["middle-out"])
        pagado = orr.cuerpo("https://openrouter.ai/api/v1/chat/completions", {"model": "google/gemini-3.5-flash"})
        self.assertNotIn("provider", pagado)
        otro = orr.cuerpo("https://integrate.api.nvidia.com/v1", {"model": "x:free"})
        self.assertNotIn("provider", otro)

    def test_sonda_sin_herramientas_no_exige_tools(self):
        c = orr.cuerpo("https://openrouter.ai/api/v1/chat/completions", {"model": "a:free"}, con_herramientas=False)
        self.assertNotIn("require_parameters", c["provider"])
        self.assertEqual(c["provider"]["sort"], "throughput")

    def test_no_pisa_lo_que_ya_venia(self):
        c = orr.cuerpo("https://openrouter.ai/api/v1/chat/completions", {"model": "a:free", "provider": {"order": ["x"]}})
        self.assertEqual(c["provider"], {"order": ["x"]})
        self.assertIs(orr.PREFERENCIAS_GRATUITOS["provider"].get("order"), None)   # la constante no se muta


if __name__ == "__main__":
    unittest.main()
