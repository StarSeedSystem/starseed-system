"""Tests for PRU1118A battery schema validation."""
import json
from pathlib import Path

import pytest

from pruebas_malla import (
    cargar_bateria,
    filtrar_bateria,
    evaluar_patrones,
    recortar_ventana,
    formatear_informe,
    linea_registro_inicio,
    linea_registro_fin,
    BATERIA_JSON,
)


class TestBateriaSchema:
    """Validate bateria-1118.json structure matches pruebas_malla.py expectations."""

    def test_bateria_file_exists(self):
        assert BATERIA_JSON.exists(), f"Battery file not found at {BATERIA_JSON}"

    def test_bateria_loads_valid_json(self):
        data = cargar_bateria()
        assert isinstance(data, dict)
        assert "pruebas" in data
        assert isinstance(data["pruebas"], list)
        assert len(data["pruebas"]) > 0

    def test_each_prueba_has_required_fields(self):
        data = cargar_bateria()
        required_fields = {"id", "titulo", "ronda", "aparatos", "antena", "pasos", "criterios"}
        for prueba in data["pruebas"]:
            missing = required_fields - set(prueba.keys())
            assert not missing, f"Prueba {prueba.get('id', '?')} missing fields: {missing}"

    def test_id_format_blocks_b1_to_b5(self):
        data = cargar_bateria()
        for prueba in data["pruebas"]:
            pid = prueba["id"]
            assert pid.startswith(("B1-", "B2-", "B3-", "B4-", "B5-")), f"Invalid block prefix in {pid}"
            assert "-" in pid[3:], f"ID {pid} must have format B#-TYPE-A#"

    def test_ronda_is_positive_int(self):
        data = cargar_bateria()
        for prueba in data["pruebas"]:
            assert isinstance(prueba["ronda"], int), f"Ronda must be int in {prueba['id']}"
            assert 1 <= prueba["ronda"] <= 5, f"Ronda out of range 1-5 in {prueba['id']}"

    def test_aparatos_subset_of_known(self):
        data = cargar_bateria()
        known = {"mac", "maggabox", "tableta"}
        for prueba in data["pruebas"]:
            for a in prueba["aparatos"]:
                assert a in known, f"Unknown aparato '{a}' in {prueba['id']}"

    def test_antena_is_known(self):
        data = cargar_bateria()
        known = {"ble", "wifi", "malla"}
        for prueba in data["pruebas"]:
            assert prueba["antena"] in known, f"Unknown antena '{prueba['antena']}' in {prueba['id']}"

    def test_criterios_has_debe_no_debe_per_aparato(self):
        data = cargar_bateria()
        for prueba in data["pruebas"]:
            criterios = prueba["criterios"]
            assert isinstance(criterios, dict), f"Criterios must be dict in {prueba['id']}"
            for aparato in prueba["aparatos"]:
                assert aparato in criterios, f"Missing criterios for {aparato} in {prueba['id']}"
                crit = criterios[aparato]
                assert "debe" in crit and "no_debe" in crit, f"Missing debe/no_debe for {aparato} in {prueba['id']}"
                assert isinstance(crit["debe"], list), f"'debe' must be list for {aparato} in {prueba['id']}"
                assert isinstance(crit["no_debe"], list), f"'no_debe' must be list for {aparato} in {prueba['id']}"
                for pat in crit["debe"] + crit["no_debe"]:
                    assert isinstance(pat, str) and pat, f"Empty pattern in {aparato} of {prueba['id']}"

    def test_no_real_credentials_or_ips_in_patterns(self):
        data = cargar_bateria()
        forbidden = ["@", "://", "ssh-", "password", "secret", "token", "key"]
        for prueba in data["pruebas"]:
            for aparato, crit in prueba["criterios"].items():
                for pat in crit["debe"] + crit["no_debe"]:
                    for f in forbidden:
                        assert f not in pat.lower(), f"Forbidden substring '{f}' in pattern '{pat}' of {prueba['id']}/{aparato}"


