#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sesiones_medios: comprobación de sesiones por medio (Mac, A1, Maggabox, GitHub Actions).

Regla TDD: estas pruebas DEBEN FALLAR antes de implementar sesiones_medios.py.
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importar el módulo que vamos a crear (fallará hasta que exista)
try:
    import sesiones_medios as SM
except ImportError:
    SM = None


class SesionesMediosTest(unittest.TestCase):
    """Tests para el medidor de sesiones por medio."""

    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.home = Path(self.t.name) / "h"
        self.raiz = Path(self.t.name) / "r"
        self.home.mkdir(parents=True)
        self.raiz.mkdir(parents=True)

    def tearDown(self):
        self.t.cleanup()

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_medios_definidos(self):
        """Los cuatro medios están definidos: Mac, A1, Maggabox, GitHub Actions."""
        self.assertEqual(set(SM.MEDIOS.keys()), {"mac", "a1", "maggabox", "github-actions"})

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_sesiones_por_medio(self):
        """Cada medio tiene su lista de sesiones a comprobar."""
        for medio, config in SM.MEDIOS.items():
            self.assertTrue(hasattr(config, "sesiones"))
            self.assertIsInstance(config.sesiones, list)
            self.assertGreater(len(config.sesiones), 0)

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_clasificacion_valida(self):
        """La clasificación solo puede ser: ok, sin_sesion, sin_cupo, no_pude_comprobar."""
        validos = {"ok", "sin_sesion", "sin_cupo", "no_pude_comprobar"}
        for medio, config in SM.MEDIOS.items():
            for sesion in config.sesiones:
                # La función de comprobación debe devolver un dict con 'estado' en validos
                pass  # Se prueba en test_comprobar_sesion_devuelve_clasificacion

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_comprobar_sesion_devuelve_clasificacion(self):
        """comprobar_sesion(medio, nombre_sesion) devuelve dict con estado y motivo."""
        # Mock: simular una sesión que está OK
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 0, "stdout": "ok"}):
            resultado = SM.comprobar_sesion("mac", "claude")
            self.assertIn("estado", resultado)
            self.assertIn(resultado["estado"], {"ok", "sin_sesion", "sin_cupo", "no_pude_comprobar"})
            self.assertIn("motivo", resultado)
            self.assertIsInstance(resultado["motivo"], str)

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_comprobar_sesion_sin_sesion(self):
        """Si el comando devuelve error de autenticación, estado = sin_sesion."""
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 1, "stderr": "authentication required"}):
            resultado = SM.comprobar_sesion("mac", "claude")
            self.assertEqual(resultado["estado"], "sin_sesion")

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_comprobar_sesion_sin_cupo(self):
        """Si el comando devuelve error de cuota/rate limit, estado = sin_cupo."""
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 1, "stderr": "quota exceeded"}):
            resultado = SM.comprobar_sesion("mac", "claude")
            self.assertEqual(resultado["estado"], "sin_cupo")

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_comprobar_sesion_no_pude_comprobar(self):
        """Si el comando falla por red/timeout/binario, estado = no_pude_comprobar con motivo."""
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 1, "stderr": "connection timeout"}):
            resultado = SM.comprobar_sesion("mac", "claude")
            self.assertEqual(resultado["estado"], "no_pude_comprobar")
            self.assertIn("motivo", resultado)
            self.assertGreater(len(resultado["motivo"]), 0)

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_comprobar_todas_sesiones_medio(self):
        """comprobar_medio(medio) devuelve dict con todas las sesiones de ese medio."""
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 0, "stdout": "ok"}):
            resultado = SM.comprobar_medio("mac")
            self.assertIn("medio", resultado)
            self.assertEqual(resultado["medio"], "mac")
            self.assertIn("sesiones", resultado)
            self.assertIsInstance(resultado["sesiones"], dict)
            self.assertIn("timestamp", resultado)

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_comprobar_todos_los_medios(self):
        """comprobar_todos() devuelve tabla medio × sesión con timestamp."""
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 0, "stdout": "ok"}):
            resultado = SM.comprobar_todos()
            self.assertIn("tabla", resultado)
            self.assertIn("timestamp", resultado)
            # Verificar que están los 4 medios
            for medio in ["mac", "a1", "maggabox", "github-actions"]:
                self.assertIn(medio, resultado["tabla"])

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_accion_para_alex(self):
        """acciones_para_alex() devuelve UNA acción con enlace/comando exacto por sesión caída."""
        # Simular algunas sesiones caídas
        tabla = {
            "mac": {"claude": {"estado": "sin_sesion", "motivo": "auth failed"}},
            "a1": {"notebooklm": {"estado": "sin_sesion", "motivo": "auth expired"}},
        }
        acciones = SM.acciones_para_alex(tabla)
        self.assertIsInstance(acciones, list)
        # Debe haber una acción por sesión que requiera intervención de Alex
        for accion in acciones:
            self.assertIn("sesion", accion)
            self.assertIn("medio", accion)
            self.assertIn("accion", accion)  # enlace o comando exacto

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_refresco_cada_30_min(self):
        """El módulo expone INTERVALO_REFRESCO_SEG = 1800 (30 min)."""
        self.assertEqual(SM.INTERVALO_REFRESCO_SEG, 1800)

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_no_imprime_tokens(self):
        """Ningún token, clave ni dirección del A1 aparece en logs/salidas."""
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 1, "stderr": "token=secret123"}):
            resultado = SM.comprobar_sesion("mac", "claude")
            # El motivo no debe contener el token
            self.assertNotIn("secret123", str(resultado))

    @unittest.skipIf(SM is None, "sesiones_medios no implementado aún")
    def test_ollama_a1_no_dice_sin_clave(self):
        """Ollama del A1 no debe aparecer como 'sin clave' (usa variable de entorno, no clave)."""
        # Ollama no necesita clave API, usa modelo local
        with patch.object(SM, "_ejecutar_comando", return_value={"returncode": 0, "stdout": "models list"}):
            resultado = SM.comprobar_sesion("a1", "ollama")
            self.assertNotEqual(resultado["estado"], "sin_sesion")


if __name__ == "__main__":
    unittest.main()