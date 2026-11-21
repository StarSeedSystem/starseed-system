# -*- coding: utf-8 -*-
"""Pruebas de Hermes en segundo plano (correr_hermes_fondo).

Ninguna prueba llama a Hermes de verdad: `correr` es un falso que devuelve
lo que cada caso necesita.
"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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


def hermes_ok(texto="Respuesta de Hermes en fondo"):
    return (0, texto)


class TestCorrerHermesFondo(unittest.TestCase):
    """Tests para correr_hermes_fondo."""

    def setUp(self):
        self.avisos = []

    def callback_aviso(self, msg):
        self.avisos.append(msg)

    def test_hermes_fondo_contesta_y_devuelve_resultado(self):
        """Hermes en fondo ejecuta y devuelve resultado estructurado."""
        falso = FalsoCorrer(hermes=hermes_ok("Informe completo del análisis"))
        res = M.correr_hermes_fondo(
            prompt="Analiza el estado del proyecto",
            callback_aviso=self.callback_aviso,
            correr_func=falso,
        )

        self.assertEqual(res.texto, "Informe completo del análisis")
        self.assertEqual(res.modelo, "hermes/predeterminado")
        self.assertIsNone(res.error)
        self.assertGreater(res.duracion_seg, 0)
        self.assertIn("Iniciando", self.avisos[0])
        self.assertIn("completado", self.avisos[1])

    def test_hermes_fondo_timeout_personalizado(self):
        """Se respeta el timeout personalizado."""
        falso = FalsoCorrer(hermes=hermes_ok("OK"))
        res = M.correr_hermes_fondo(
            prompt="Test",
            segundos=300,
            correr_func=falso,
        )
        # Verificar que se pasó el timeout correcto a correr
        self.assertEqual(falso.llamadas[0][2], 300)

    def test_hermes_fondo_fallo_propaga_error(self):
        """Si Hermes falla, el error se propaga en el resultado."""
        falso = FalsoCorrer(hermes=(1, "error de conexión"))
        res = M.correr_hermes_fondo(
            prompt="Test",
            callback_aviso=self.callback_aviso,
            correr_func=falso,
        )

        self.assertEqual(res.texto, "")
        self.assertIsNotNone(res.error)
        self.assertIn("falló", self.avisos[1].lower())

    def test_hermes_fondo_sin_callback_no_falla(self):
        """Sin callback_aviso no debe fallar (usa print a stderr)."""
        falso = FalsoCorrer(hermes=hermes_ok("OK"))
        res = M.correr_hermes_fondo(
            prompt="Test",
            correr_func=falso,
        )
        self.assertEqual(res.texto, "OK")
        self.assertIsNone(res.error)


class TestResultadoHermesFondo(unittest.TestCase):
    """Tests del dataclass ResultadoHermesFondo."""

    def test_campos_obligatorios(self):
        """ResultadoHermesFondo tiene todos los campos esperados."""
        res = M.ResultadoHermesFondo(
            texto="test",
            modelo="hermes/predeterminado",
            duracion_seg=1.5,
        )
        self.assertEqual(res.texto, "test")
        self.assertEqual(res.modelo, "hermes/predeterminado")
        self.assertEqual(res.duracion_seg, 1.5)
        self.assertEqual(res.tokens_entrada, 0)
        self.assertEqual(res.tokens_salida, 0)
        self.assertIsNone(res.error)
        self.assertIsNone(res.fallback_usado)


if __name__ == "__main__":
    unittest.main()