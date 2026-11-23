"""Tests para validar el esquema de bateria-1118.json contra pruebas_malla.py."""

import json
from pathlib import Path

import pytest

from pruebas_malla import (
    APARATOS,
    ANTenas,
    BATERIA_JSON,
    cargar_bateria,
    filtrar_bateria,
)


class TestBateriaSchema:
    """Valida que bateria-1118.json cumple el esquema esperado por pruebas_malla.py."""

    def test_archivo_existe(self):
        """El archivo de batería debe existir."""
        assert BATERIA_JSON.exists(), f"No existe {BATERIA_JSON}"

    def test_es_json_valido(self):
        """El archivo debe ser JSON válido."""
        with BATERIA_JSON.open("r", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict)
        assert "pruebas" in data
        assert isinstance(data["pruebas"], list)

    def test_cargar_bateria_funciona(self):
        """cargar_bateria() debe cargar sin errores."""
        bateria = cargar_bateria()
        assert "pruebas" in bateria
        assert len(bateria["pruebas"]) > 0

    def test_cada_prueba_tiene_campos_requeridos(self):
        """Cada prueba debe tener todos los campos requeridos."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            assert "id" in prueba, "Falta 'id'"
            assert "titulo" in prueba, "Falta 'titulo'"
            assert "ronda" in prueba, "Falta 'ronda'"
            assert "aparatos" in prueba, "Falta 'aparatos'"
            assert "antena" in prueba, "Falta 'antena'"
            assert "pasos" in prueba, "Falta 'pasos'"
            assert "criterios" in prueba, "Falta 'criterios'"

    def test_id_tiene_formato_bloque(self):
        """El ID debe empezar con bloque (B1, B2, B3, B4, B5)."""
        bateria = cargar_bateria()
        bloques_validos = {"B1", "B2", "B3", "B4", "B5"}
        for prueba in bateria["pruebas"]:
            bloque = prueba["id"].split("-")[0]
            assert bloque in bloques_validos, f"Bloque inválido en {prueba['id']}: {bloque}"

    def test_aparatos_validos(self):
        """Los aparatos deben ser de la lista permitida."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            for aparato in prueba["aparatos"]:
                assert aparato in APARATOS, f"Aparato inválido: {aparato}"

    def test_antena_valida(self):
        """La antena debe ser de la lista permitida."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            assert prueba["antena"] in ANTenas, f"Antena inválida: {prueba['antena']}"

    def test_ronda_es_entero_positivo(self):
        """La ronda debe ser un entero >= 1."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            assert isinstance(prueba["ronda"], int), f"Ronda no es int: {prueba['ronda']}"
            assert prueba["ronda"] >= 1, f"Ronda < 1: {prueba['ronda']}"

    def test_pasos_es_lista_no_vacia(self):
        """Los pasos deben ser una lista no vacía de strings."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            assert isinstance(prueba["pasos"], list), "Pasos no es lista"
            assert len(prueba["pasos"]) > 0, "Pasos vacío"
            for paso in prueba["pasos"]:
                assert isinstance(paso, str), "Paso no es string"

    def test_criterios_tiene_debe_y_no_debe(self):
        """Cada aparato en criterios debe tener listas 'debe' y 'no_debe'."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            criterios = prueba["criterios"]
            assert isinstance(criterios, dict), "Criterios no es dict"
            for aparato, crit in criterios.items():
                assert aparato in APARATOS, f"Aparato en criterios inválido: {aparato}"
                assert "debe" in crit, f"Falta 'debe' en {aparato}"
                assert "no_debe" in crit, f"Falta 'no_debe' en {aparato}"
                assert isinstance(crit["debe"], list), "'debe' no es lista"
                assert isinstance(crit["no_debe"], list), "'no_debe' no es lista"
                for pat in crit["debe"]:
                    assert isinstance(pat, str), "Patrón 'debe' no es string"
                for pat in crit["no_debe"]:
                    assert isinstance(pat, str), "Patrón 'no_debe' no es string"

    def test_filtrar_bateria_por_bloque(self):
        """filtrar_bateria debe filtrar correctamente por bloque."""
        bateria = cargar_bateria()
        pruebas_b1 = filtrar_bateria(bateria, bloque="B1")
        assert all(p["id"].startswith("B1-") for p in pruebas_b1)
        assert len(pruebas_b1) > 0

    def test_filtrar_bateria_por_ronda(self):
        """filtrar_bateria debe filtrar correctamente por ronda."""
        bateria = cargar_bateria()
        pruebas_r1 = filtrar_bateria(bateria, ronda=1)
        assert all(p["ronda"] == 1 for p in pruebas_r1)
        assert len(pruebas_r1) > 0

    def test_ids_unicos(self):
        """Todos los IDs deben ser únicos."""
        bateria = cargar_bateria()
        ids = [p["id"] for p in bateria["pruebas"]]
        assert len(ids) == len(set(ids)), "Hay IDs duplicados"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])