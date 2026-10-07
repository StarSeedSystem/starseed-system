#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas unitarias para medidor_claude_terminal.py (MC1007A · 2026-10-06).

Pruebas sin red ni procesos reales (mock de subprocess.run).
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import medidor_claude_terminal as MT


def test_leer_exito_con_suscripcion():
    """lee() con salida exitosa y suscripción."""
    ahora = datetime(2026, 10, 6, 18, 5)
    texto_salida = (
        "You are currently using your subscription to power your Claude Code usage\n"
        "\n"
        "Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)\n"
        "Current week (all models): 41% used · resets Oct 10 at 4am (America/Mexico_City)\n"
        "Current week (Fable): 0% used · resets Oct 10 at 4am (America/Mexico_City)\n"
        "\n"
        "What's contributing to your limits usage?\n"
        "..."
    )
    ejecuciones = []

    def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
        ejecuciones.append(orden)
        class Proc:
            stdout = texto_salida
            returncode = 0
        return Proc()

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
    assert medidor["id"] == "claude"
    assert medidor["proveedor"] == "anthropic"
    assert medidor["nombre"] == "Claude · plan"
    assert medidor["tipo"] == "plan"
    assert medidor["plan"] == "suscripción"
    assert medidor["ok"] is True
    assert medidor["error"] is None
    assert medidor["leido"] == "2026-10-06T18:05:00"
    assert medidor["enlace"] == "https://claude.ai/settings/usage"


def test_leer_sin_suscripcion():
    """lee() con salida sin 'using your subscription'."""
    ahora = datetime(2026, 10, 6, 18, 5)
    texto_salida = (
        "No subscription active\n"
        "\n"
        "Current session: 5% used · resets Oct 6 at 18:10 (UTC)\n"
    )
    ejecuciones = []

    def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
        ejecuciones.append(orden)
        class Proc:
            stdout = texto_salida
            returncode = 0
        return Proc()

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
    assert medidor["ok"] is False
    assert medidor["error"] == "claude no está usando la suscripción"


def test_leer_sin_datos():
    """lee() con salida vacía."""
    ahora = datetime(2026, 10, 6, 18, 5)
    ejecuciones = []

    def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
        ejecuciones.append(orden)
        class Proc:
            stdout = ""
            returncode = 0
        return Proc()

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
    assert medidor["ok"] is False
    assert medidor["error"] == "sin datos de uso"


def test_leer_error_cli():
    """lee() con código de retorno no cero."""
    ahora = datetime(2026, 10, 6, 18, 5)
    ejecuciones = []

    def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
        ejecuciones.append(orden)
        class Proc:
            stdout = "Error: not found\n"
            returncode = 1
        return Proc()

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
    assert medidor["ok"] is False
    assert "falló con código 1" in medidor["error"]
    assert medidor["obsoleto"] is False


def test_leer_timeout():
    """lee() con TimeoutExpired."""
    ahora = datetime(2026, 10, 6, 18, 5)
    def ejecutar_mock_timeout(orden, *, stdin, capture_output, text, timeout, cwd, env):
        import subprocess
        raise subprocess.TimeoutExpired(orden, timeout)

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock_timeout, entorno={})
    assert medidor["ok"] is False
    assert medidor["error"] == "tiempo de espera agotado (60 s)"
    assert medidor["obsoleto"] is True


def test_leer_binario_no_encontrado():
    """lee() con FileNotFoundError."""
    ahora = datetime(2026, 10, 6, 18, 5)
    def ejecutar_mock_file_not_found(orden, *, stdin, capture_output, text, timeout, cwd, env):
        raise FileNotFoundError("el binario 'claude' no se encuentra")

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock_file_not_found, entorno={})
    assert medidor["ok"] is False
    assert medidor["error"] == "el binario 'claude' no se encuentra"
    assert medidor["obsoleto"] is True


def test_leer_ahora_param():
    """lee() usa el 'ahora' pasado."""
    ahora = datetime(2026, 12, 30, 10, 30)
    ejecuciones = []

    def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
        ejecuciones.append(orden)
        class Proc:
            stdout = "using your subscription\n"
            returncode = 0
        return Proc()

    medidor = MT.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
    assert medidor["leido"] == "2026-12-30T10:30:00"


