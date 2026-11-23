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

    def test_json_valido(self):
        """El archivo debe ser JSON válido."""
        with BATERIA_JSON.open(encoding="utf-8") as f:
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
        campos_requeridos = {"id", "titulo", "ronda", "aparatos", "antena", "pasos", "criterios"}
        for prueba in bateria["pruebas"]:
            assert set(prueba.keys()) >= campos_requeridos, f"Faltan campos en {prueba.get('id', '?')}"
            assert isinstance(prueba["id"], str)
            assert isinstance(prueba["titulo"], str)
            assert isinstance(prueba["ronda"], int)
            assert isinstance(prueba["aparatos"], list)
            assert isinstance(prueba["antena"], str)
            assert isinstance(prueba["pasos"], list)
            assert isinstance(prueba["criterios"], dict)

    def test_ids_siguen_patron_bloque(self):
        """Los IDs deben empezar con B1..B5."""
        bateria = cargar_bateria()
        bloques_validos = {"B1", "B2", "B3", "B4", "B5"}
        for prueba in bateria["pruebas"]:
            bloque = prueba["id"].split("-")[0]
            assert bloque in bloques_validos, f"Bloque inválido en {prueba['id']}: {bloque}"

    def test_aparatos_validos(self):
        """Los aparatos deben estar en APARATOS."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            for aparato in prueba["aparatos"]:
                assert aparato in APARATOS, f"Aparato inválido {aparato} en {prueba['id']}"

    def test_antena_valida(self):
        """La antena debe estar en ANTenas."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            assert prueba["antena"] in ANTenas, f"Antena inválida {prueba['antena']} en {prueba['id']}"

    def test_criterios_tienen_debe_y_no_debe(self):
        """Cada criterio por aparato debe tener listas 'debe' y 'no_debe'."""
        bateria = cargar_bateria()
        for prueba in bateria["pruebas"]:
            for aparato, criterio in prueba["criterios"].items():
                assert aparato in APARATOS, f"Aparato en criterios inválido: {aparato}"
                assert "debe" in criterio, f"Falta 'debe' en criterios de {aparato} para {prueba['id']}"
                assert "no_debe" in criterio, f"Falta 'no_debe' en criterios de {aparato} para {prueba['id']}"
                assert isinstance(criterio["debe"], list), f"'debe' debe ser lista en {prueba['id']}"
                assert isinstance(criterio["no_debe"], list), f"'no_debe' debe ser lista en {prueba['id']}"
                for patron in criterio["debe"]:
                    assert isinstance(patron, str), f"Patrón 'debe' no es string en {prueba['id']}"
                for patron in criterio["no_debe"]:
                    assert isinstance(patron, str), f"Patrón 'no_debe' no es string en {prueba['id']}"

    def test_filtrar_por_bloque(self):
        """filtrar_bateria debe filtrar correctamente por bloque."""
        bateria = cargar_bateria()
        b3 = filtrar_bateria(bateria, bloque="B3")
        assert all(p["id"].startswith("B3-") for p in b3)
        assert len(b3) == 3

    def test_filtrar_por_ronda(self):
        """filtrar_bateria debe filtrar correctamente por ronda."""
        bateria = cargar_bateria()
        r2 = filtrar_bateria(bateria, ronda=2)
        assert all(p["ronda"] == 2 for p in r2)
        assert len(r2) == 3

    def test_filtrar_por_bloque_y_ronda(self):
        """filtrar_bateria debe combinar filtros."""
        bateria = cargar_bateria()
        b4_r3 = filtrar_bateria(bateria, bloque="B4", ronda=3)
        assert all(p["id"].startswith("B4-") and p["ronda"] == 3 for p in b4_r3)
        assert len(b4_r3) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])