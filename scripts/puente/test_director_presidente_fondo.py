# -*- coding: utf-8 -*-
"""Pruebas de lanzar_hermes_fondo en director_presidente.py.

Ninguna prueba llama a Hermes de verdad: `correr` es un falso que devuelve
lo que cada caso necesita, y el chat vive en un `tempfile.TemporaryDirectory`.
"""

import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat as dc
import director_presidente as P
import motores_director as M


class FalsoCorrer:
    """`correr` falso que responde según la orden (hermes)."""

    def __init__(self, **respuestas):
        self.respuestas = respuestas
        self.llamadas = []

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        motor = orden[0]
        self.llamadas.append((list(orden), entrada, segundos))
        r = self.respuestas.get(motor)
        if r is None:
            raise AssertionError("no se esperaba llamar a %s" % motor)
        return r


def hermes_ok(texto="Informe de análisis completado"):
    return (0, texto)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def chat(self):
        return dc.leer(limite=500, raiz=self.raiz)

    def avisos(self):
        return [r for r in self.chat() if r.get("tipo") == "aviso"]

    def informes(self):
        return [r for r in self.chat() if r.get("tipo") == "informe"]


class TestLanzarHermesFondo(Base):
    """Tests para lanzar_hermes_fondo."""

    def test_lanzar_hermes_fondo_exito_publica_aviso_inicio_y_fin(self):
        """Lanza Hermes en fondo, publica aviso de inicio, fin y el informe."""
        falso = FalsoCorrer(hermes=hermes_ok("Resultado del análisis largo"))

        res = P.lanzar_hermes_fondo(
            prompt="Analiza el estado completo del proyecto",
            raiz=self.raiz,
            tarea_id="tarea-123",
            correr_func=falso,
        )

        self.assertEqual(res.texto, "Resultado del análisis largo")
        self.assertIsNone(res.error)
        self.assertGreater(res.duracion_seg, 0)

        # Verificar avisos: inicio, progreso (de correr_hermes_fondo), fin
        avs = self.avisos()
        self.assertGreaterEqual(len(avs), 2)
        self.assertIn("iniciado", avs[0]["texto"])
        self.assertIn("tarea-123", avs[0]["texto"])
        self.assertIn("completado", avs[-1]["texto"])

        # Verificar que se publicó el informe final
        infs = self.informes()
        self.assertEqual(len(infs), 1)
        self.assertEqual(infs[0]["texto"], "Resultado del análisis largo")
        self.assertEqual(infs[0]["modelo"], "hermes/predeterminado")
        self.assertTrue(infs[0].get("sintesis"))
        self.assertEqual(infs[0]["tarea"], "tarea-123")

    def test_lanzar_hermes_fondo_fallo_publica_error(self):
        """Si Hermes falla, publica aviso de error y no publica informe."""
        falso = FalsoCorrer(hermes=(1, "error de conexión"))

        res = P.lanzar_hermes_fondo(
            prompt="Test",
            raiz=self.raiz,
            tarea_id="tarea-fallo",
            correr_func=falso,
        )

        self.assertEqual(res.texto, "")
        self.assertIsNotNone(res.error)

        avs = self.avisos()
        self.assertGreaterEqual(len(avs), 2)
        self.assertIn("iniciado", avs[0]["texto"])
        self.assertIn("falló", avs[-1]["texto"].lower())

        # No debe haber informe si falló
        infs = self.informes()
        self.assertEqual(len(infs), 0)

    def test_lanzar_hermes_fondo_sin_tarea_id(self):
        """Sin tarea_id usa 'nueva' en los mensajes."""
        falso = FalsoCorrer(hermes=hermes_ok("OK"))

        res = P.lanzar_hermes_fondo(
            prompt="Test",
            raiz=self.raiz,
            correr_func=falso,
        )

        avs = self.avisos()
        self.assertIn("nueva", avs[0]["texto"])
        self.assertIn("nueva", avs[-1]["texto"])

    def test_lanzar_hermes_fondo_callback_adicional(self):
        """El callback_aviso adicional se llama además de publicar en chat."""
        falso = FalsoCorrer(hermes=hermes_ok("OK"))
        callbacks = []

        def callback_extra(msg):
            callbacks.append(msg)

        res = P.lanzar_hermes_fondo(
            prompt="Test",
            raiz=self.raiz,
            callback_aviso=callback_extra,
            correr_func=falso,
        )

        self.assertGreaterEqual(len(callbacks), 2)
        self.assertIn("Iniciando", callbacks[0])
        self.assertIn("completado", callbacks[-1])

    def test_lanzar_hermes_fondo_timeout_personalizado(self):
        """Se respeta el timeout personalizado pasado a correr_hermes_fondo."""
        falso = FalsoCorrer(hermes=hermes_ok("OK"))

        res = P.lanzar_hermes_fondo(
            prompt="Test",
            raiz=self.raiz,
            segundos=300,
            correr_func=falso,
        )

        # Verificar que el timeout se pasó correctamente
        self.assertEqual(falso.llamadas[0][2], 300)


if __name__ == "__main__":
    unittest.main()