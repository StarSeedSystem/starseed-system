"""enrutar-hermes: gemini nativo entra en la cadena y va primero si escribe."""
import importlib.util
import os
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("enrutar_hermes", os.path.join(AQUI, "enrutar-hermes.py"))
eh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eh)

CONFIG = """model:
  default: auto
  provider: freellmapi
providers:
  freellmapi:
    base_url: http://127.0.0.1:3001/v1
    key_env: FREELLMAPI_KEY
    models:
      auto:
        context_length: 131072
  groq:
    base_url: https://api.groq.com/openai/v1
    key_env: GROQ_API_KEY
    models:
      openai/gpt-oss-20b:
        context_length: 131072
fallback_providers:
  - provider: freellmapi
    model: auto
"""


class Enrutar(unittest.TestCase):
    def setUp(self):
        eh.SONDADOS.clear()

    def test_gemini_entra_aunque_no_este_declarado(self):
        provs = eh.con_nativos(eh.proveedores_de_hermes(CONFIG))
        self.assertIn("gemini", provs)
        self.assertEqual(provs["gemini"], ["gemini-3.6-flash"])
        self.assertEqual(provs["freellmapi"], ["auto"])   # lo declarado no se toca

    def test_gemini_va_primero_si_escribe(self):
        provs = eh.con_nativos(eh.proveedores_de_hermes(CONFIG))
        cad = eh.cadena(provs, {"gemini": "escribe", "freellmapi": "escribe", "groq": "escribe"})
        self.assertEqual(cad[0][:2], ("gemini", "gemini-3.6-flash"))
        self.assertEqual(cad[1][:2], ("freellmapi", "auto"))
        self.assertEqual(cad[-1][0], "groq")            # tpm 8000: al final aunque escriba

    def test_gemini_al_final_si_no_se_sabe_nada(self):
        provs = eh.con_nativos(eh.proveedores_de_hermes(CONFIG))
        cad = eh.cadena(provs, {"freellmapi": "escribe"})
        self.assertEqual(cad[0][0], "freellmapi")
        self.assertIn("gemini", [p for p, _, _ in cad])

    def test_la_sonda_lite_no_manda_en_gemini(self):
        eh.SONDADOS["gemini"] = "gemini-3.5-flash-lite"
        self.assertEqual(eh.modelo_para("gemini", ["gemini-3.6-flash"]), "gemini-3.6-flash")

    def test_la_sonda_si_manda_en_los_demas(self):
        eh.SONDADOS["xkiro"] = "qwen/qwen3-coder-plus:free"
        self.assertEqual(eh.modelo_para("xkiro", ["qwen/qwen3.7-plus"]), "qwen/qwen3-coder-plus:free")

    def test_google_del_informe_es_gemini_en_hermes(self):
        self.assertEqual(eh.ALIAS["google"], "gemini")

    def test_reescribir_solo_toca_lo_suyo(self):
        cad = [("gemini", "gemini-3.6-flash", "escribe"), ("freellmapi", "auto", "escribe")]
        nuevo = eh.reescribir(CONFIG, ("gemini", "gemini-3.6-flash"), cad)
        self.assertIn("  default: gemini-3.6-flash\n", nuevo)
        self.assertIn("  provider: gemini\n", nuevo)
        self.assertIn("key_env: FREELLMAPI_KEY", nuevo)
        self.assertIn("  - provider: gemini\n    model: gemini-3.6-flash\n", nuevo)


if __name__ == "__main__":
    unittest.main()
