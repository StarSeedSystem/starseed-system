#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test mínimo: valida el esquema de bateria-1118.json contra pruebas_malla.py."""

import json
import pytest
from pathlib import Path

import pruebas_malla as pm


BATERIA_PATH = pm.BATERIA_JSON
APARATOS_VALIDOS = set(pm.APARATOS)
ANTENAS_VALIDAS = set(pm.ANTenas)


def test_bateria_existe():
    assert BATERIA_PATH.exists(), f"Falta {BATERIA_PATH}"


def test_bateria_carga_json_valido():
    with BATERIA_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict)
    assert "pruebas" in data
    assert isinstance(data["pruebas"], list)
    assert len(data["pruebas"]) > 0


def test_cada_prueba_tiene_campos_requeridos():
    bateria = pm.cargar_bateria()
    for p in bateria["pruebas"]:
        assert "id" in p and isinstance(p["id"], str)
        assert "titulo" in p and isinstance(p["titulo"], str)
        assert "ronda" in p and isinstance(p["ronda"], int)
        assert "aparatos" in p and isinstance(p["aparatos"], list)
        assert "antena" in p and isinstance(p["antena"], str)
        assert "pasos" in p and isinstance(p["pasos"], list)
        assert "criterios" in p and isinstance(p["criterios"], dict)


def test_id_con_prefijo_bloque_b1_a_b5():
    bateria = pm.cargar_bateria()
    for p in bateria["pruebas"]:
        pid = p["id"]
        assert pid.startswith(("B1-", "B2-", "B3-", "B4-", "B5-")), f"ID inválido: {pid}"


def test_aparatos_validos():
    bateria = pm.cargar_bateria()
    for p in bateria["pruebas"]:
        for a in p["aparatos"]:
            assert a in APARATOS_VALIDOS, f"Aparato inválido: {a}"


def test_antena_valida():
    bateria = pm.cargar_bateria()
    for p in bateria["pruebas"]:
        assert p["antena"] in ANTENAS_VALIDAS, f"Antena inválida: {p['antena']}"


def test_criterios_tienen_debe_y_no_debe_por_aparato():
    bateria = pm.cargar_bateria()
    for p in bateria["pruebas"]:
        criterios = p["criterios"]
        for aparato in p["aparatos"]:
            assert aparato in criterios, f"Falta criterios para {aparato} en {p['id']}"
            crit = criterios[aparato]
            assert "debe" in crit and isinstance(crit["debe"], list)
            assert "no_debe" in crit and isinstance(crit["no_debe"], list)
            for pat in crit["debe"] + crit["no_debe"]:
                assert isinstance(pat, str) and pat, "Patrón vacío o no string"


def test_filtrar_bateria_por_bloque_y_ronda():
    bateria = pm.cargar_bateria()
    b1 = pm.filtrar_bateria(bateria, bloque="B1")
    assert all(p["id"].startswith("B1-") for p in b1)
    r1 = pm.filtrar_bateria(bateria, ronda=1)
    assert all(p["ronda"] == 1 for p in r1)
    b1r1 = pm.filtrar_bateria(bateria, bloque="B1", ronda=1)
    assert all(p["id"].startswith("B1-") and p["ronda"] == 1 for p in b1r1)


def test_evaluar_patrones_estructura_salida():
    lineas = ["BLE activado", "Dispositivo encontrado starseed", "Emparejamiento exitoso"]
    criterios = {"debe": ["BLE.*activado", "starseed"], "no_debe": ["ERROR", "timeout"]}
    res = pm.evaluar_patrones(lineas, criterios)
    assert set(res.keys()) == {"ok", "debe_cumplidos", "debe_faltantes", "no_debe_cumplidos", "no_debe_violados", "evidencias"}
    assert res["ok"] is True
    assert res["debe_cumplidos"] == 2
    assert res["debe_faltantes"] == []
    assert res["no_debe_cumplidos"] == 2
    assert res["no_debe_violados"] == []


def test_evaluar_patrones_detecta_faltantes_y_violados():
    lineas = ["BLE activado", "ERROR de conexión"]
    criterios = {"debe": ["BLE.*activado", "starseed"], "no_debe": ["ERROR"]}
    res = pm.evaluar_patrones(lineas, criterios)
    assert res["ok"] is False
    assert "starseed" in res["debe_faltantes"]
    assert "ERROR" in res["no_debe_violados"]


def test_formatear_informe_genera_markdown():
    filas = [{"id": "B1-MT-A1", "titulo": "Test", "resultado": "ok", "aparatos": ["mac"], "nota": "OK"}]
    md = pm.formatear_informe(filas, ronda=1)
    assert "## Informe de pruebas · Ronda 1" in md
    assert "| ID | Título | Resultado | Aparatos |" in md
    assert "B1-MT-A1" in md
    assert "✅ ok" in md


def test_lineas_registro_formato_jsonl():
    inicio = pm.linea_registro_inicio("B1-MT-A1", "2026-01-01T00:00:00Z")
    fin = pm.linea_registro_fin("B1-MT-A1", "ok", "todo bien")
    for linea in (inicio, fin):
        obj = json.loads(linea)
        assert obj["id"] == "B1-MT-A1"
    assert json.loads(inicio)["tipo"] == "inicio"
    assert json.loads(fin)["tipo"] == "fin"
    assert json.loads(fin)["resultado"] == "ok"
    assert json.loads(fin)["nota"] == "todo bien"


def test_recortar_ventana_filtra_por_fecha():
    lineas = [
        "2026-01-01T00:00:00Z inicio",
        "2026-01-01T00:00:10Z medio",
        "2026-01-01T00:00:20Z fin",
    ]
    from datetime import datetime, timezone
    ini = datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc)
    fin = datetime(2026, 1, 1, 0, 0, 15, tzinfo=timezone.utc)
    out = pm.recortar_ventana(lineas, ini, fin)
    assert len(out) == 1
    assert "medio" in out[0]