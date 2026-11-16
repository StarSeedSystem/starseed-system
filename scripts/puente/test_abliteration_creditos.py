#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas unitarias del módulo abliteration_creditos (MOD1116).
Sin red, sin disco, sin reloj propio: todo inyectado.
"""

from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from abliteration_creditos import (
    saldo_usd,
    registrar,
    gasto_del_dia,
    permitido,
)
from datetime import datetime, timedelta


def saldo_normal():
    """saldo_usd con datos normales."""
    resp = {"data": {"total_credits": 100.0, "total_usage": 42.5}}
    assert saldo_usd(resp) == 57.5


def saldo_campos_faltantes():
    """saldo_usd cuando faltan campos."""
    assert saldo_usd({"otro": 1}) is None
    assert saldo_usd({"data": {"total_credits": 100}}) is None
    assert saldo_usd({"data": {"total_usage": 10}}) is None
    assert saldo_usd({}) is None


def saldo_negativo():
    """saldo_usd devuelve None si el saldo sería negativo."""
    resp = {"data": {"total_credits": 10.0, "total_usage": 20.0}}
    assert saldo_usd(resp) is None


def registrar_cambio_dia():
    """registrar cambia saldo_inicio_dia al cambiar de día."""
    estado = {
        "dia": "2026-11-15",
        "saldo_inicio_dia": 100.0,
        "saldo_ultimo": 80.0,
        "leido": "2026-11-15T12:00:00Z",
    }
    ahora = "2026-11-16T08:00:00Z"
    nuevo = registrar(estado, 70.0, ahora)
    assert nuevo["dia"] == "2026-11-16"
    assert nuevo["saldo_inicio_dia"] == 80.0  # último saldo conocido
    assert nuevo["saldo_ultimo"] == 70.0
    assert nuevo["leido"] == ahora


def registrar_mismo_dia():
    """registrar actualiza saldo_ultimo en el mismo día."""
    estado = {
        "dia": "2026-11-16",
        "saldo_inicio_dia": 100.0,
        "saldo_ultimo": 80.0,
        "leido": "2026-11-16T12:00:00Z",
    }
    ahora = "2026-11-16T14:00:00Z"
    nuevo = registrar(estado, 75.0, ahora)
    assert nuevo["dia"] == "2026-11-16"
    assert nuevo["saldo_inicio_dia"] == 100.0
    assert nuevo["saldo_ultimo"] == 75.0
    assert nuevo["leido"] == ahora


def gasto_sin_lectura():
    """gasto_del_dia devuelve 0 si no hay datos."""
    assert gasto_del_dia({}) == 0.0
    assert gasto_del_dia({"saldo_ultimo": 50.0}) == 0.0
    assert gasto_del_dia({"saldo_inicio_dia": 100.0}) == 0.0


def gasto_normal():
    """gasto_del_dia con datos normales."""
    estado = {"saldo_inicio_dia": 100.0, "saldo_ultimo": 70.0}
    assert gasto_del_dia(estado) == 30.0


def gasto_saldo_mayor():
    """gasto_del_dia nunca negativo aunque saldo_ultimo > saldo_inicio."""
    estado = {"saldo_inicio_dia": 50.0, "saldo_ultimo": 80.0}
    assert gasto_del_dia(estado) == 0.0


def permitido_sin_lectura():
    """permitido devuelve (False, 'sin lectura') sin fecha."""
    estado = {}
    ahora = "2026-11-16T12:00:00Z"
    resultado, motivo = permitido(estado, ahora, 50.0)
    assert resultado is False
    assert motivo == "sin lectura"


def permitido_lectura_vieja():
    """permitido devuelve (False, 'lectura vieja') con lectura antigua."""
    estado = {"leido": "2026-11-15T12:00:00Z"}
    ahora = "2026-11-16T12:00:00Z"  # 24 h después
    resultado, motivo = permitido(estado, ahora, 50.0)
    assert resultado is False
    assert motivo == "lectura vieja (más de 6 h)"


def permitido_ok():
    """permitido devuelve (True, 'ok') con todo en orden."""
    estado = {"leido": "2026-11-16T10:00:00Z"}
    ahora = "2026-11-16T12:00:00Z"  # 2 h después, dentro de 6 h
    resultado, motivo = permitido(estado, ahora, 50.0)
    assert resultado is True
    assert motivo == "ok"


def permitido_tope_dia():
    """permitido devuelve (False, 'tope del día alcanzado') cuando se gasta el tope."""
    estado = {
        "dia": "2026-11-16",
        "saldo_inicio_dia": 100.0,
        "saldo_ultimo": 0.0,
        "leido": "2026-11-16T10:00:00Z",
    }
    ahora = "2026-11-16T12:00:00Z"
    resultado, motivo = permitido(estado, ahora, 100.0)
    assert resultado is False
    assert motivo == "tope del día alcanzado"


def permitido_saldo_bajo_margen():
    """permitido devuelve (False, 'saldo bajo el margen') cuando saldo es bajo."""
    estado = {
        "dia": "2026-11-16",
        "saldo_inicio_dia": 10.0,
        "saldo_ultimo": 0.25,
        "leido": "2026-11-16T10:00:00Z",
    }
    ahora = "2026-11-16T12:00:00Z"
    resultado, motivo = permitido(estado, ahora, 50.0, margen_min_usd=0.5)
    assert resultado is False
    assert motivo == "saldo bajo el margen"


def permitido_sin_leer_entorno():
    """Ninguna función lee variable de entorno ni hace llamado de red."""
    import inspect
    src_saldo = inspect.getsource(saldo_usd)
    src_registrar = inspect.getsource(registrar)
    src_gasto = inspect.getsource(gasto_del_dia)
    src_permitido = inspect.getsource(permitido)
    assert "os.environ" not in src_saldo
    assert "os.environ" not in src_registrar
    assert "os.environ" not in src_gasto
    assert "os.environ" not in src_permitido
    assert "import os" not in src_saldo or "# noqa" in src_saldo  # os puede importarse pero no usarse
    # Lo importante: ninguna llamada a API, solo dict operations


def recarga_mitad_dia():
    """registrar con recarga: el gasto no vuelve negativo aunque suba el saldo."""
    estado = {
        "dia": "2026-11-16",
        "saldo_inicio_dia": 100.0,
        "saldo_ultimo": 80.0,
        "leido": "2026-11-16T12:00:00Z",
    }
    ahora = "2026-11-16T14:00:00Z"
    after_recharge = registrar(estado, 120.0, ahora)
    assert after_recharge["saldo_ultimo"] == 120.0
    gasto = gasto_del_dia(after_recharge)
    assert gasto == 0.0, f"Expected 0.0 got {gasto}"


if __name__ == "__main__":
    saldo_normal()
    saldo_campos_faltantes()
    saldo_negativo()
    registrar_cambio_dia()
    registrar_mismo_dia()
    gasto_sin_lectura()
    gasto_normal()
    gasto_saldo_mayor()
    permitido_sin_lectura()
    permitido_lectura_vieja()
    permitido_ok()
    permitido_tope_dia()
    permitido_saldo_bajo_margen()
    permitido_sin_leer_entorno()
    recarga_mitad_dia()
    print("Todas las pruebas passed")