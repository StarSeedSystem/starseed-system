"""Pruebas para la generación de subtítulos (.vtt y .srt) a partir de beats.

  python3 -m unittest scripts/sociales/estudio/test_subtitulos.py -v
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class TestSubtitulos(unittest.TestCase):
    def test_generar_vtt_crea_formato_valido(self):
        beats = [
            {"t": 0.0, "d": 3.5, "titular": "Primer mensaje"},
            {"t": 4.0, "d": 3.0, "titular": "Segundo mensaje", "sub": "Subtítulo"},
            {"t": 7.5, "d": 2.5, "fin": True, "cta": "starseed-os.vercel.app"},
        ]
        import subtitulos
        result = subtitulos.generar_vtt(beats, "es")
        self.assertIn("WEBVTT", result)
        self.assertIn("00:00:00.000 --> 00:00:03.500", result)
        self.assertIn("Primer mensaje", result)

    def test_generar_srt_crea_formato_valido(self):
        beats = [
            {"t": 0.0, "d": 3.5, "titular": "Primer mensaje"},
            {"t": 4.0, "d": 3.0, "titular": "Segundo mensaje"},
        ]
        import subtitulos
        result = subtitulos.generar_srt(beats, "es")
        self.assertIn("1", result)
        self.assertIn("00:00:00,000 --> 00:00:03,500", result)
        self.assertIn("Primer mensaje", result)

    def test_extraer_texto_de_beat(self):
        import subtitulos
        beat = {"t": 0.0, "d": 3.5, "titular": "Título", "sub": "Subtítulo", "cta": "CTA"}
        self.assertEqual(subtitulos.texto_para_subtitulo(beat), "Título • Subtítulo • CTA")

    def test_extraer_texto_con_lista(self):
        import subtitulos
        beat = {"t": 4.0, "d": 3.0, "lista": [
            {"texto": "Participa", "t": 0.0}, {"texto": "Voluntariado", "t": 1.0},
        ]}
        texto = subtitulos.texto_para_subtitulo(beat)
        self.assertIn("Participa", texto)
        self.assertIn("Voluntariado", texto)

    def test_formato_tiempo_vtt(self):
        import subtitulos
        self.assertEqual(subtitulos.formatear_tiempo_vtt(0.0), "00:00:00.000")
        self.assertEqual(subtitulos.formatear_tiempo_vtt(3.5), "00:00:03.500")
        self.assertEqual(subtitulos.formatear_tiempo_vtt(42.123), "00:00:42.123")

    def test_formato_tiempo_srt(self):
        import subtitulos
        self.assertEqual(subtitulos.formatear_tiempo_srt(0.0), "00:00:00,000")
        self.assertEqual(subtitulos.formatear_tiempo_srt(3.5), "00:00:03,500")
        self.assertEqual(subtitulos.formatear_tiempo_srt(42.123), "00:00:42,123")

    def test_beats_vacio_no_falla(self):
        import subtitulos
        self.assertEqual(subtitulos.generar_vtt([], "es"), "WEBVTT\n")
        self.assertEqual(subtitulos.generar_srt([], "es"), "")

    def test_ignorar_beats_sin_texto(self):
        import subtitulos
        beats = [
            {"t": 0.0, "d": 3.5, "fin": True},
            {"t": 4.0, "d": 3.0, "aviso": "info@starseed-os.vercel.app"},
        ]
        result = subtitulos.generar_vtt(beats, "es")
        self.assertIn("WEBVTT", result)
        self.assertNotIn("info@starseed-os.vercel.app", result)

    def test_ingles_y_espanol(self):
        import subtitulos
        beats = [{"t": 0.0, "d": 3.5, "titular": "Hola", "sub": "Mundo"}]
        vtt_es = subtitulos.generar_vtt(beats, "es")
        vtt_en = subtitulos.generar_vtt(beats, "en")
        self.assertIn("Hola", vtt_es)
        self.assertEqual(vtt_es, vtt_en)


class TestQuemarSubtitulos(unittest.TestCase):
    def test_quemar_falla_si_no_hay_ffmpeg(self):
        import subtitulos
        with patch('shutil.which', return_value=None):
            with self.assertRaises(FileNotFoundError):
                subtitulos.quemar_subtitulos(Path("/tmp/vid.mp4"), Path("/tmp/sub.srt"))

    def test_quemar_falla_con_video_invalido(self):
        import subtitulos
        if shutil.which("ffmpeg") is None:
            self.skipTest("ffmpeg no está disponible")
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            video, srt = d / "test.mp4", d / "sub.srt"
            video.write_bytes(b"fake video")
            srt.write_text("1\n00:00:00,000 --> 00:00:03,000\nTest")
            with self.assertRaises(subprocess.CalledProcessError):
                subtitulos.quemar_subtitulos(video, srt)


class TestGenerarYQuemar(unittest.TestCase):
    def test_generar_y_quemar_crea_vtt_y_srt(self):
        import subtitulos
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            video = d / "test.mp4"
            video.write_bytes(b"fake video")
            beats = [{"t": 0.0, "d": 3.0, "titular": "Hola"}]
            result = subtitulos.generar_y_quemar(video, beats, quemar=False)
            self.assertEqual(result["vtt_path"], d / "test-es.vtt")
            self.assertEqual(result["srt_path"], d / "test-es.srt")
            self.assertIn("Hola", result["vtt_path"].read_text())
            self.assertIn("Hola", result["srt_path"].read_text())

    def test_generar_y_quemar_sin_video_valido(self):
        import subtitulos
        with patch('shutil.which', return_value='/usr/bin/ffmpeg'):
            with patch('subprocess.run', side_effect=subprocess.CalledProcessError(1, 'ffmpeg')):
                with tempfile.TemporaryDirectory() as tmp:
                    d = Path(tmp)
                    video = d / "test.mp4"
                    video.write_bytes(b"fake video")
                    beats = [{"t": 0.0, "d": 3.0, "titular": "Hola"}]
                    result = subtitulos.generar_y_quemar(video, beats, quemar=True)
                    self.assertIn("vtt_path", result)
                    self.assertIn("srt_path", result)
                    self.assertEqual(result.get("video_path"), None)


if __name__ == "__main__":
    unittest.main()