def test_guardar():
    """guardar() escribe archivo JSON con permisos 0600."""
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / "test.json"
        dato = {"id": "claude", "prueba": True}
        MT.guardar(dato, str(ruta))

        assert ruta.exists()
        contenido = json.loads(ruta.read_text(encoding="utf-8"))
        assert contenido["id"] == "claude"
        assert ruta.stat().st_mode & 0o777 == 0o600


def test_leer_archivo_existente():
    """leer_archivo() carga archivo JSON existente."""
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / "test.json"
        ruta.write_text('{"id": "claude", "dato": "valor"}', encoding="utf-8")

        resultado = MT.leer_archivo(str(ruta))
        assert resultado["id"] == "claude"
        assert resultado["dato"] == "valor"


def test_leer_archivo_no_existente():
    """leer_archivo() devuelve dict vacío si archivo no existe."""
    ruta = Path("/no/existe/archivo.json")
    resultado = MT.leer_archivo(str(ruta))
    assert resultado == {}


def test_interpretar():
    """interpretar() procesa la salida y devuelve un medidor."""
    ahora = datetime(2026, 10, 6, 18, 5)
    texto = (
        "You are currently using your subscription to power your Claude Code usage\n"
        "Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)\n"
        "Current week (all models): 41% used · resets Oct 10 at 4am (America/Mexico_City)\n"
        "Current week (Fable): 0% used · resets Oct 10 at 4am (America/Mexico_City)\n"
    )
    medidor = MT.interpretar(texto, ahora)
    assert medidor["id"] == "claude"
    assert medidor["proveedor"] == "anthropic"
    assert medidor["plan"] == "suscripción"
    assert medidor["ok"] is True
    assert medidor["enlace"] == "https://claude.ai/settings/usage"


def test_interpretar_sin_suscripcion():
    """interpretar() para salida sin suscripción."""
    ahora = datetime(2026, 10, 6, 18, 5)
    texto = (
        "No subscription active\n"
        "Current session: 5% used · resets Oct 6 at 18:10 (UTC)\n"
    )
    medidor = MT.interpretar(texto, ahora)
    assert medidor["plan"] is None
    assert medidor["ok"] is True


def test_interpretar_vacio():
    """interpretar() para texto vacío."""
    ahora = datetime(2026, 10, 6, 18, 5)
    medidor = MT.interpretar("", ahora)
    assert medidor["plan"] is None
    assert medidor["ok"] is True


def test_main_leer():
    """main() con 'leer' ejecuta leer() e imprime JSON."""
    with mock.patch.object(MT, "leer") as mock_leer:
        mock_leer.return_value = {"id": "claude", "prueba": True}
        from io import StringIO
        sys.stdout = StringIO()
        sys.argv = ["medidor_claude_terminal.py", "leer"]
        result = MT.main(sys.argv[1:])
        output = sys.stdout.getvalue().strip()
        sys.stdout = sys.__stdout__

        assert result == 0
        parsed = json.loads(output)
        assert parsed["id"] == "claude"
        assert parsed["prueba"] is True


if __name__ == "__main__":
    print("Ejecutando pruebas para medidor_claude_terminal.py...")

    test_leer_exito_con_suscripcion()
    print("✓ test_leer_exito_con_suscripcion")

    test_leer_sin_suscripcion()
    print("✓ test_leer_sin_suscripcion")

    test_leer_sin_datos()
    print("✓ test_leer_sin_datos")

    test_leer_error_cli()
    print("✓ test_leer_error_cli")

    test_leer_timeout()
    print("✓ test_leer_timeout")

    test_leer_binario_no_encontrado()
    print("✓ test_leer_binario_no_encontrado")

    test_leer_ahora_param()
    print("✓ test_leer_ahora_param")

    test_guardar()
    print("✓ test_guardar")

    test_leer_archivo_existente()
    print("✓ test_leer_archivo_existente")

    test_leer_archivo_no_existente()
    print("✓ test_leer_archivo_no_existente")

    test_interpretar()
    print("✓ test_interpretar")

    test_interpretar_sin_suscripcion()
    print("✓ test_interpretar_sin_suscripcion")

    test_interpretar_vacio()
    print("✓ test_interpretar_vacio")

    test_main_leer()
    print("✓ test_main_leer")

    print("\n✓ Todas las pruebas pasaron!")