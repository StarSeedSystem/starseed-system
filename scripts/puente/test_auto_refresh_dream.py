"""Pruebas de auto_refresh_dream: el Dream sigue soñando aunque falle el refresco.

Reparación 2026-11-11 (IMG-diaria-auto-refresh-del-catalogo-de-mode). El intento
anterior no tocó el módulo declarado y dejó esta prueba en rojo. Regla que se
demuestra: si el refresco del catálogo de modelos gratuitos falla, el Dream NO se
calla — un catálogo viejo no es motivo para perder el informe de la mañana.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from auto_refresh_dream import (
    COMANDO,
    refrescar_catalogo,
    resultado_de,
    seguir_soñando,
)


class _Proceso:
    """Falso subprocess.CompletedProcess: solo importa el código de salida."""

    def __init__(self, codigo):
        self.returncode = codigo
        self.stdout = ""
        self.stderr = ""


def _ejecutar_ok(*args, **kwargs):
    return _Proceso(0)


def _ejecutar_falla(*args, **kwargs):
    return _Proceso(1)


def _ejecutar_revienta(*args, **kwargs):
    raise RuntimeError("comando inexistente")


class TestResultado(unittest.TestCase):
    def test_solo_cero_es_ok(self):
        self.assertTrue(resultado_de(0))
        self.assertFalse(resultado_de(1))

    def test_una_excepcion_nunca_es_ok(self):
        self.assertFalse(resultado_de(None, error=RuntimeError("x")))


class TestRefrescarCatalogo(unittest.TestCase):
    def test_el_comando_por_defecto_es_el_del_dream(self):
        self.assertEqual(COMANDO, ["hermes", "model", "--refresh"])

    def test_cuando_va_bien_devuelve_ok(self):
        self.assertEqual(refrescar_catalogo(["a"], ejecutar=_ejecutar_ok), (True, "ok"))

    def test_cuando_falla_devuelve_fallo(self):
        resultado, mensaje = refrescar_catalogo(["a"], ejecutar=_ejecutar_falla)
        self.assertFalse(resultado)
        self.assertIn("código de salida 1", mensaje)

    def test_si_el_comando_revienta_no_lanza(self):
        resultado, mensaje = refrescar_catalogo(["a"], ejecutar=_ejecutar_revienta)
        self.assertFalse(resultado)
        self.assertIn("RuntimeError", mensaje)


class TestElDreamSigue(unittest.TestCase):
    def test_if_refresh_falla_el_dream_sigue_soando(self):
        # El refresco del catálogo falla (código de salida 1)…
        resultado, mensaje = refrescar_catalogo(
            ["hermes", "model", "--refresh"], ejecutar=_ejecutar_falla
        )
        self.assertFalse(resultado)
        self.assertIn("código de salida 1", mensaje)
        # …pero el sueño NO se aborta: la regla es soñar siempre.
        self.assertTrue(seguir_soñando(resultado))

    def test_if_refresh_va_bien_tambien_sigue_soñando(self):
        resultado, _ = refrescar_catalogo(["hermes", "model", "--refresh"], ejecutar=_ejecutar_ok)
        self.assertTrue(resultado)
        self.assertTrue(seguir_soñando(resultado))


if __name__ == "__main__":
    unittest.main()
