"""Pruebas puras para subtitulos.py."""
from __future__ import annotations
import unittest
from pathlib import Path
import sys

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import subtitulos as st


class Tiempos(unittest.TestCase):
    def test_formato_vtt(self):
        self.assertEqual(st.tiempo_vtt(0), "00:00:00.000")
        self.assertEqual(st.tiempo_vtt(65.123), "00:01:05.123")
        self.assertEqual(st.tiempo_vtt(3661.5), "01:01:01.500")

    def test_formato_srt(self):
        self.assertEqual(st.tiempo_srt(0), "00:00:00,000")
        self.assertEqual(st.tiempo_srt(65.1), "00:01:05,100")
        self.assertEqual(st.tiempo_srt(3661.5), "01:01:01,500")


class Beats(unittest.TestCase):
    def test_entradas_simples(self):
        beats = [
            {"t": 0.3, "d": 2.5, "kicker": "Fase", "titular": "Todo comienza"},
            {"t": 3.0, "d": 1.0, "titular": "Sigue"},
        ]
        ents = st.beats_a_entradas(beats)
        self.assertEqual(len(ents), 2)
        self.assertAlmostEqual(ents[0]["inicio"], 0.3)
        self.assertAlmostEqual(ents[0]["fin"], 2.8)
        self.assertIn("Fase", ents[0]["texto"])
        self.assertIn("Todo comienza", ents[0]["texto"])
        self.assertEqual(ents[1]["texto"], "Sigue")

    def test_sin_texto_y_duracion_cero(self):
        beats = [{"t": 1, "d": 0, "titular": "X"}, {"t": 2, "d": 1}]
        ents = st.beats_a_entradas(beats)
        self.assertEqual(ents, [])

    def test_lista_y_tarjetas(self):
        beats = [{
            "t": 1, "d": 2,
            "titular": "T",
            "lista": [{"texto": "A"}, {"texto": "B"}],
            "tarjetas": [{"titulo": "C", "texto": "D"}]
        }]
        ents = st.beats_a_entradas(beats)
        self.assertEqual(len(ents), 1)
        txt = ents[0]["texto"]
        for w in ("T", "A", "B", "C", "D"):
            self.assertIn(w, txt)


class Generacion(unittest.TestCase):
    def test_vtt_basico(self):
        beats = [{"t": 0, "d": 1, "titular": "Hola"}]
        vtt = st.generar_vtt(beats)
        self.assertTrue(vtt.startswith("WEBVTT"))
        self.assertIn("00:00:00.000 --> 00:00:01.000", vtt)
        self.assertIn("Hola", vtt)

    def test_srt_basico(self):
        beats = [{"t": 0, "d": 1, "titular": "Hola"}, {"t": 2, "d": 1, "titular": "Adiós"}]
        srt = st.generar_srt(beats)
        self.assertIn("1", srt)
        self.assertIn("2", srt)
        self.assertIn("00:00:00,000 --> 00:00:01,000", srt)
        self.assertIn("00:00:02,000 --> 00:00:03,000", srt)
        self.assertIn("Hola", srt)
        self.assertIn("Adiós", srt)

    def test_quemar_sin_ffmpeg(self):
        # Debe devolver False cuando ffmpeg no está o falla; no lanza.
        res = st.quemar_subtitulos("a.mp4", "b.srt", "c.mp4")
        self.assertIsInstance(res, bool)


if __name__ == "__main__":
    unittest.main()
