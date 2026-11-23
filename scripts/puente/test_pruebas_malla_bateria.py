import json
from pathlib import Path

import pytest

BATERIA_JSON = Path(__file__).resolve().parent.parent.parent / "starseed_memory_root" / "pruebas" / "bateria-1118.json"


@pytest.fixture
def bateria():
    with BATERIA_JSON.open("r", encoding="utf-8") as f:
        return json.load(f)


def test_bateria_existe():
    assert BATERIA_JSON.exists(), f"Batería no encontrada: {BATERIA_JSON}"


def test_bateria_json_valido(bateria):
    assert "pruebas" in bateria, "Falta clave 'pruebas'"
    assert isinstance(bateria["pruebas"], list), "'pruebas' debe ser una lista"


def test_pruebas_tienen_campo_obligatorio(bateria):
    for p in bateria["pruebas"]:
        assert "id" in p, f"Prueba sin 'id': {p}"
        assert "titulo" in p, f"Prueba sin 'titulo': {p}"
        assert "criterios" in p, f"Prueba sin 'criterios': {p}"


def test_criterios_tienen_debe_y_no_debe(bateria):
    for p in bateria["pruebas"]:
        criterios = p.get("criterios", {})
        for aparato, regs in criterios.items():
            assert "debe" in regs, f"Falta 'debe' en {aparato} de {p['id']}"
            assert "no_debe" in regs, f"Falta 'no_debe' en {aparato} de {p['id']}"
            assert isinstance(regs["debe"], list), f"'debe' debe ser lista en {aparato} de {p['id']}"
            assert isinstance(regs["no_debe"], list), f"'no_debe' debe ser lista en {aparato} de {p['id']}"


def test_no_credenciales_ni_ips_realitas(bateria):
    contenido = BATERIA_JSON.read_text(encoding="utf-8").lower()
    palabras_clave = ["password", "clave", "token", "api_key", "ssh key", "contraseña"]
    for kw in palabras_clave:
        assert kw not in contenido, f"Encontrado posible dato sensible: {kw}"
    import re
    ips = re.findall(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", contenido)
    assert len(ips) == 0, f"Encontradas IPs: {ips}"


def test_bloques_B1_a_B5(bateria):
    ids = [p["id"] for p in bateria["pruebas"]]
    bloques = {pid.split("-")[0] for pid in ids}
    assert bloques == {"B1", "B2", "B3", "B4", "B5"}, f"Bloques inesperados: {bloques}"


def test_aparatos_validos(bateria):
    aparatos_validos = {"mac", "maggabox", "tableta"}
    for p in bateria["pruebas"]:
        for a in p.get("aparatos", []):
            assert a in aparatos_validos, f"Aparato inválido {a} en {p['id']}"


def test_antena_valida(bateria):
    antenas_validas = {"ble", "wifi", "malla"}
    for p in bateria["pruebas"]:
        antena = p.get("antena")
        assert antena in antenas_validas, f"Antena inválida {antena} en {p['id']}"


def test_rondas_secuenciales(bateria):
    rondas = {p["id"]: p.get("ronda") for p in bateria["pruebas"]}
    for pid, r in rondas.items():
        assert isinstance(r, int) and r >= 1, f"Ronda inválida {r} en {pid}"