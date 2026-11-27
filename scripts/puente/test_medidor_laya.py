#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red del medidor «Laya en cada medio» (LAY1127D)."""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medidor_laya as M

HOY = "2026-11-27"
MAC_OK = {"cargado": True, "motivo": "ok", "ramLibreMb": 512}
A1_OK = {"systemctl": "active", "http": {"cargado": True, "motivo": "ok"}}
USO = {"dias": {HOY: {"llamadas": 10, "por_medio": {
    "laya-local": {"llamadas": 3}, "laya": {"llamadas": 2}, "openrouter": {"llamadas": 5}}}}}


def test_mac_cargada():
    mac = M.resumen(MAC_OK, A1_OK, USO, HOY)["medios"][0]
    assert mac["medio"] == "mac"
    assert (mac["servicio"], mac["cargado"], mac["motivo"]) == (True, True, "ok")


def test_mac_sin_respuesta_es_sin_dato():
    mac = M.resumen(None, A1_OK, USO, HOY)["medios"][0]
    assert mac["servicio"] is False
    assert mac["cargado"] is None
    assert "sin dato" in mac["motivo"]


def test_a1_activo_y_cargado():
    a1 = M.resumen(MAC_OK, A1_OK, USO, HOY)["medios"][1]
    assert (a1["servicio"], a1["cargado"]) == (True, True)
    assert a1["motivo"] == "ok"


def test_a1_parado_no_se_inventa_la_carga():
    a1 = M.resumen(MAC_OK, {"systemctl": "inactive"}, USO, HOY)["medios"][1]
    assert a1["servicio"] is False
    assert a1["cargado"] is False
    assert "inactive" in a1["motivo"]


def test_a1_activo_sin_http_carga_desconocida():
    a1 = M.resumen(MAC_OK, {"systemctl": "active"}, USO, HOY)["medios"][1]
    assert a1["servicio"] is True
    assert a1["cargado"] is None
    assert "sin dato" in M.resumen(MAC_OK, {"systemctl": "active"}, USO, HOY)["texto"]


def test_llamadas_separan_laya_de_otros():
    r = M.resumen(MAC_OK, A1_OK, USO, HOY)
    assert r["llamadas_hoy"] == {"jev_laya": 5, "jev_otros": 5}
    assert "Laya 5 de 10" in r["texto"]


def test_dia_sin_uso_es_sin_dato():
    r = M.resumen(MAC_OK, A1_OK, USO, "2026-11-28")
    assert r["llamadas_hoy"] == {"jev_laya": None, "jev_otros": None}
    assert "sin dato" in r["texto"]


def test_texto_una_linea_y_medios_completos():
    r = M.resumen(MAC_OK, A1_OK, USO, HOY)
    assert "\n" not in r["texto"]
    assert [m["medio"] for m in r["medios"]] == ["mac", "a1"]
    assert set(r) == {"medios", "llamadas_hoy", "texto"}
    assert all(set(m) == {"medio", "servicio", "cargado", "motivo"} for m in r["medios"])


def test_tipos_rotos_no_lanzan():
    r = M.resumen("basura", [], {"dias": {HOY: {"por_medio": []}}}, HOY)
    assert r["medios"][0]["cargado"] is None
    assert r["medios"][1]["servicio"] is False
    assert r["llamadas_hoy"] == {"jev_laya": 0, "jev_otros": 0}


def test_main_escribe_el_mismo_formato(tmp_path, monkeypatch):
    ruta = tmp_path / "medidor-laya.json"
    monkeypatch.setattr(M, "SALIDA", str(ruta))
    monkeypatch.setattr(M, "_json", lambda fuente, timeout=3: MAC_OK if fuente == M.URL_MAC else USO)
    monkeypatch.setattr(M, "_estado_a1", lambda: A1_OK)
    assert M.main([]) == 0
    doc = json.loads(ruta.read_text(encoding="utf-8"))
    assert doc["t"] and doc["texto"] and doc["medios"][0]["medio"] == "mac"
