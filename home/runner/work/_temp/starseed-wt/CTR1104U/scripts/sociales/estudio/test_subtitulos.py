"""test_subtitulos.py — pruebas para generación de subtítulos (.vtt y .srt) a partir de beats.

  python3 -m unittest scripts/sociales/estudio/test_subtitulos.py -v

  Basado en §12 de metageminis-estudio.md: los subtítulos se generan a partir de los beats
  (inicio, fin, texto) del guion.
"""
from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

import subtitulos  # noqa: E402


class FormatearVTT(unittest.TestCase):
    def test_formato_vtt_con_header(self):
        vtt = subtitulos.format_vtt([])
        self.assertIn("WEBVTT", vtt)
        self.assertIn("\n\n", vtt)

    def test_una_linea_vtt(self):
        vtt = subtitulos.format_vtt([{"t": 0.0, "d": 3.5, "texto": "Bienvenidos"}])
        self.assertIn("00:00:00.000 --> 00:00:03.500", vtt)
        self.assertIn("Bienvenidos", vtt)

    def test_multiples_lineas_en_un_tiempo(self):
        vtt = subtitulos.format_vtt([{"t": 5.0, "d": 4.0, "texto": "Primera\nSegunda"}])
        self.assertIn("00:00:05.000 --> 00:00:09.000", vtt)
        self.assertIn("Primera", vtt)
        self.assertIn("Segunda", vtt)

    def test_formato_timecode(self):
        self.assertEqual(subtitulos.format_timestamp(0), "00:00:00.000")
        self.assertEqual(subtitulos.format_timestamp(3.5), "00:00:03.500")
        self.assertEqual(subtotulos.format_timestamp(65.5), "00:01:05.500")
        self.assertEqual(subtitulos.format_timestamp(3665.123), "01:01:05.123")


class FormatearSRT(unittest.TestCase):
    def test_formato_srt(self):
        srt = subtitulos.format_srt([{"t": 0.0, "d": 3.5, "texto": "Bienvenidos"}])
        self.assertIn("1", srt)
        self.assertIn("00:00:00,000 --> 00:00:03,500", srt)
        self.assertIn("Bienvenidos", srt)

    def test_secuencia_numerica(self):
        srt = subtitulos.format_srt([
            {"t": 0.0, "d": 2.0, "texto": "Uno"},
            {"t": 3.0, "d": 2.0, "texto": "Dos"},
        ])
        self.assertIn("1", srt)
        self.assertIn("2", srt)

    def test_timecode_srt_coma(self):
        srt = subtitulos.format_srt([{"t": 1.5, "d": 2.5, "texto": "Test"}])
        self.assertIn("00:00:01,500 --> 00:00:04,000", srt)


class DeBeats(unittest.TestCase):
    def test_beats_vacios_devuelve_archivo_valido(self):
        with tempfile.TemporaryDirectory() as d:
            vtt_path = Path(d) / "sub.vtt"
            srt_path = Path(d) / "sub.srt"
            subtitulos.generar_subtitulos([], vtt_path, srt_path)
            self.assertTrue(vtt_path.exists())
            self.assertTrue(srt_path.exists())
            self.assertIn("WEBVTT", vtt_path.read_text())

    def test_un_beat(self):
        beats = [{"t": 0.0, "d": 5.0, "texto": "Hola mundo"}]
        with tempfile.TemporaryDirectory() as d:
            vtt_path = Path(d) / "sub.vtt"
            srt_path = Path(d) / "sub.srt"
            subtitulos.generar_subtitulos(beats, vtt_path, srt_path)
            vtt = vtt_path.read_text()
            srt = srt_path.read_text()
            self.assertIn("00:00:00.000 --> 00:00:05.000", vtt)
            self.assertIn("00:00:00,000 --> 00:00:05,000", srt)

    def test_multiple_beats(self):
        beats = [
            {"t": 0.0, "d": 3.0, "texto": "Primer mensaje"},
            {"t": 3.5, "d": 4.0, "texto": "Segundo mensaje"},
            {"t": 8.0, "d": 2.0, "texto": "Tercero"},
        ]
        with tempfile.TemporaryDirectory() as d:
            vtt_path = Path(d) / "sub.vtt"
            srt_path = Path(d) / "sub.srt"
            subtitulos.generar_subtitulos(beats, vtt_path, srt_path)
            vtt = vtt_path.read_text()
            srt = srt_path.read_text()
            self.assertIn("00:00:03.500 --> 00:00:07.500", vtt)
            self.assertIn("00:00:3,500 --> 00:00:07,500", srt)


class LecturaVTT(unittest.TestCase):
    def test_leer_vtt_vacio(self):
        vtt = "WEBVTT\n\n"
        beats = subtitulos.leer_vtt(vtt)
        self.assertEqual(beats, [])

    def test_leer_vtt_un_beat(self):
        vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest de subtítulos\n"
        beats = subtitulos.leer_vtt(vtt)
        self.assertEqual(len(beats), 1)
        self.assertAlmostEqual(beats[0]["t"], 1.0)
        self.assertAlmostEqual(beats[0]["d"], 3.0)
        self.assertEqual(beats[0]["texto"], "Test de subtítulos")


class LecturaSRT(unittest.TestCase):
    def test_leer_srt_vacio(self):
        srt = ""
        beats = subtitulos.leer_srt(srt)
        self.assertEqual(beats, [])

    def test_leer_srt_un_beat(self):
        srt = "1\n00:00:01,000 --> 00:00:04,000\nTest de subtítulos\n"
        beats = subtitulos.leer_srt(srt)
        self.assertEqual(len(beats), 1)
        self.assertAlmostEqual(beats[0]["t"], 1.0)
        self.assertAlmostEqual(beats[0]["d"], 3.0)
        self.assertEqual(beats[0]["texto"], "Test de subtítulos")


class Normalizacion(unittest.TestCase):
    def test_redondear_tiempos(self):
        self.assertAlmostEqual(subtitulos.redondear_tiempo(1.234567), 1.235, places=3)
        self.assertAlmostEqual(subtitulos.redondear_tiempo(3.999), 4.0, places=3)

    def test_fusionar_subtitulos_con_beats(self):
        beats = [
            {"t": 0.0, "d": 5.0, "texto": "Original"},
        ]
        extra = [{"t": 1.0, "d": 3.0, "texto": "Adicional"}]
        result = subtitulos.fusear_beats(beats, extra)
        self.assertEqual(len(result), 3)


if __name__ == "__main__":
    unittest.main()