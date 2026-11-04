"""Pruebas de subtitulos.py — genera .vtt y .srt a partir de beats.

  python3 -m unittest scripts/sociales/estudio/test_subtitulos -v
  o: cd scripts/sociales/estudio && python3 -m unittest -v test_subtitulos
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from subtitulos import generar_vtt, generar_srt, a_archivo, SubtitleEntry, _extraer_texto, _beats_a_entradas


# Beats de prueba basados en la estructura del guion siembra-starseed
_BEATS_REEL_ES = [
    {"t": 0.3, "d": 2.5, "kicker": "Fase Semilla", "titular": "Todo comienza con una *semilla*", "acento": "logica"},
    {"t": 3.5, "d": 2.5, "titular": "Un sistema operativo social, abierto y de *todos*", "sub": "Lo estamos construyendo en abierto", "acento": "zenith"},
    {"t": 6.0, "d": 5.4, "lista": [
        {"texto": "Participa", "color": "zenith", "t": 0.0},
        {"texto": "Voluntariado", "color": "horizonte", "t": 0.95},
        {"texto": "Aporta código", "color": "logica", "t": 1.9},
        {"texto": "Dona", "color": "anchor", "t": 2.85},
    ], "acento": "zenith"},
    {"t": 11.4, "d": 3.6, "fin": True, "sello": True, "titular": "Siembra con *nosotros*", "cta": "starseed-os.vercel.app", "aviso": "Código abierto · AGPL-3.0 · Donaciones: enlace próximamente", "acento": "horizonte"},
]

_BEATS_SIMPLES = [
    {"t": 1.0, "d": 3.0, "titular": "Hola mundo", "kicker": "Inicio", "sub": "Subtítulo opcional"},
]

_BEATS_LISTA_SOLO = [
    {"t": 0.0, "d": 4.0, "lista": [
        {"texto": "Primer item", "t": 0.0},
        {"texto": "Segundo item", "t": 1.5},
        {"texto": "Tercer item", "t": 3.0},
    ]},
]


class VttTests(unittest.TestCase):
    def test_vtt_cabecera(self):
        vtt = generar_vtt(_BEATS_SIMPLES, encabezado="WEBVTT")
        self.assertIn("WEBVTT", vtt)
        self.assertIn("00:00:01,000 --> 00:00:04,000", vtt)

    def test_vtt_con_kicker_y_titular(self):
        vtt = generar_vtt(_BEATS_SIMPLES)
        self.assertIn("Inicio", vtt)
        self.assertIn("Hola mundo", vtt)

    def test_vtt_solo_texto(self):
        vtt = generar_vtt(_BEATS_LISTA_SOLO)
        self.assertIn("WEBVTT", vtt)
        lines = [l for l in vtt.split("\n") if l.strip()]
        self.assertGreater(len(lines), 3)

    def test_vtt_beats_reel_es(self):
        vtt = generar_vtt(_BEATS_REEL_ES)
        self.assertIn("WEBVTT", vtt)
        self.assertIn("Fase Semilla", vtt)
        self.assertIn("Todo comienza con una *semilla*", vtt)
        self.assertIn("Siembra con *nosotros*", vtt)


class SrtTests(unittest.TestCase):
    def test_srt_formato_correcto(self):
        srt = generar_srt(_BEATS_SIMPLES)
        self.assertIn("00:00:01,000 --> 00:00:04,000", srt)

    def test_srt_con_cada_beat(self):
        srt = generar_srt(_BEATS_LISTA_SOLO)
        lines = [l for l in srt.split("\n") if l.strip()]
        self.assertGreater(len(lines), 0)

    def test_srt_beats_reel_es(self):
        srt = generar_srt(_BEATS_REEL_ES)
        self.assertIn("Siembra con *nosotros*", srt)
        self.assertIn("Código abierto", srt)


class AArchivoTests(unittest.TestCase):
    def test_a_archivo_vtt(self):
        with tempfile.TemporaryDirectory() as tmp:
            a_archivo(_BEATS_SIMPLES, Path(tmp), formato="vtt")
            archivos = list(Path(tmp).glob("*.vtt"))
            self.assertEqual(len(archivos), 1)
            contenido = archivos[0].read_text(encoding="utf8")
            self.assertTrue(contenido.startswith("WEBVTT"))

    def test_a_archivo_srt(self):
        with tempfile.TemporaryDirectory() as tmp:
            a_archivo(_BEATS_SIMPLES, Path(tmp), formato="srt")
            archivos = list(Path(tmp).glob("*.srt"))
            self.assertEqual(len(archivos), 1)
            contenido = archivos[0].read_text(encoding="utf8")
            self.assertTrue(contenido.startswith("1"))


class SubtitleEntryTests(unittest.TestCase):
    def test_extraer_texto_con_kicker(self):
        beat = {"kicker": "Fase Semilla", "titular": "Todo comienza"}
        self.assertIn("Fase Semilla", _extraer_texto(beat))
        self.assertIn("Todo comienza", _extraer_texto(beat))

    def test_extraer_texto_sin_datos(self):
        self.assertEqual(_extraer_texto({}), "")

    def test_beats_a_entradas_basico(self):
        entradas = _beats_a_entradas(_BEATS_SIMPLES)
        self.assertEqual(len(entradas), 1)
        # Texto: titular + kicker + sub (orden natural de subtítulos)
        self.assertEqual(entradas[0].texto, "Hola mundo Inicio Subtítulo opcional")

    def test_beats_a_entradas_con_lista(self):
        entradas = _beats_a_entradas(_BEATS_LISTA_SOLO)
        self.assertEqual(len(entradas), 4)

    def test_subentry_tiempos_correctos(self):
        entradas = _beats_a_entradas(_BEATS_LISTA_SOLO)
        # Orden: entrada principal (índice 0) + items de lista (índices 1,2,3)
        self.assertEqual(entradas[0].inicio, 0.0)
        self.assertEqual(entradas[0].fin, 4.0)
        self.assertEqual(entradas[1].inicio, 0.0)
        self.assertEqual(entradas[1].fin, 4.0)
        self.assertEqual(entradas[2].inicio, 1.5)
        self.assertEqual(entradas[2].fin, 5.5)
        self.assertEqual(entradas[3].inicio, 3.0)
        self.assertEqual(entradas[3].fin, 7.0)


if __name__ == "__main__":
    unittest.main()