"""Tests para validar el esquema de bateria-1118.json contra pruebas_malla.py."""
from __future__ import annotations

import json
from pathlib import Path

import pytest


RAIZ_REPO = Path(__file__).resolve().parents[2]
BATERIA_JSON = RAIZ_REPO / "starseed_memory_root" / "pruebas" / "bateria-1118.json"

APARATOS_VALIDOS = {"mac", "maggabox", "tableta"}
ANTenas_VALIDAS = {"ble", "wifi", "malla"}
BLOQUES_VALIDOS = {"B1", "B2", "B3", "B4", "B5"}


def test_bateria_existe() -> None:
    assert BATERIA_JSON.exists(), f"No existe {BATERIA_JSON}"


def test_bateria_es_json_valido() -> None:
    with BATERIA_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict)
    assert "pruebas" in data
    assert isinstance(data["pruebas"], list)
    assert len(data["pruebas"]) > 0


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_tiene_campos_requeridos(prueba: dict) -> None:
    campos = ("id", "titulo", "ronda", "aparatos", "antena", "pasos", "criterios")
    for campo in campos:
        assert campo in prueba, f"Falta campo '{campo}' en prueba {prueba.get('id', '?')}"


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_id_formato(prueba: dict) -> None:
    pid = prueba["id"]
    assert isinstance(pid, str)
    assert "-" in pid
    bloque = pid.split("-")[0]
    assert bloque in BLOQUES_VALIDOS, f"Bloque inválido '{bloque}' en {pid}"


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_ronda_entero_positivo(prueba: dict) -> None:
    ronda = prueba["ronda"]
    assert isinstance(ronda, int)
    assert 1 <= ronda <= 5


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_aparatos_validos(prueba: dict) -> None:
    aparatos = prueba["aparatos"]
    assert isinstance(aparatos, list)
    assert len(aparatos) > 0
    for a in aparatos:
        assert a in APARATOS_VALIDOS, f"Aparato inválido '{a}' en {prueba['id']}"


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_antena_valida(prueba: dict) -> None:
    antena = prueba["antena"]
    assert antena in ANTenas_VALIDAS, f"Antena inválida '{antena}' en {prueba['id']}"


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_pasos_lista_no_vacia(prueba: dict) -> None:
    pasos = prueba["pasos"]
    assert isinstance(pasos, list)
    assert len(pasos) > 0
    for p in pasos:
        assert isinstance(p, str) and p.strip()


@pytest.mark.parametrize("prueba", json.loads(BATERIA_JSON.read_text(encoding="utf-8"))["pruebas"])
def test_prueba_criterios_estructura(prueba: dict) -> None:
    criterios = prueba["criterios"]
    assert isinstance(criterios, dict)
    assert len(criterios) > 0
    for aparato, crit in criterios.items():
        assert aparato in APARATOS_VALIDOS, f"Aparato en criterios inválido '{aparato}' en {prueba['id']}"
        assert isinstance(crit, dict)
        assert "debe" in crit and "no_debe" in crit
        assert isinstance(crit["debe"], list)
        assert isinstance(crit["no_debe"], list)
        for patron in crit["debe"] + crit["no_debe"]:
            assert isinstance(patron, str) and patron.strip()


def test_filtrar_bateria_por_bloque() -> None:
    from scripts.puente.pruebas_malla import cargar_bateria, filtrar_bateria

    bateria = cargar_bateria()
    pruebas_b4 = filtrar_bateria(bateria, bloque="B4")
    assert all(p["id"].startswith("B4-") for p in pruebas_b4)
    assert len(pruebas_b4) == 2


def test_filtrar_bateria_por_ronda() -> None:
    from scripts.puente.pruebas_malla import cargar_bateria, filtrar_bateria

    bateria = cargar_bateria()
    pruebas_ronda2 = filtrar_bateria(bateria, ronda=2)
    assert all(p["ronda"] == 2 for p in pruebas_ronda2)
    assert len(pruebas_ronda2) == 2


def test_evaluar_patrones_basico() -> None:
    from scripts.puente.pruebas_malla import evaluar_patrones

    lineas = ["BLE_ADV_START ok", "DISCOVERED mac ok", "CONNECTED ok"]
    criterios = {"debe": ["BLE_ADV_START", "CONNECTED"], "no_debe": ["BLE_ERROR"]}
    res = evaluar_patrones(lineas, criterios)
    assert res["ok"] is True
    assert res["debe_cumplidos"] == 2
    assert res["no_debe_cumplidos"] == 1


def test_evaluar_patrones_falta_debe() -> None:
    from scripts.puente.pruebas_malla import evaluar_patrones

    lineas = ["BLE_ADV_START ok"]
    criterios = {"debe": ["BLE_ADV_START", "CONNECTED"], "no_debe": []}
    res = evaluar_patrones(lineas, criterios)
    assert res["ok"] is False
    assert "CONNECTED" in res["debe_faltantes"]


def test_evaluar_patrones_viola_no_debe() -> None:
    from scripts.puente.pruebas_malla import evaluar_patrones

    lineas = ["BLE_ADV_START ok", "BLE_ERROR timeout"]
    criterios = {"debe": ["BLE_ADV_START"], "no_debe": ["BLE_ERROR"]}
    res = evaluar_patrones(lineas, criterios)
    assert res["ok"] is False
    assert "BLE_ERROR" in res["no_debe_violados"]