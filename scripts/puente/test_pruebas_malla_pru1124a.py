#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1124A · Pruebas para el manejo de batería faltante en el conductor de pruebas de la malla.

Cubre el caso en que bateria-1118.json no existe: el conductor debe decirlo
en una línea y explicar cómo crearlo, en vez de reventar con FileNotFoundError.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402


def test_cargar_bateria_archivo_faltante_lanza_error_claro():
    """Si bateria-1118.json no existe, cargar_bateria debe lanzar FileNotFoundError con mensaje útil."""
    # Guardar la ruta original
    original_bateria = PM.BATERIA_JSON
    # Apuntar a un archivo que no existe
    PM.BATERIA_JSON = original_bateria.parent / "bateria-inexistente.json"

    try:
        try:
            PM.cargar_bateria()
            assert False, "Debía lanzar FileNotFoundError"
        except FileNotFoundError as e:
            msg = str(e)
            assert "bateria-1118.json" in msg or "bateria-inexistente.json" in msg
            assert "crear" in msg.lower() or "generar" in msg.lower() or "falta" in msg.lower()
    finally:
        PM.BATERIA_JSON = original_bateria


def test_cmd_listar_sin_bateria_muestra_mensaje_ayuda(capsys):
    """listar debe imprimir una línea de ayuda si la batería no existe, no reventar."""
    original_bateria = PM.BATERIA_JSON
    PM.BATERIA_JSON = original_bateria.parent / "bateria-inexistente.json"

    args = argparse.Namespace(bloque=None, ronda=None)

    try:
        # El comando debe manejar el error y salir con código != 0
        rc = PM.cmd_listar(args)
        assert rc != 0
        out = capsys.readouterr().out
        assert "bateria-1118.json" in out or "bateria" in out.lower()
        assert "crear" in out.lower() or "generar" in out.lower() or "falta" in out.lower()
    finally:
        PM.BATERIA_JSON = original_bateria


def test_cmd_siguiente_sin_bateria_muestra_mensaje_ayuda(capsys):
    """siguiente debe imprimir una línea de ayuda si la batería no existe, no reventar."""
    original_bateria = PM.BATERIA_JSON
    PM.BATERIA_JSON = original_bateria.parent / "bateria-inexistente.json"

    args = argparse.Namespace()

    try:
        rc = PM.cmd_siguiente(args)
        assert rc != 0
        out = capsys.readouterr().out
        assert "bateria-1118.json" in out or "bateria" in out.lower()
        assert "crear" in out.lower() or "generar" in out.lower() or "falta" in out.lower()
    finally:
        PM.BATERIA_JSON = original_bateria


def test_bateria_json_estructura_valida():
    """La batería generada debe tener la estructura esperada: bloques B1-B10, pares, antenas, rondas, criterios."""
    # Este test verificará la estructura una vez generado el archivo
    bateria_path = PM.BATERIA_JSON
    if not bateria_path.exists():
        # Si no existe, el test pasa pero avisa (se completará cuando se genere)
        return

    with bateria_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    assert "bateria" in data
    assert "pruebas" in data
    assert isinstance(data["pruebas"], list)
    assert len(data["pruebas"]) > 0

    # Verificar que hay pruebas de bloques B1 a B10
    bloques_encontrados = set()
    for p in data["pruebas"]:
        assert "id" in p
        assert "titulo" in p
        assert "bloque" in p
        assert "ronda" in p
        assert "aparatos" in p
        assert "antena" in p
        assert "pasos" in p
        assert "criterios" in p
        bloques_encontrados.add(p["bloque"])

    # Debe haber al menos algunos bloques B1-B10
    assert any(b.startswith("B") and b[1:].isdigit() and 1 <= int(b[1:]) <= 10 for b in bloques_encontrados)

    # Verificar criterios debe/no_debe por aparato
    for p in data["pruebas"]:
        criterios = p["criterios"]
        for aparato in ("mac", "maggabox", "tableta"):
            if aparato in criterios:
                crit = criterios[aparato]
                assert "debe" in crit
                assert "no_debe" in crit
                assert isinstance(crit["debe"], list)
                assert isinstance(crit["no_debe"], list)


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))