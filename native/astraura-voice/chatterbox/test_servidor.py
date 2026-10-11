#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni GPU para el servicio local Chatterbox — VZR1011A."""
import unittest, time, threading, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from servidor import salud, generar, generar_stream, ModeloSimulado, PUERTO

class PruebasChatterboxLocal(unittest.TestCase):
    def test_salud_con_modelos_simulados(self):
        resp = salud()
        self.assertIn("dispositivo", resp)
        self.assertIn("modelos_cargados", resp)
        self.assertIsInstance(resp["modelos_cargados"], list)

    def test_generar_conserva_marca_perth(self):
        audio = generar("Hola, soy Aurora de StarSeed.", idioma="es", exageracion=0.5)
        self.assertIsInstance(audio, bytes)
        self.assertTrue(audio.startswith(b"RIFF"))
        # Marca Perth siempre presente
        self.assertIn(b"PERTH", audio)
        # Debe contener cabecera WAVE
        self.assertIn(b"WAVE", audio)

    def test_generar_stream_por_frases(self):
        chunks = generar_stream("Hola, soy Aurora. ¿Cómo estás hoy?", idioma="es")
        self.assertIsInstance(chunks, list)
        self.assertTrue(len(chunks) > 0)
        for ch in chunks:
            self.assertIsInstance(ch, bytes)
            self.assertIn(b"PERTH", ch)

    def test_modelo_simulado_carga_perezosa(self):
        m = ModeloSimulado("test", "es")
        self.assertFalse(m.cargado)
        m.cargar()
        self.assertTrue(m.cargado)
        m.descargar()
        self.assertFalse(m.cargado)

    def test_puerto_configurable(self):
        self.assertEqual(PUERTO, int(os.getenv("CHATTERBOX_PUERTO", "4600")))

if __name__ == "__main__":
    unittest.main(verbosity=2)
