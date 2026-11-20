#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para lanzador_hermes_app.py - funciones puras sin efectos de sistema."""
import plistlib
import tempfile
import os
import sys
from pathlib import Path

# Importar las funciones puras del módulo principal
sys.path.insert(0, str(Path(__file__).parent))
from lanzador_hermes_app import (
    extraer_comando_desde_plist,
    generar_info_plist,
    generar_swift_ejecutable,
    decidir_nuevos_program_arguments,
    RUTA_APP,
    IDENTIFICADOR_BUNDLE,
    NOMBRE_BUNDLE,
)


class TestExtraerComandoDesdePlist:
    """Pruebas para extraer_comando_desde_plist."""

    def test_plist_con_osascript_y_exec(self):
        """Debe extraer el comando tras 'exec ' en el argumento de osascript."""
        plist_data = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": [
                "/usr/bin/osascript",
                "-e",
                'exec /home/starseed/.hermes/bin/hermes gateway run --replace',
            ],
        }
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".plist", delete=False) as f:
            plistlib.dump(plist_data, f)
            ruta = f.name
        try:
            cmd = extraer_comando_desde_plist(ruta)
            assert cmd == ["/home/starseed/.hermes/bin/hermes", "gateway", "run", "--replace"]
        finally:
            os.unlink(ruta)

    def test_plist_jxa_con_redirecciones(self):
        """Debe extraer el comando real cuando osascript usa JXA $.system("exec ... >> ... 2>> ...")."""
        plist_data = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": [
                "/usr/bin/osascript",
                "-l",
                "JavaScript",
                "-e",
                'ObjC.import("stdlib"); const status=$.system("exec /Users/alex/.hermes/bin/hermes gateway run --external-supervisor >> /Users/alex/.hermes/logs/gateway.log 2>> /Users/alex/.hermes/logs/gateway.error.log"); $.exit(0);',
            ],
        }
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".plist", delete=False) as f:
            plistlib.dump(plist_data, f)
            ruta = f.name
        try:
            cmd = extraer_comando_desde_plist(ruta)
            assert cmd == ["/Users/alex/.hermes/bin/hermes", "gateway", "run", "--external-supervisor"]
        finally:
            os.unlink(ruta)

    def test_plist_con_osascript_y_exec_con_comillas(self):
        """Debe manejar comillas en el comando."""
        plist_data = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": [
                "/usr/bin/osascript",
                "-e",
                'exec "/home/starseed/.hermes/bin/hermes" gateway run --replace',
            ],
        }
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".plist", delete=False) as f:
            plistlib.dump(plist_data, f)
            ruta = f.name
        try:
            cmd = extraer_comando_desde_plist(ruta)
            assert cmd == ["/home/starseed/.hermes/bin/hermes", "gateway", "run", "--replace"]
        finally:
            os.unlink(ruta)

    def test_plist_jxa_con_redirecciones(self):
        """Debe extraer el comando real cuando osascript usa JXA $.system("exec ... >> ... 2>> ...")."""
        plist_data = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": [
                "/usr/bin/osascript",
                "-l",
                "JavaScript",
                "-e",
                'ObjC.import("stdlib"); const status=$.system("exec /Users/alex/.hermes/bin/hermes gateway run --external-supervisor >> /Users/alex/.hermes/logs/gateway.log 2>> /Users/alex/.hermes/logs/gateway.error.log"); $.exit(0);',
            ],
        }
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".plist", delete=False) as f:
            plistlib.dump(plist_data, f)
            ruta = f.name
        try:
            cmd = extraer_comando_desde_plist(ruta)
            assert cmd == ["/Users/alex/.hermes/bin/hermes", "gateway", "run", "--external-supervisor"]
        finally:
            os.unlink(ruta)

    def test_plist_sin_osascript_lanza_error(self):
        """Debe lanzar ValueError si no usa osascript."""
        plist_data = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": ["/opt/homebrew/bin/python3", "script.py"],
        }
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".plist", delete=False) as f:
            plistlib.dump(plist_data, f)
            ruta = f.name
        try:
            try:
                extraer_comando_desde_plist(ruta)
                assert False, "Debería haber lanzado ValueError"
            except ValueError as e:
                assert "osascript" in str(e).lower()
        finally:
            os.unlink(ruta)

    def test_plist_sin_exec_lanza_error(self):
        """Debe lanzar ValueError si no hay 'exec ' en el argumento."""
        plist_data = {
            "Label": "ai.hermes.gateway",
            "ProgramArguments": ["/usr/bin/osascript", "-e", 'tell app "Terminal" to do script "hermes"'],
        }
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".plist", delete=False) as f:
            plistlib.dump(plist_data, f)
            ruta = f.name
        try:
            try:
                extraer_comando_desde_plist(ruta)
                assert False, "Debería haber lanzado ValueError"
            except ValueError as e:
                assert "exec" in str(e).lower()
        finally:
            os.unlink(ruta)


class TestGenerarInfoPlist:
    """Pruebas para generar_info_plist."""

    def test_genera_info_plist_correcto(self):
        """Debe generar un Info.plist con los campos requeridos."""
        info = generar_info_plist()
        assert info["CFBundleIdentifier"] == IDENTIFICADOR_BUNDLE
        assert info["CFBundleName"] == NOMBRE_BUNDLE
        assert info["LSUIElement"] is True
        assert info["CFBundleExecutable"] == "starseed-hermes"
        assert info["CFBundlePackageType"] == "APPL"
        assert "CFBundleVersion" in info
        assert "CFBundleShortVersionString" in info


class TestGenerarSwiftEjecutable:
    """Pruebas para generar_swift_ejecutable."""

    def test_genera_codigo_swift_valido(self):
        """Debe generar código Swift que hace execv del comando dado."""
        comando = ["/home/starseed/.hermes/bin/hermes", "gateway", "run", "--replace"]
        swift_code = generar_swift_ejecutable(comando)

        # Verificar estructura básica
        assert "import Foundation" in swift_code
        assert "func main()" in swift_code or "@main" in swift_code
        assert "execv" in swift_code
        assert "/home/starseed/.hermes/bin/hermes" in swift_code
        assert "gateway" in swift_code
        assert "run" in swift_code
        assert "--replace" in swift_code

    def test_genera_swift_con_argumentos_varios(self):
        """Debe manejar comandos con múltiples argumentos."""
        comando = ["/ruta/ejecutable", "arg1", "arg2", "arg3"]
        swift_code = generar_swift_ejecutable(comando)
        assert "/ruta/ejecutable" in swift_code
        assert "arg1" in swift_code
        assert "arg2" in swift_code
        assert "arg3" in swift_code


class TestDecidirNuevosProgramArguments:
    """Pruebas para decidir_nuevos_program_arguments."""

    def test_devuelve_ruta_ejecutable_app(self):
        """Debe devolver la ruta al ejecutable dentro del bundle."""
        nuevos = decidir_nuevos_program_arguments()
        assert len(nuevos) == 1
        assert nuevos[0] == str(RUTA_APP / "Contents" / "MacOS" / "starseed-hermes")


if __name__ == "__main__":
    import unittest

    unittest.main(verbosity=2)