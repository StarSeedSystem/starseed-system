# -*- coding: utf-8 -*-
"""explabs_promos: lo gratis y lo promocional de Experiential Labs, sin red ni claves reales."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import explabs_promos as E  # noqa: E402

# Forma real de `GET /api/models` (2026-10-23), recortada.
DATOS = {
    "promotions": [
        {"label": "Clef 50% off", "slugs": ["clef"], "free": False, "percent_off": 50.0, "requires_payment_method": False},
        {"label": "Clef Flash free", "slugs": ["clef-flash"], "free": True, "percent_off": 0.0, "requires_payment_method": False,
         "free_input_tokens_per_day": 10 ** 12},
        {"label": "DeepSeek V4.1 Flash Uncensored 50% off", "slugs": ["deepseek-v4.1-flash-uncensored"], "free": False, "percent_off": 50.0},
        {"label": "GPT-6 Decisions API: free until Nov 14", "slugs": ["gpt-6-luna-decisions"], "free": True, "requires_payment_method": True},
        {"label": "TypeSafe Jev — Free", "slugs": ["jev-latest"], "free": True, "requires_payment_method": True},
    ],
    "data": [
        {"model": {"slug": "clef", "description": "Cloudflare's 27B multimodal decision model: … in one forward pass."}},
        {"model": {"slug": "clef-flash", "description": "Cloudflare's smaller, faster Clef: a 9B decision model …"}},
        {"model": {"slug": "deepseek-v4.1-flash-uncensored", "description": "DeepSeek V4.1 Flash, uncensored chat."}},
        {"model": {"slug": "gpt-6-luna-decisions", "description": "OpenAI's GPT-6 Luna on the OpenAI Decisions API …"}},
        {"model": {"slug": "jev-latest", "description": "TypeSafe's typed decision model … Served natively through /v1/systemone"}},
    ],
}


class Clasificar(unittest.TestCase):
    def test_decisiones_gratis_y_chat_en_promocion(self):
        c = E.clasificar(DATOS)
        self.assertEqual(c["decisiones_gratis"][0], "jev-latest")  # Jev primero: el contrato del OS
        self.assertEqual(set(c["decisiones_gratis"]), {"jev-latest", "clef-flash", "gpt-6-luna-decisions"})
        self.assertEqual(c["chat_gratis"], [])
        self.assertEqual([x["slug"] for x in c["chat_promocion"]], ["deepseek-v4.1-flash-uncensored"])
        self.assertTrue(any(p["requiere_pago"] for p in c["promos"]))
        # Clef con descuento es de decisión: no va de revisor de chat.
        self.assertNotIn("clef", E.modelos_pasarela(c))

    def test_datos_raros_no_rompen(self):
        self.assertEqual(E.clasificar(None)["decisiones_gratis"], [])
        self.assertEqual(E.clasificar({"promotions": [None, {"slugs": [3]}]})["chat_promocion"], [])


class Env(unittest.TestCase):
    def test_solo_cambia_la_linea_de_modelos(self):
        texto = "A=1\nSTARSEED_PASARELA_EXPLABS_KEY=xpl_secreta\nSTARSEED_PASARELA_EXPLABS_MODELOS=viejo\nB=2\n"
        nuevo = E.actualizar_env(texto, ["m1", "m2"])
        self.assertIn("STARSEED_PASARELA_EXPLABS_MODELOS=m1,m2\n", nuevo)
        self.assertIn("STARSEED_PASARELA_EXPLABS_KEY=xpl_secreta", nuevo)
        self.assertEqual(nuevo.count("\n"), texto.count("\n"))
        self.assertEqual(E.actualizar_env(texto, []), texto)  # sin modelos no se toca
        self.assertEqual(E.actualizar_env("A=1\n", ["m"]), "A=1\n")  # sin la línea, no se añade nada


class Actualizar(unittest.TestCase):
    def test_foto_y_env_sin_red(self):
        d = tempfile.mkdtemp()
        antes = (E.ESTADO, E.ENV)
        E.ESTADO, E.ENV = os.path.join(d, "promos.json"), os.path.join(d, "env")
        os.environ["EXPLABS_API_KEY"] = "xpl_de_prueba"
        try:
            with open(E.ENV, "w") as f:
                f.write("STARSEED_PASARELA_EXPLABS_MODELOS=viejo\n")
            r = E.actualizar(forzar=True, pedir=lambda k: DATOS)
            self.assertTrue(r["hecho"])
            self.assertEqual(json.load(open(E.ESTADO))["decisiones_gratis"][0], "jev-latest")
            self.assertIn("deepseek-v4.1-flash-uncensored", open(E.ENV).read())
            self.assertEqual(oct(os.stat(E.ENV).st_mode & 0o777), "0o600")
            # Antes de 6 h no vuelve a pedir.
            r2 = E.actualizar(pedir=lambda k: (_ for _ in ()).throw(AssertionError("no debía pedir")))
            self.assertFalse(r2["hecho"])
        finally:
            E.ESTADO, E.ENV = antes
            os.environ.pop("EXPLABS_API_KEY", None)


if __name__ == "__main__":
    unittest.main()
