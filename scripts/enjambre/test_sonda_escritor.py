# -*- coding: utf-8 -*-
"""La sonda de 1 token sabe en un segundo lo que antes costaba 5 minutos por modelo."""
import io
import os
import sys
import unittest
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sonda_escritor as S  # noqa: E402

CFG = {"provider": {
    "openrouter": {"options": {"baseURL": "https://openrouter.ai/api/v1", "apiKey": "{env:OPENROUTER_API_KEY}"}},
    "llm7": {"options": {"baseURL": "https://api.llm7.io/v1", "apiKey": "sin-clave"}},
    "huerfano": {"options": {"baseURL": "https://x/v1", "apiKey": "{env:NO_ESTA}"}},
}}
ENV = {"OPENROUTER_API_KEY": "k-prueba", "GEMINI_API_KEY": "g-prueba"}


class Clasificar(unittest.TestCase):
    def test_respuestas_reales_del_2026_10_06(self):
        medianoche = 86400 * 20000  # un 00:00 UTC exacto
        ahora = medianoche - 3 * 3600
        casos = [
            (429, '{"error":{"message":"Rate limit exceeded: free-models-per-day-high-balance. "}}',
             (False, 3.0, False)),
            (429, "You've reached today's free-model token quota.", (False, 3.0, False)),
            (429, '{"status":429,"title":"Too Many Requests"}', (False, 0.25, False)),
            (410, "The model 'openai/gpt-oss-120b' has reached its end of life", (False, 0, True)),
            (404, 'Model "qwen3-coder-plus" does not exist.', (False, 0, True)),
            (403, "This premium model requires an active paid plan or real deposited balance.", (False, 0, True)),
            (402, "Payment Required: You have depleted your monthly included credits. Alternatively, subscribe to PRO",
             (False, 24, False)),
            (402, "This model is currently available only with a subscription.", (False, 0, True)),
            (503, "No available channel for model", (False, 0.25, False)),
            (None, "", (False, 0.25, False)),
            (200, "", (True, 0, False)),
            (400, "bad request", (True, 0, False)),
        ]
        for codigo, cuerpo, (apto, horas, muerto) in casos:
            a, motivo, h, m = S.clasificar(codigo, cuerpo, ahora)
            self.assertEqual((a, h, m), (apto, horas, muerto), (codigo, cuerpo, motivo))

    def test_medianoche_utc(self):
        self.assertEqual(S.horas_hasta_medianoche_utc(86400 * 5 - 1800), 0.5)
        self.assertEqual(S.horas_hasta_medianoche_utc(86400 * 5 - 60), 0.25)


class Destino(unittest.TestCase):
    def test_sale_del_bloque_de_opencode_y_su_env(self):
        self.assertEqual(S.destino("openrouter/google/gemma-4-31b-it:free", CFG, ENV),
                         ("https://openrouter.ai/api/v1/chat/completions", "k-prueba", "google/gemma-4-31b-it:free"))
        self.assertEqual(S.destino("llm7/gpt-oss", CFG, ENV)[1], "sin-clave")
        self.assertEqual(S.destino("google/gemini-3.6-flash", CFG, ENV)[2], "gemini-3.6-flash")

    def test_sin_destino(self):
        for m in ("codex/gpt-5.6-sol", "huerfano/x", "nadie/x", "sinbarra"):
            self.assertIsNone(S.destino(m, CFG, ENV), m)


class _Resp(object):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Sondear(unittest.TestCase):
    def test_ok_error_y_tiempo(self):
        self.assertTrue(S.sondear("openrouter/x", CFG, ENV, abrir=lambda r, t: _Resp())[0])

        def error(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {},
                                         io.BytesIO(b"Rate limit exceeded: free-models-per-day"))
        apto, motivo, horas, muerto = S.sondear("openrouter/x", CFG, ENV, abrir=error)
        self.assertFalse(apto)
        self.assertIn("cupo del día", motivo)
        self.assertGreater(horas, 0)

        def lento(req, timeout):
            raise TimeoutError("timed out")
        self.assertEqual(S.sondear("openrouter/x", CFG, ENV, abrir=lento)[1], "no contesta en %d s" % S.TIEMPO_S)

    def test_la_clave_va_en_la_cabecera_y_en_ningun_otro_sitio(self):
        vistas = []

        def mira(req, timeout):
            vistas.append((req.get_header("Authorization"), req.data.decode()))
            return _Resp()
        S.sondear("openrouter/x", CFG, ENV, abrir=mira)
        self.assertEqual(vistas[0][0], "Bearer k-prueba")
        self.assertNotIn("k-prueba", vistas[0][1])

    def test_sin_destino_no_frena(self):
        self.assertEqual(S.sondear("codex/gpt-5.6-sol", CFG, ENV)[:2], (True, "sin sonda"))


class Memoria(unittest.TestCase):
    def test_ok_vale_un_rato_y_el_veto_hasta_su_fin(self):
        m = S.Memoria()
        self.assertEqual(m.consultar("openrouter/a", 1000), (None, ""))
        m.anotar("openrouter/a", True, "responde", 0, 1000)
        self.assertTrue(m.consultar("openrouter/b", 1000 + S.OK_VALE_S - 1)[0])
        self.assertIsNone(m.consultar("openrouter/b", 1000 + S.OK_VALE_S + 1)[0])
        m.anotar("openrouter/c", False, "cupo del día agotado (429)", 2, 1000)
        self.assertEqual(m.consultar("openrouter/c", 1000 + 3600), (False, "cupo del día agotado (429)"))
        self.assertIsNone(m.consultar("openrouter/c", 1000 + 2 * 3600 + 1)[0])


if __name__ == "__main__":
    unittest.main()
