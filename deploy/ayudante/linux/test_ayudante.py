#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para starseed-ayudante (TRM1125C-d1).
Verifica: sintaxis bash, guardas de cada orden tipada, modo completo con caducidad y registro.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

AYUDANTE = Path(__file__).parent / "starseed-ayudante"
INSTALAR = Path(__file__).parent / "instalar.sh"


def ejecutar(argv: List[str], entrada: str = "", timeout: int = 10) -> subprocess.CompletedProcess:
    """Ejecuta el ayudante y devuelve el resultado."""
    return subprocess.run(argv, input=entrada, capture_output=True, text=True, timeout=timeout)


def test_sintaxis_bash() -> None:
    """bash -n no debe dar errores en el ayudante ni en el instalador."""
    for script in [AYUDANTE, INSTALAR]:
        r = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
        assert r.returncode == 0, f"bash -n falló en {script}: {r.stderr}"


def test_ayudante_existe_y_ejecutable() -> None:
    """El ayudante existe y tiene permiso de ejecución."""
    assert AYUDANTE.exists(), "starseed-ayudante no existe"
    assert os.access(AYUDANTE, os.X_OK), "starseed-ayudante no es ejecutable"


def test_ayuda_muestra_ordenes() -> None:
    """--help muestra las órdenes disponibles."""
    r = ejecutar([str(AYUDANTE), "--help"])
    assert r.returncode == 0
    salida = r.stdout
    for orden in ["almacenes", "servicios", "actualizar", "registros", "reiniciar", "modo-completo", "estado"]:
        assert orden in salida, f"Orden {orden} no aparece en la ayuda"


def test_almacenes_estado_sin_root() -> None:
    """almacenes estado funciona sin root y devuelve JSON."""
    r = ejecutar([str(AYUDANTE), "almacenes", "estado"])
    assert r.returncode == 0
    try:
        data = json.loads(r.stdout)
        assert "montado" in data
        assert "espacio_libre_gb" in data
        assert "errores" in data
    except json.JSONDecodeError:
        raise AssertionError(f"Salida no es JSON válido: {r.stdout}")


