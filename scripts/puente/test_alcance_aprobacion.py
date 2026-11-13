#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para alcance_aprobacion.py — sin red, registro de aprobaciones."""
import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))

import alcance_aprobacion as mod
from alcance_aprobacion import (
    aprobar,
    editar,
    rechazar,
    buscar_por_hash,
    existe_aprobado,
    _leer_registros,
    _guardar_registro,
    _invalidar_hash,
    _obtener_aprobado,
)


def test_constantes_definidas():
    """Constantes principales están definidas."""
    assert hasattr(mod, "aprobar")
    assert hasattr(mod, "editar")
    assert hasattr(mod, "rechazar")
    assert hasattr(mod, "buscar_por_hash")
    assert hasattr(mod, "existe_aprobado")


def test_aprobar_crea_aprobacion(tmp_path):
    """aprobar crea una aprobación con hash correcto."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        resultado = aprobar("texto de prueba", "destinatario test", "canal test", "quien", time.strftime("%Y-%m-%d %H:%M:%S"))
        assert resultado["hash"] == hashlib.sha256("texto de prueba".encode('utf-8')).hexdigest()
        assert resultado["texto"] == "texto de prueba"
        assert resultado["destinatario"] == "destinatario test"
        assert resultado["canal"] == "canal test"
        assert resultado["quien"] == "quien"
        assert resultado["cuando"] == time.strftime("%Y-%m-%d %H:%M:%S")
        assert resultado["estado"] == "aprobado"


def test_editar_invalida_aprobacion_anterior_y_crea_nueva(tmp_path):
    """editar invalida aprobación anterior y crea nueva."""
    import alcance_aprobacion as mod_internal

    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        # Crear aprobación inicial
        aprobacion1 = aprobar("texto original", "destinatario test", "canal test", "quien", "2024-01-01 12:00:00")
        hash_original = aprobacion1["hash"]

        # Editar (debería invalidar original y crear nueva)
        aprobacion2 = editar("nuevo texto", "destinatario test", "canal test", "quien", "2024-01-01 13:00:00")
        hash_nuevo = aprobacion2["hash"]

        # Verificar que original está invalidado
        assert existe_aprobado(hash_original) == False
        registros = mod_internal._leer_registros()
        assert len(registros) == 2
        assert registros[0]["estado"] == "invalido"
        assert registros[1]["estado"] == "aprobado"
        assert registros[1]["texto"] == "nuevo texto"


def test_rechazar_registra_rechazo(tmp_path):
    """rechazar registra un rechazo."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        resultado = rechazar("texto para rechazar", "destinatario test", "canal test", "quien", time.strftime("%Y-%m-%d %H:%M:%S"))
        assert resultado["hash"] == hashlib.sha256("texto para rechazar".encode('utf-8')).hexdigest()
        assert resultado["texto"] == "texto para rechazar"
        assert resultado["destinatario"] == "destinatario test"
        assert resultado["canal"] == "canal test"
        assert resultado["estado"] == "rechazado"


def test_buscar_por_hash_funciona(tmp_path):
    """buscar_por_hash encuentra registro correcto."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        aprobacion = aprobar("texto para buscar", "destinatario test", "canal test", "quien", "2024-01-01 12:00:00")
        hash_encontrado = aprobacion["hash"]
        encontrado = buscar_por_hash(hash_encontrado)
        assert encontrado is not None
        assert encontrado["hash"] == hash_encontrado


def test_existe_aprobado_valida_correctamente(tmp_path):
    """existe_aprobado verifica aprobación correctamente."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        aprobacion = aprobar("texto para verificar", "destinatario test", "canal test", "quien", "2024-01-01 12:00:00")
        hash_encontrado = aprobacion["hash"]
        assert existe_aprobado(hash_encontrado) == True

        rechazado = rechazar("otro texto", "destinatario test", "canal test", "quien", "2024-01-01 13:00:00")
        hash_rechazado = rechazado["hash"]
        assert existe_aprobado(hash_rechazado) == False


def test_texto_editado_no_hereda_aprobacion(tmp_path):
    """texto editado no hereda aprobación (prueba principal)."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        # Crear aprobación inicial
        aprobacion1 = aprobar("texto original", "destinatario test", "canal test", "quien", "2024-01-01 12:00:00")
        hash_original = aprobacion1["hash"]

        # Editar - la nueva aprobación NO debería heredar la anterior
        aprobacion2 = editar("nuevo texto", "destinatario test", "canal test", "quien", "2024-01-01 13:00:00")
        hash_nuevo = aprobacion2["hash"]

        # El hash nuevo debería estar aprobado (creó nuevo registro)
        assert existe_aprobado(hash_nuevo) == True

        # El hash antiguo debería estar invalidado
        assert existe_aprobado(hash_original) == False

        # Verificar estado del registro
        registros = _leer_registros()
        assert registros[0]["hash"] == hash_original
        assert registros[0]["estado"] == "invalido"
        assert registros[1]["hash"] == hash_nuevo
        assert registros[1]["estado"] == "aprobado"


def test_registros_se_guardan_en_disco(tmp_path):
    """registros se guardan en disco y se leen correctamente."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        # Escribir directamente
        ruta = Path(tmp_path / "aprobaciones.jsonl")
        ruta.parent.mkdir(parents=True, exist_ok=True)

        # Escribir algunos registros de prueba
        registro1 = {
            "hash": "abc123",
            "texto": "texto1",
            "destinatario": "dest1",
            "canal": "canal1",
            "quien": "q1",
            "cuando": "2024-01-01 12:00:00",
            "estado": "aprobado"
        }
        registro2 = {
            "hash": "def456",
            "texto": "texto2",
            "destinatario": "dest2",
            "canal": "canal2",
            "quien": "q2",
            "cuando": "2024-01-01 13:00:00",
            "estado": "rechazado"
        }

        with open(ruta, 'w', encoding='utf-8') as f:
            f.write(json.dumps(registro1, ensure_ascii=False) + '\n')
            f.write(json.dumps(registro2, ensure_ascii=False) + '\n')

        # Leer registros
        registros = _leer_registros()
        assert len(registros) == 2
        assert registros[0]["hash"] == "abc123"
        assert registros[1]["hash"] == "def456"
        assert registros[1]["estado"] == "rechazado"


def test_idempotencia_de_aprobar(tmp_path):
    """aprobar es idempotente (registra varias veces)."""
    with patch('alcance_aprobacion._ruta_registro', lambda: Path(tmp_path / "aprobaciones.jsonl")):
        # Primer registro
        aprobacion1 = aprobar("texto mismo", "destinatario test", "canal test", "quien", "2024-01-01 12:00:00")
        hash_texto = aprobacion1["hash"]

        # Segundo registro con mismo texto (será un nuevo hash, no se invalidará)
        aprobacion2 = aprobar("texto mismo", "destinatario test", "canal test", "quien2", "2024-01-01 13:00:00")
        hash_texto_nuevo = aprobacion2["hash"]

        # Deben ser diferentes hashes
        assert hash_texto != hash_texto_nuevo
        assert existe_aprobado(hash_texto) == True
        assert existe_aprobado(hash_texto_nuevo) == True


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])