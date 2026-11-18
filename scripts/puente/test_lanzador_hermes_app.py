#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas unitarias para lanzador_hermes_app.py.

Prueba las funciones puras: lectura del comando del plist, generación de Info.plist,
generación del .swift y decisión del nuevo ProgramArguments.
"""

import os
import plistlib
import tempfile
import unittest
from pathlib import Path

import lanzador_hermes_app as L


class TestLeerComandoPlist(unittest.TestCase):
    """Pruebas para extraer el comando del plist actual de Hermes."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _escribir_plist(self, args):
        ruta = os.path.join(self.tmp.name, "ai.hermes.gateway.plist")
        plist = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": args,
            "RunAtLoad": True,
            "KeepAlive": True,
        }
        with open(ruta, "wb") as f:
            plistlib.dump(plist, f)
        return ruta

    def test_extraer_comando_despues_de_exec(self):
        """El plist usa osascript con -e 'exec <comando>'."""
        args = [
            "/usr/bin/osascript",
            "-e",
            'tell application "Terminal" to do script "exec /opt/homebrew/bin/hermes gateway run --replace"',
        ]
        ruta = self._escribir_plist(args)
        comando = L.extraer_comando_del_plist(ruta)
        self.assertEqual(comando, ["/opt/homebrew/bin/hermes", "gateway", "run", "--replace"])

    def test_extraer_comando_con_ruta_compleja(self):
        """El comando puede tener argumentos con espacios y comillas."""
        args = [
            "/usr/bin/osascript",
            "-e",
            'exec "/Users/alex/.local/bin/hermes" gateway run --replace --config "/Users/alex/.hermes/config.toml"',
        ]
        ruta = self._escribir_plist(args)
        comando = L.extraer_comando_del_plist(ruta)
        self.assertEqual(
            comando,
            [
                "/Users/alex/.local/bin/hermes",
                "gateway",
                "run",
                "--replace",
                "--config",
                "/Users/alex/.hermes/config.toml",
            ],
        )

    def test_sin_exec_lanza_error(self):
        """Si no hay 'exec ' en el argumento de osascript, lanza ValueError."""
        args = ["/usr/bin/osascript", "-e", 'display dialog "hola"']
        ruta = self._escribir_plist(args)
        with self.assertRaises(ValueError):
            L.extraer_comando_del_plist(ruta)

    def test_programarguments_no_lista_lanza_error(self):
        """Si ProgramArguments no es lista, lanza ValueError."""
        ruta = os.path.join(self.tmp.name, "ai.hermes.gateway.plist")
        with open(ruta, "wb") as f:
            plistlib.dump({"Label": "ai.hermes.gateway", "ProgramArguments": "no-lista"}, f)
        with self.assertRaises(ValueError):
            L.extraer_comando_del_plist(ruta)


class TestGenerarInfoPlist(unittest.TestCase):
    """Pruebas para la generación del Info.plist de la app."""

    def test_info_plist_tiene_campos_requeridos(self):
        info = L.generar_info_plist()
        self.assertEqual(info["CFBundleIdentifier"], "org.starseed.hermes-lanzador")
        self.assertEqual(info["CFBundleName"], "StarSeed Hermes")
        self.assertEqual(info["CFBundleDisplayName"], "StarSeed Hermes")
        self.assertTrue(info["LSUIElement"])
        self.assertEqual(info["CFBundleExecutable"], "starseed-hermes")
        self.assertEqual(info["CFBundlePackageType"], "APPL")
        self.assertEqual(info["CFBundleVersion"], "1.0.0")
        self.assertEqual(info["CFBundleShortVersionString"], "1.0.0")

    def test_info_plist_tiene_claves_minimas(self):
        """Claves mínimas para que macOS la trate como app de fondo sin dock."""
        info = L.generar_info_plist()
        claves_esperadas = {
            "CFBundleIdentifier",
            "CFBundleName",
            "CFBundleDisplayName",
            "CFBundleExecutable",
            "CFBundlePackageType",
            "CFBundleVersion",
            "CFBundleShortVersionString",
            "LSUIElement",
            "NSHighResolutionCapable",
        }
        self.assertTrue(claves_esperadas.issubset(info.keys()))


