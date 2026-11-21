#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for background Hermes jobs (hermes_job.py)."""
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hermes_job as H


class FalsoCorrer:
    """Falso para `correr` que simula Hermes tardando más de 120s."""

    def __init__(self, duracion=3.0, resultado="Respuesta de Hermes en background", rc=0):
        self.duracion = duracion
        self.resultado = resultado
        self.rc = rc
        self.llamadas = []

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        self.llamadas.append({"orden": orden, "segundos": segundos})
        if self.duracion > 0:
            time.sleep(self.duracion)
        return self.rc, self.resultado


class TestHermesJob(unittest.TestCase):
    """Tests for background Hermes job functionality."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.estado = {"hermes_jobs": {}}

    def tearDown(self):
        self.tmp.cleanup()

    def test_crear_job_devuelve_id(self):
        job_id = H.crear_job("prompt", self.estado)
        self.assertTrue(job_id.startswith("hjob-"))
        self.assertIn(job_id, self.estado["hermes_jobs"])

    def test_crear_job_guarda_estado_inicial(self):
        job_id = H.crear_job("prompt de prueba", self.estado)
        job = self.estado["hermes_jobs"][job_id]
        self.assertEqual(job["estado"], "en_curso")
        self.assertEqual(job["prompt"], "prompt de prueba")
        self.assertIn("inicio", job)

    def test_lanzar_job_ejecuta_y_completa(self):
        falso = FalsoCorrer(duracion=0.1, resultado="Respuesta completada")
        job_id = H.crear_job("prompt", self.estado)
        hilo = H.lanzar_job(job_id, self.estado, correr=falso)
        hilo.join(timeout=2.0)
        job = self.estado["hermes_jobs"][job_id]
        self.assertEqual(job["estado"], "completado")
        self.assertEqual(job["resultado"], "Respuesta completada")
        self.assertIn("fin", job)
        self.assertIn("hermes", falso.llamadas[0]["orden"][0])

    def test_lanzar_job_maneja_error(self):
        falso = FalsoCorrer(duracion=0.1, resultado="Error de Hermes", rc=1)
        job_id = H.crear_job("prompt", self.estado)
        hilo = H.lanzar_job(job_id, self.estado, correr=falso)
        hilo.join(timeout=2.0)
        job = self.estado["hermes_jobs"][job_id]
        self.assertEqual(job["estado"], "error")
        self.assertIn("Error de Hermes", job["error"])

    def test_obtener_estado_job(self):
        job_id = H.crear_job("prompt", self.estado)
        self.assertEqual(H.obtener_estado(job_id, self.estado)["estado"], "en_curso")

    def test_obtener_estado_job_inexistente(self):
        self.assertIsNone(H.obtener_estado("hjob-inexistente", self.estado))

    def test_job_usa_timeout_extendido(self):
        falso = FalsoCorrer(duracion=0.1, resultado="OK")
        job_id = H.crear_job("prompt", self.estado)
        H.lanzar_job(job_id, self.estado, correr=falso, segundos=600)
        self.assertEqual(falso.llamadas[0]["segundos"], 600)

    def test_callback_progreso_se_llama(self):
        avisos = []
        falso = FalsoCorrer(duracion=0.1, resultado="OK")
        job_id = H.crear_job("prompt", self.estado)
        hilo = H.lanzar_job(job_id, self.estado, correr=falso, callback_progreso=lambda m: avisos.append(m))
        hilo.join(timeout=2.0)
        self.assertTrue(any("iniciando" in a.lower() for a in avisos))
        self.assertTrue(any("completado" in a.lower() for a in avisos))


if __name__ == "__main__":
    unittest.main()