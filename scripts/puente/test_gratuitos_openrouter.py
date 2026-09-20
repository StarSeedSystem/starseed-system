"""OpenRouter: los gratuitos con herramientas de hoy entran solos en la rotación (y nunca uno de pago)."""
import importlib.util
import os
import unittest

import pasarelas as P

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("renovador", os.path.join(AQUI, "renovador-pasarelas.py"))
ren = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ren)
_spec2 = importlib.util.spec_from_file_location("enrutar_hermes", os.path.join(AQUI, "enrutar-hermes.py"))
eh = importlib.util.module_from_spec(_spec2)
_spec2.loader.exec_module(eh)

CATALOGO = {"data": [
    {"id": "deepseek/deepseek-v4-flash-0731:free", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 1048576, "supported_parameters": ["tools", "temperature"]},
    {"id": "nex-agi/nex-n2.5-pro:free", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 262144, "supported_parameters": ["tools"]},
    {"id": "google/gemini-3.5-flash", "pricing": {"prompt": "0.0000003", "completion": "0.0000025"}, "context_length": 1048576, "supported_parameters": ["tools"]},
    {"id": "alguien/chat-sin-herramientas:free", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 128000, "supported_parameters": ["temperature"]},
    {"id": "alguien/pequeno:free", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 8192, "supported_parameters": ["tools"]},
    {"id": "trampa/gratis-sin-sufijo", "pricing": {"prompt": "0", "completion": "0"}, "context_length": 200000, "supported_parameters": ["tools"]},
]}


class Gratuitos(unittest.TestCase):
    def test_solo_free_con_herramientas_y_contexto_por_orden(self):
        self.assertEqual(ren.openrouter_gratuitos(CATALOGO),
                         ["deepseek/deepseek-v4-flash-0731:free", "nex-agi/nex-n2.5-pro:free"])

    def test_catalogo_vacio_o_roto(self):
        self.assertEqual(ren.openrouter_gratuitos(None), [])
        self.assertEqual(ren.openrouter_gratuitos({"data": [{"id": "x:free", "pricing": {"prompt": "no"}}]}), [])

    def test_modelos_utiles_mete_los_extra_si_la_pasarela_escribe(self):
        informe = {"pasarelas": [{"clave": "openrouter", "estado": "escribe",
                                  "modelos_extra": ["deepseek/deepseek-v4-flash-0731:free", "nex-agi/nex-n2.5-pro:free"]}]}
        utiles, _ = P.modelos_utiles(["groq/openai/gpt-oss-20b", "openrouter/nex-agi/nex-n2.5-pro:free"], informe)
        self.assertEqual(utiles, ["groq/openai/gpt-oss-20b", "openrouter/nex-agi/nex-n2.5-pro:free",
                                  "openrouter/deepseek/deepseek-v4-flash-0731:free"])

    def test_modelos_utiles_no_mete_extra_si_no_escribe(self):
        informe = {"pasarelas": [{"clave": "openrouter", "estado": "sin_cupo", "modelos_extra": ["a:free"]}]}
        utiles, apartados = P.modelos_utiles(["groq/x", "openrouter/b:free"], informe)
        self.assertEqual(utiles, ["groq/x"])
        self.assertEqual(apartados, [("openrouter/b:free", "sin_cupo")])

    def test_hermes_toma_el_extra_de_mas_contexto_y_nunca_uno_de_pago(self):
        eh.EXTRA.clear(); eh.SONDADOS.clear()
        eh.EXTRA["openrouter"] = ["deepseek/deepseek-v4-flash-0731:free", "nex-agi/nex-n2.5-pro:free"]
        self.assertEqual(eh.modelo_para("openrouter", ["poolside/laguna-xs-2.1:free"]), "deepseek/deepseek-v4-flash-0731:free")
        for m in eh.PREFERIDOS["openrouter"]:
            self.assertTrue(m.endswith(":free"), m)
        eh.EXTRA.clear()


if __name__ == "__main__":
    unittest.main()