class TestGenerarSwift(unittest.TestCase):
    """Pruebas para la generación del código Swift ejecutable."""

    def test_swift_ejecuta_execv_con_comando(self):
        comando = ["/opt/homebrew/bin/hermes", "gateway", "run", "--replace"]
        swift = L.generar_swift(comando)
        # Debe contener la llamada a execv con los argumentos correctos
        self.assertIn('execv("/opt/homebrew/bin/hermes"', swift)
        self.assertIn('"gateway"', swift)
        self.assertIn('"run"', swift)
        self.assertIn('"--replace"', swift)
        # Debe terminar con _exit(1) si execv falla
        self.assertIn("_exit(1)", swift)
        # Debe importar Foundation y Darwin
        self.assertIn("import Foundation", swift)
        self.assertIn("import Darwin", swift)

    def test_swift_con_ruta_con_espacios(self):
        comando = ["/Users/alex/My Apps/hermes", "gateway", "run"]
        swift = L.generar_swift(comando)
        self.assertIn('execv("/Users/alex/My Apps/hermes"', swift)
        self.assertIn('"gateway"', swift)
        self.assertIn('"run"', swift)

    def test_swift_array_terminado_en_null(self):
        """El array de argumentos para execv debe terminar en nil/NULL."""
        comando = ["/bin/echo", "hola"]
        swift = L.generar_swift(comando)
        # En Swift, el array para execv debe terminar con nil
        self.assertIn("nil", swift)


class TestNuevoProgramArguments(unittest.TestCase):
    """Pruebas para decidir el nuevo ProgramArguments del servicio."""

    def test_nuevo_programarguments_usa_ruta_app(self):
        ruta_app = "/Users/alex/Applications/StarSeed Hermes.app"
        args = L.nuevo_programarguments(ruta_app)
        esperado = [
            f"{ruta_app}/Contents/MacOS/starseed-hermes"
        ]
        self.assertEqual(args, esperado)

    def test_nuevo_programarguments_sin_espacios_extra(self):
        ruta_app = "/Applications/StarSeed Hermes.app"
        args = L.nuevo_programarguments(ruta_app)
        self.assertEqual(len(args), 1)
        self.assertFalse(any(" " in a for a in args if a != args[0]))


class TestRutasApp(unittest.TestCase):
    """Pruebas para las rutas de la app."""

    def test_ruta_app_por_defecto(self):
        ruta = L.ruta_app_por_defecto()
        self.assertEqual(ruta, os.path.expanduser("~/Applications/StarSeed Hermes.app"))

    def test_ruta_ejecutable_dentro_de_app(self):
        ruta_app = "/Users/alex/Applications/StarSeed Hermes.app"
        ejecutable = L.ruta_ejecutable(ruta_app)
        self.assertEqual(ejecutable, f"{ruta_app}/Contents/MacOS/starseed-hermes")

    def test_ruta_info_plist_dentro_de_app(self):
        ruta_app = "/Users/alex/Applications/StarSeed Hermes.app"
        info_plist = L.ruta_info_plist(ruta_app)
        self.assertEqual(info_plist, f"{ruta_app}/Contents/Info.plist")


class TestPlistEjemplo(unittest.TestCase):
    """Prueba con un plist de ejemplo realista."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_plist_completo_extrae_comando_correcto(self):
        """Plist realista como el que existe en la Mac."""
        args = [
            "/usr/bin/osascript",
            "-e",
            'tell application "System Events" to keystroke "h" using {command down, shift down}',
            "-e",
            'exec "/opt/homebrew/bin/hermes" gateway run --replace',
        ]
        ruta = os.path.join(self.tmp.name, "ai.hermes.gateway.plist")
        with open(ruta, "wb") as f:
            plistlib.dump({"Label": "ai.hermes.gateway", "ProgramArguments": args}, f)

        comando = L.extraer_comando_del_plist(ruta)
        self.assertEqual(
            comando,
            ["/opt/homebrew/bin/hermes", "gateway", "run", "--replace"],
        )


if __name__ == "__main__":
    unittest.main()