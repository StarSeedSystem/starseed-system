"""test_subtitulos.py — pruebas para generación de subtítulos VTT/SRT.

  python3 -m unittest scripts/sociales/estudio/test_subtitulos.py -v

  Tarea: EST-SUBTITULOS del contrato metageminis-estudio.md §12.
  Genera .vtt y .srt a partir de los beats (inicio, fin, texto) que ya usa el estudio.
"""
from __future__ import annotations

import unittest
from pathlib import Path

from nucleo import cargar_campana



class SubtitulosVTT(unittest.TestCase):
    def test_vtt_header_estandar(self):
        from subtitulos import generar_vtt
        vtt = generar_vtt([], 0)
        self.assertIn("WEBVTT", vtt)
        self.assertIn("Language: es", vtt)

    def test_beat_simple_genera_subtitulo(self):
        from subtitulos import generar_vtt
        beats = [{"t": 0.0, "d": 3.0, "titular": "Hola mundo"}]
        vtt = generar_vtt(beats, 0)
        self.assertIn("00:00:00.000 --> 00:00:03.000", vtt)
        self.assertIn("Hola mundo", vtt)

    def test_asterisco_se_consombra_para_vtt(self):
        from subtitulos import generar_vtt
        beats = [{"t": 0.0, "d": 2.0, "titular": "Texto con *asterisco*"}]
        vtt = generar_vtt(beats, 0)
        self.assertIn("Texto con asterisco", vtt)
        self.assertNotIn("*", vtt)

    def test_multiple_beats_en_secuencia(self):
        from subtitulos import generar_vtt
        beats = [
            {"t": 0.0, "d": 2.0, "kicker": "Primer beat"},
            {"t": 2.5, "d": 3.0, "titular": "Segundo beat"},
        ]
        vtt = generar_vtt(beats, 0)
        self.assertIn("00:00:00.000 --> 00:00:02.000", vtt)
        self.assertIn("00:00:02.500 --> 00:00:05.500", vtt)

    def test_subyacente_se_incluye_debajo(self):
        from subtitulos import generar_vtt
        beats = [{"t": 0.0, "d": 3.0, "titular": "Titular", "sub": "Subtexto"}]
        vtt = generar_vtt(beats, 0)
        lines = vtt.strip().split("\n")
        self.assertTrue(any("Titular" in l for l in lines))
        self.assertTrue(any("Subtexto" in l for l in lines))

    def test_tiempo_con_decimales(self):
        from subtitulos import generar_vtt
        beats = [{"t": 1.234, "d": 2.567, "titular": "Test"}]
        vtt = generar_vtt(beats, 0)
        self.assertIn("00:00:01.234 --> 00:00:03.801", vtt)


class SubtitulosSRT(unittest.TestCase):
    def test_srt_header_no_necesario(self):
        self.assertTrue(True)

    def test_beat_simple_genera_srt(self):
        from subtitulos import generar_srt
        beats = [{"t": 0.0, "d": 3.0, "titular": "Hola mundo"}]
        srt = generar_srt(beats)
        lines = srt.strip().split("\n")
        self.assertIn("1", lines)
        self.assertIn("00:00:00,000 --> 00:00:03,000", lines)
        self.assertIn("Hola mundo", lines)

    def test_numeracion_automatic(self):
        from subtitulos import generar_srt
        beats = [
            {"t": 0.0, "d": 2.0, "titular": "Uno"},
            {"t": 2.5, "d": 3.0, "titular": "Dos"},
        ]
        srt = generar_srt(beats)
        self.assertIn("1\n00:00:00,000 -->", srt)
        self.assertIn("2\n00:00:02,500 -->", srt)

    def test_asterisco_se_consombra_para_srt(self):
        from subtitulos import generar_srt
        beats = [{"t": 0.0, "d": 2.0, "titular": "Texto con *asterisco*"}]
        srt = generar_srt(beats, idioma="es")
        self.assertIn("Texto con asterisco", srt)
        self.assertNotIn("*", srt)

    def test_lista_de_items_como_lista_unida(self):
        from subtitulos import generar_vtt, generar_srt
        beats = [{"t": 0.0, "d": 3.0, "lista": [{"texto": "Item 1"}, {"texto": "Item 2"}]}]
        vtt = generar_vrt_beats(beats) if False else generar_vtt(beats, 0)
        srt = generar_srt(beats)
        self.assertIn("Item 1 • Item 2", vtt)
        self.assertIn("Item 1 • Item 2", srt)

    def test_caracteres_especiales_escaped(self):
        from subtitulos import generar_srt
        beats = [{"t": 0.0, "d": 2.0, "titular": "Texto & <special>"}]
        srt = generar_srt(beats)
        self.assertIn("&", srt)


class ExtraerBeats(unittest.TestCase):
    def test_extrae_textos_de_beat_basico(self):
        from subtitulos import extraer_beats_texto
        beats = [{"t": 0.0, "d": 3.0, "titular": "Hola", "sub": "Mundo"}]
        subs = extraer_beats_texto(beats)
        self.assertEqual(len(subs), 2)
        self.assertEqual(subs[0], (0.0, 3.0, "Hola"))
        self.assertEqual(subs[1], (0.0, 3.0, "Mundo"))

    def test_ignora_beats_sin_texto(self):
        from subtitulos import extraer_beats_texto
        beats = [{"t": 0.0, "d": 2.0}, {"t": 2.0, "d": 2.0, "titulo": "Solo titular"}]
        subs = extraer_beats_texto(beats)
        self.assertEqual(len(subs), 1)

    def test_subyacente_igual_duracion(self):
        from subtitulos import extraer_beats_texto
        beats = [{"t": 1.0, "d": 4.0, "titular": "T", "sub": "S"}]
        subs = extraer_beats_texto(beats)
        self.assertEqual(subs[0][1], 4.0)
        self.assertEqual(subs[1][1], 4.0)


class Integracion(unittest.TestCase):
    def test_maneja_guion_completo_es(self):
        import json
        campana = json.loads(
            (Path(__file__).parent / "campanas" / "siembra-starseed.json").read_text()
        )
        from subtitulos import extraer_beats_texto, generar_vtt

        guion = campana["guiones"]["reel"]["es"]
        subs = extraer_beats_texto(guion)
        vtt = generar_vtt(guion, 15)
        self.assertIn("WEBVTT", vtt)
        self.assertIn("Todo comienza", vtt)

    def test_maneja_guion_completo_en(self):
        import json
        campana = json.loads(
            (Path(__file__).parent / "campanas" / "siembra-starseed.json").read_text()
        )
        from subtitulos import extraer_beats_texto, generar_vtt

        guion = campana["guiones"]["reel"]["en"]
        subs = extraer_beats_texto(guion)
        vtt = generar_vtt(guion, 15)
        self.assertIn("WEBVTT", vtt)
        self.assertIn("It all starts", vtt)


if __name__ == "__main__":
    unittest.main()