class TestFiltrarBateria:
    def test_filter_by_bloque(self):
        bateria = cargar_bateria()
        b4 = filtrar_bateria(bateria, bloque="B4")
        assert all(p["id"].startswith("B4-") for p in b4)
        assert len(b4) == 2

    def test_filter_by_ronda(self):
        bateria = cargar_bateria()
        r3 = filtrar_bateria(bateria, ronda=3)
        assert all(p["ronda"] == 3 for p in r3)
        assert len(r3) == 2

    def test_filter_both(self):
        bateria = cargar_bateria()
        b4r4 = filtrar_bateria(bateria, bloque="B4", ronda=4)
        assert all(p["id"].startswith("B4-") and p["ronda"] == 4 for p in b4r4)
        assert len(b4r4) == 2


class TestEvaluarPatrones:
    def test_debe_all_match_ok(self):
        lineas = ["BLE_ADV_START", "DISCOVERED_mac_123", "CONNECTED"]
        res = evaluar_patrones(lineas, {"debe": ["BLE_ADV_START", "DISCOVERED.*mac", "CONNECTED"], "no_debe": []})
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 3
        assert res["debe_faltantes"] == []

    def test_debe_missing_fails(self):
        lineas = ["BLE_ADV_START", "CONNECTED"]
        res = evaluar_patrones(lineas, {"debe": ["BLE_ADV_START", "DISCOVERED.*mac", "CONNECTED"], "no_debe": []})
        assert res["ok"] is False
        assert "DISCOVERED.*mac" in res["debe_faltantes"]

    def test_no_debe_violated_fails(self):
        lineas = ["BLE_ADV_START", "BLE_ERROR", "CONNECTED"]
        res = evaluar_patrones(lineas, {"debe": ["BLE_ADV_START", "CONNECTED"], "no_debe": ["BLE_ERROR"]})
        assert res["ok"] is False
        assert "BLE_ERROR" in res["no_debe_violados"]

    def test_no_debe_respected_ok(self):
        lineas = ["BLE_ADV_START", "CONNECTED"]
        res = evaluar_patrones(lineas, {"debe": ["BLE_ADV_START", "CONNECTED"], "no_debe": ["BLE_ERROR", "TIMEOUT"]})
        assert res["ok"] is True
        assert res["no_debe_cumplidos"] == 2


class TestRecortarVentana:
    def test_window_filters_by_time(self):
        from datetime import datetime, timezone, timedelta
        base = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        lineas = [
            "2026-01-15T11:59:00Z early",
            "2026-01-15T12:00:00Z start",
            "2026-01-15T12:30:00Z middle",
            "2026-01-15T13:00:00Z end",
            "2026-01-15T13:01:00Z late",
        ]
        res = recortar_ventana(lineas, base, base + timedelta(hours=1))
        assert len(res) == 3
        assert "early" not in "\n".join(res)
        assert "late" not in "\n".join(res)


class TestFormatearInforme:
    def test_generates_markdown_table(self):
        resultados = [
            {"id": "B1-MT-A1", "titulo": "Test", "resultado": "ok", "aparatos": ["mac", "tableta"], "nota": "good"},
        ]
        md = formatear_informe(resultados, ronda=1)
        assert "## Informe de pruebas · Ronda 1" in md
        assert "| ID | Título | Resultado | Aparatos |" in md
        assert "B1-MT-A1" in md
        assert "✅ ok" in md
        assert "mac, tableta" in md
        assert "*Nota:* good" in md


class TestRegistroLines:
    def test_linea_registro_inicio_format(self):
        line = linea_registro_inicio("B1-MT-A1", "2026-01-15T12:00:00Z")
        obj = json.loads(line)
        assert obj["tipo"] == "inicio"
        assert obj["id"] == "B1-MT-A1"
        assert obj["inicio"] == "2026-01-15T12:00:00Z"

    def test_linea_registro_fin_format(self):
        line = linea_registro_fin("B1-MT-A1", "ok", "todo bien")
        obj = json.loads(line)
        assert obj["tipo"] == "fin"
        assert obj["id"] == "B1-MT-A1"
        assert obj["resultado"] == "ok"
        assert obj["nota"] == "todo bien"