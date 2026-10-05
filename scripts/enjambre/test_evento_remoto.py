# -*- coding: utf-8 -*-
"""Tests de evento remoto: debe_ir_al_bus, latido cada 10 min, STARSEED_EVENTOS_REMOTOS=todos."""
import importlib.util
import json
import os
import sys
import time

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

TIPOS_BUS = {
    "fallo", "conflicto", "bloqueante", "verificado", "verificacion_fallida",
    "cola_terminada", "esperando_aprobacion", "arranque", "reintento",
    "proveedor_caido", "proveedor_recuperado", "commit", "rechazada",
    "inicio", "aprobacion", "detenida",
}


@pytest.fixture()
def entorno_remoto(tmp_path, monkeypatch):
    monkeypatch.setattr(enjambre, "EVENTOS", str(tmp_path / "eventos.jsonl"))
    monkeypatch.setattr(enjambre, "ANON", "")
    monkeypatch.setattr(enjambre, "ULTIMO_LATIDO_REMOTO", 0.0)
    llamadas = []
    monkeypatch.setattr(
        enjambre.urllib.request, "urlopen",
        lambda req, timeout=None: llamadas.append(req) or type("R", (), {"read": lambda s: b"{}"})()
    )
    return tmp_path, llamadas


def test_tipos_bus_van_locales_no(entorno_remoto):
    tmp_path, _ = entorno_remoto
    for t in TIPOS_BUS:
        assert enjambre.debe_ir_al_bus(t, 1000.0, 0.0) is True
    for no in ("paso", "aviso", "estancado", "reenrutado", "reasignado", "sin_cambios", "verificando"):
        assert enjambre.debe_ir_al_bus(no, 1000.0, 0.0) is False


def test_todos_env_devuelve_todo(entorno_remoto, monkeypatch):
    monkeypatch.setenv("STARSEED_EVENTOS_REMOTOS", "todos")
    assert enjambre.debe_ir_al_bus("paso", 0.0, 0.0) is True
    assert enjambre.debe_ir_al_bus("aviso", 0.0, 0.0) is True


def test_latido_5min_solo_primero(entorno_remoto, monkeypatch):
    monkeypatch.setattr(enjambre, "ULTIMO_LATIDO_REMOTO", 0.0)
    # A los 600 s (10 min) con último en 0 → va; con 300 s (5 min) → no
    assert enjambre.debe_ir_al_bus("latido", 600.0, 0.0) is True
    monkeypatch.setattr(enjambre, "ULTIMO_LATIDO_REMOTO", 300.0)
    assert enjambre.debe_ir_al_bus("latido", 600.0, 300.0) is False


def test_latido_11min_los_dos(entorno_remoto, monkeypatch):
    monkeypatch.setattr(enjambre, "ULTIMO_LATIDO_REMOTO", 0.0)
    # 660 s (11 min) entre latidos → va
    assert enjambre.debe_ir_al_bus("latido", 660.0, 0.0) is True
    # Segundo latido a 660 con último en 660: 0 < 600 → no va (uno cada 10 min)
    monkeypatch.setattr(enjambre, "ULTIMO_LATIDO_REMOTO", 660.0)
    assert enjambre.debe_ir_al_bus("latido", 660.0, 660.0) is False


def test_evento_local_solo_escribe_archivo(entorno_remoto):
    tmp_path, llamadas = entorno_remoto
    # ANON ya es "" por el fixture; debe_ir_al_bus con tipo no bus → no red
    enjambre.evento("aviso", "t1", "mensaje de prueba")
    ruta = tmp_path / "eventos.jsonl"
    contenido = ruta.read_text(encoding="utf-8")
    assert "mensaje de prueba" in contenido
    assert len(llamadas) == 0  # ningún POST remoto (ANON="")