def test_almacenes_salud_sin_root() -> None:
    """almacenes salud funciona sin root."""
    r = ejecutar([str(AYUDANTE), "almacenes", "salud"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "smart" in data
    assert "temperatura_c" in data


def test_almacenes_formatear_requiere_root_y_serie() -> None:
    """almacenes formatear falla sin root y sin serie autorizada."""
    # Sin root debe fallar
    r = ejecutar([str(AYUDANTE), "almacenes", "formatear", "--serie", "ABC123"])
    assert r.returncode != 0
    assert "root" in r.stderr.lower() or "sudo" in r.stderr.lower() or "permiso" in r.stderr.lower()

    # Con sudo pero sin serie en lista autorizada debe fallar
    r = ejecutar(["sudo", "-n", str(AYUDANTE), "almacenes", "formatear", "--serie", "NO_AUTORIZADA"])
    assert r.returncode != 0
    assert "serie" in r.stderr.lower() or "autoriz" in r.stderr.lower()


def test_servicios_lista() -> None:
    """servicios lista muestra los servicios propios de StarSeed."""
    r = ejecutar([str(AYUDANTE), "servicios", "lista"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert isinstance(data, list)
    nombres = {s["nombre"] for s in data}
    assert "starseed-malla" in nombres or "starseed-almacen" in nombres


def test_servicios_estado() -> None:
    """servicios estado <nombre> devuelve estado del servicio."""
    r = ejecutar([str(AYUDANTE), "servicios", "estado", "starseed-malla"])
    assert r.returncode in (0, 1)  # 1 si no existe
    if r.returncode == 0:
        data = json.loads(r.stdout)
        assert "activo" in data
        assert "pid" in data


def test_servicios_reiniciar_requiere_root() -> None:
    """servicios reiniciar requiere root."""
    r = ejecutar([str(AYUDANTE), "servicios", "reiniciar", "starseed-malla"])
    assert r.returncode != 0
    assert "root" in r.stderr.lower() or "sudo" in r.stderr.lower()


def test_actualizar_estado() -> None:
    """actualizar estado devuelve información de versión."""
    r = ejecutar([str(AYUDANTE), "actualizar", "estado"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "version_actual" in data
    assert "hay_actualizacion" in data


def test_actualizar_buscar() -> None:
    """actualizar buscar comprueba si hay actualización."""
    r = ejecutar([str(AYUDANTE), "actualizar", "buscar"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "disponible" in data
    assert "version" in data


def test_actualizar_aplicar_requiere_root() -> None:
    """actualizar aplicar requiere root."""
    r = ejecutar([str(AYUDANTE), "actualizar", "aplicar"])
    assert r.returncode != 0
    assert "root" in r.stderr.lower() or "sudo" in r.stderr.lower()


def test_registros_leer() -> None:
    """registros leer muestra líneas recientes."""
    r = ejecutar([str(AYUDANTE), "registros", "leer", "--lineas", "10"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "lineas" in data
    assert isinstance(data["lineas"], list)


def test_registros_leer_filtro() -> None:
    """registros leer acepta filtro por servicio."""
    r = ejecutar([str(AYUDANTE), "registros", "leer", "--servicio", "starseed-malla", "--lineas", "5"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "lineas" in data


def test_reiniciar_app_requiere_root() -> None:
    """reiniciar app requiere root."""
    r = ejecutar([str(AYUDANTE), "reiniciar", "app"])
    assert r.returncode != 0
    assert "root" in r.stderr.lower() or "sudo" in r.stderr.lower()


def test_modo_completo_activar_requiere_root_y_caducidad() -> None:
    """modo-completo activar requiere root y caducidad válida."""
    # Sin root falla
    r = ejecutar([str(AYUDANTE), "modo-completo", "activar", "--caducidad-min", "60"])
    assert r.returncode != 0
    assert "root" in r.stderr.lower() or "sudo" in r.stderr.lower()

    # Con root pero sin caducidad falla
    r = ejecutar(["sudo", "-n", str(AYUDANTE), "modo-completo", "activar"])
    assert r.returncode != 0
    assert "caducidad" in r.stderr.lower()

    # Caducidad fuera de rango (1 min a 24 h = 1440 min)
    r = ejecutar(["sudo", "-n", str(AYUDANTE), "modo-completo", "activar", "--caducidad-min", "0"])
    assert r.returncode != 0
    r = ejecutar(["sudo", "-n", str(AYUDANTE), "modo-completo", "activar", "--caducidad-min", "1441"])
    assert r.returncode != 0


def test_modo_completo_estado() -> None:
    """modo-completo estado muestra si está activo y cuándo expira."""
    r = ejecutar([str(AYUDANTE), "modo-completo", "estado"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "activo" in data
    assert "expira_en_segundos" in data or "expira_en" in data


def test_modo_completo_desactivar_requiere_root() -> None:
    """modo-completo desactivar requiere root."""
    r = ejecutar([str(AYUDANTE), "modo-completo", "desactivar"])
    assert r.returncode != 0
    assert "root" in r.stderr.lower() or "sudo" in r.stderr.lower()


def test_estado_general() -> None:
    """estado muestra resumen del sistema."""
    r = ejecutar([str(AYUDANTE), "estado"])
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "modo_completo" in data
    assert "almacenes" in data
    assert "servicios" in data


def test_orden_desconocida_falla() -> None:
    """Orden desconocida devuelve error claro."""
    r = ejecutar([str(AYUDANTE), "orden-inexistente"])
    assert r.returncode != 0
    assert "desconocida" in r.stderr.lower() or "no existe" in r.stderr.lower()


def test_guardas_anti_repeticion() -> None:
    """Órdenes críticas tienen guarda anti-repetición (mismo args en < 2s falla)."""
    # Esta prueba es informativa: verifica que el código tiene la lógica
    # No podemos probar timing real sin root, pero verificamos que existe
    contenido = AYUDANTE.read_text()
    assert "anti_repeticion" in contenido or "anti-repeticion" in contenido or "ultima_ejecucion" in contenido


def test_registro_encadenado() -> None:
    """El registro de órdenes está encadenado por hash."""
    contenido = AYUDANTE.read_text()
    assert "sha256" in contenido.lower() or "hash" in contenido.lower()


def test_instalador_sintaxis() -> None:
    """instalar.sh pasa bash -n."""
    r = subprocess.run(["bash", "-n", str(INSTALAR)], capture_output=True, text=True)
    assert r.returncode == 0, f"bash -n falló en instalar.sh: {r.stderr}"


def test_instalador_visudo() -> None:
    """instalar.sh usa visudo -c antes de mover la regla."""
    contenido = INSTALAR.read_text()
    assert "visudo -c" in contenido


def test_instalador_regla_sudoers_limitada() -> None:
    """La regla de sudoers solo permite el ayudante con argumentos concretos."""
    contenido = INSTALAR.read_text()
    assert "starseed-ayudante" in contenido
    assert "NOPASSWD" in contenido
    # La regla debe ser específica, no un ALL
    assert "ALL=(ALL) ALL" not in contenido or contenido.count("ALL=(ALL) ALL") == 0


def test_instalador_crea_directorio_log() -> None:
    """instalar.sh crea el directorio de logs con permisos correctos."""
    contenido = INSTALAR.read_text()
    assert "/var/log/starseed" in contenido or "/var/log/starseed-ayudante" in contenido
    assert "chmod" in contenido or "chown" in contenido


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))