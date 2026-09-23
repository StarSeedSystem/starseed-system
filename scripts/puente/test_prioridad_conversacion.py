# -*- coding: utf-8 -*-
"""Mientras Alex habla con Astraura, la conversación manda (2026-09-22).

Esa noche el guardia congeló la voz y BitNet en plena conversación para dar RAM al
enjambre: la voz se partía y BitNet llevaba dos días parado reteniendo su puerto. Aquí se
fija la regla invertida: con conversación, los motores nunca se congelan y es el enjambre el
que cede; sin conversación, se reanuda solo lo que congeló esta regla.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..",
                                "native", "astraura-voice", "conversacion"))

import prioridad_conversacion as P  # noqa: E402
import voz_rt_logica as V  # noqa: E402

PROCESOS = [
    (10, "S", "/opt/x/opencode", "/opt/x/opencode run --model groq/llama"),
    (11, "S", "/opt/homebrew/Cellar/python@3.14/Python", "/opt/homebrew/python3.14 -u /Users/a/bin/starseed-enjambre.py cola.json"),
    (12, "R", "node", "node /r/node_modules/.bin/next build"),
    (13, "S", "node", "node /r/node_modules/.bin/next start -p 9002"),
    (14, "T", "/x/llama-server", "/x/llama-server -m modelo.gguf --port 8790"),
    (15, "S", "/x/tts-server", "/x/tts-server --port 4503"),
    (16, "T", "/opt/x/opencode", "/opt/x/opencode run --model otra"),
    (17, "S", "node", "node /r/node_modules/.bin/tsc --noEmit"),
]


class LaConcesion(unittest.TestCase):
    def test_activa_si_no_ha_caducado(self):
        self.assertTrue(P.activa({"hasta": 200}, ahora=100))
        self.assertFalse(P.activa({"hasta": 50}, ahora=100))
        self.assertFalse(P.activa({}, ahora=100))
        self.assertFalse(P.activa({"hasta": "x"}, ahora=100))

    def test_la_voz_y_el_guardia_leen_lo_mismo(self):
        c = V.renovar_concesion({}, "orbe", ahora=1000, segundos=90)
        self.assertTrue(P.activa(c, ahora=1050))
        self.assertTrue(V.concesion_activa(c, ahora=1050))
        self.assertFalse(P.activa(c, ahora=1091))

    def test_renovar_conserva_el_inicio_de_la_conversacion(self):
        c = V.renovar_concesion({}, "orbe", ahora=1000)
        c2 = V.renovar_concesion(c, "orbe", ahora=1030)
        self.assertEqual(c2["desde"], 1000)
        self.assertEqual(c2["hasta"], 1120)


class QuienCedeLaRam(unittest.TestCase):
    def test_reconoce_el_trabajo_de_fondo_y_no_el_servidor_del_mando(self):
        self.assertTrue(P.es_enjambre("/opt/x/opencode run --model m"))
        self.assertTrue(P.es_enjambre("/opt/homebrew/python3.14 -u /h/bin/starseed-enjambre.py c.json"))
        self.assertTrue(P.es_enjambre("node /r/node_modules/.bin/next build"))
        self.assertTrue(P.es_enjambre("node /r/node_modules/.bin/tsc --noEmit"))
        self.assertFalse(P.es_enjambre("node /r/node_modules/.bin/next start -p 9002"))
        self.assertFalse(P.es_enjambre("/x/llama-server --port 8790"))
        self.assertFalse(P.es_enjambre("grep opencode run"))

    def test_con_conversacion_se_congela_el_enjambre_y_se_reanudan_los_motores(self):
        d = P.decidir(True, PROCESOS, set())
        self.assertEqual(d["congelar"], [10, 11, 12, 17])  # el 16 ya estaba parado
        self.assertEqual(d["motores"], [14])
        self.assertEqual(d["reanudar"], [])

    def test_sin_conversacion_solo_se_reanuda_lo_marcado_y_vivo(self):
        d = P.decidir(False, PROCESOS, {10, 16, 999})
        self.assertEqual(d["reanudar"], [10, 16])
        self.assertEqual(d["congelar"], [])
        self.assertEqual(d["motores"], [])

    def test_sin_conversacion_y_sin_marcas_no_se_toca_nada(self):
        self.assertEqual(P.decidir(False, PROCESOS, set()), {"congelar": [], "reanudar": [], "motores": []})

    def test_la_marca_se_guarda_y_se_borra(self):
        ruta = tempfile.mktemp()
        P.guardar_marca({3, 1}, ruta)
        self.assertEqual(P.leer_marca(ruta), {1, 3})
        P.guardar_marca(set(), ruta)
        self.assertFalse(os.path.exists(ruta))


class LaVozSeAdaptaAlProcesador(unittest.TestCase):
    def test_baja_pasos_si_no_llega_y_los_sube_con_holgura(self):
        self.assertEqual(V.ajustar_pasos(0.6, 6), 5)
        self.assertEqual(V.ajustar_pasos(0.1, 6), 7)
        self.assertEqual(V.ajustar_pasos(0.3, 6), 6)
        self.assertEqual(V.ajustar_pasos(0.9, V.PASOS_MIN), V.PASOS_MIN)
        self.assertEqual(V.ajustar_pasos(0.01, V.PASOS_MAX), V.PASOS_MAX)
        self.assertEqual(V.ajustar_pasos("x", 6), 6)

    def test_limpia_lo_que_no_se_pronuncia(self):
        t = V.limpiar_para_voz("**Hola** 😀 mira https://starseed.dev/x ### ya")
        self.assertEqual(t, "Hola mira enlace ya")

    def test_el_wav_tiene_cabecera_y_datos(self):
        w = V.wav_pcm16([0.0, 1.0, -1.0], 24000)
        self.assertEqual(w[:4], b"RIFF")
        self.assertEqual(w[8:12], b"WAVE")
        self.assertEqual(len(w), 44 + 6)


if __name__ == "__main__":
    unittest.main()
