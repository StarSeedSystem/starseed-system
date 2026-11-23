"""Tests para validar el esquema de bateria-1118.json contra pruebas_malla.py."""

import json
from pathlib import Path

import pytest

from pruebas_malla import (
    APARATOS,
    ANTenas,
    BATERIA_JSON,
    cargar_bateria,
    evaluar_patrones,
    filtrar_bateria,
)


class TestBateriaSchema:
    """Valida que bateria-1118.json cumple el esquema esperado."""

    def test_archivo_existe(self):
        assert BATERIA_JSON.exists(), f"Falta {BATERIA_JSON}"

    def test_estructura_raiz(self):
        bateria = cargar_bateria()
        assert isinstance(bateria, dict)
        assert "pruebas" in bateria
        assert isinstance(bateria["pruebas"], list)
        assert len(bateria["pruebas"]) > 0

    def test_cada_prueba_tiene_campos_obligatorios(self):
        bateria = cargar_bateria()
        campos_obligatorios = {"id", "titulo", "aparatos", "antena", "ronda", "pasos", "criterios"}
        for p in bateria["pruebas"]:
            assert campos_obligatorios.issubset(p.keys()), f"Faltan campos en {p.get('id', '?')}: {campos_obligatorios - p.keys()}"

    def test_id_tiene_prefijo_bloque_valido(self):
        bateria = cargar_bateria()
        bloques_validos = {"B1", "B2", "B3", "B4", "B5"}
        for p in bateria["pruebas"]:
            bloque = p["id"].split("-")[0]
            assert bloque in bloques_validos, f"Bloque inválido en {p['id']}: {bloque}"

    def test_aparatos_son_validos(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            for ap in p["aparatos"]:
                assert ap in APARATOS, f"Aparato inválido en {p['id']}: {ap}"

    def test_antena_es_valida(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert p["antena"] in ANTenas, f"Antena inválida en {p['id']}: {p['antena']}"

    def test_ronda_es_entero_positivo(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert isinstance(p["ronda"], int) and p["ronda"] > 0, f"Ronda inválida en {p['id']}: {p['ronda']}"

    def test_pasos_es_lista_no_vacia(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert isinstance(p["pasos"], list) and len(p["pasos"]) > 0, f"Pasos inválidos en {p['id']}"

    def test_criterios_tienen_debe_y_no_debe_por_aparato(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            criterios = p["criterios"]
            assert isinstance(criterios, dict)
            for ap in p["aparatos"]:
                assert ap in criterios, f"Falta criterio para aparato {ap} en {p['id']}"
                crit = criterios[ap]
                assert "debe" in crit and "no_debe" in crit, f"Faltan debe/no_debe en {ap} de {p['id']}"
                assert isinstance(crit["debe"], list)
                assert isinstance(crit["no_debe"], list)

    def test_ids_unicos(self):
        bateria = cargar_bateria()
        ids = [p["id"] for p in bateria["pruebas"]]
        assert len(ids) == len(set(ids)), "Hay IDs duplicados"


class TestFiltrarBateria:
    """Pruebas de la función filtrar_bateria."""

    def test_filtrar_por_bloque(self):
        bateria = cargar_bateria()
        pruebas_b1 = filtrar_bateria(bateria, bloque="B1")
        assert all(p["id"].startswith("B1-") for p in pruebas_b1)
        assert len(pruebas_b1) == 2

    def test_filtrar_por_ronda(self):
        bateria = cargar_bateria()
        pruebas_r2 = filtrar_bateria(bateria, ronda=2)
        assert all(p["ronda"] == 2 for p in pruebas_r2)
        assert len(pruebas_r2) == 2

    def test_filtrar_por_bloque_y_ronda(self):
        bateria = cargar_bateria()
        pruebas = filtrar_bateria(bateria, bloque="B2", ronda=2)
        assert all(p["id"].startswith("B2-") and p["ronda"] == 2 for p in pruebas)
        assert len(pruebas) == 1

    def test_sin_filtros_devuelve_todas(self):
        bateria = cargar_bateria()
        todas = filtrar_bateria(bateria)
        assert len(todas) == len(bateria["pruebas"])


class TestEvaluarPatrones:
    """Pruebas de la función evaluar_patrones."""

    def test_debe_cumplido(self):
        lineas = ["BLE anuncio iniciado", "advertising started OK"]
        criterios = {"debe": ["BLE.*anuncio.*iniciado", "advertising.*started"], "no_debe": []}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 2
        assert res["debe_faltantes"] == []

    def test_debe_faltante(self):
        lineas = ["BLE anuncio iniciado"]
        criterios = {"debe": ["BLE.*anuncio.*iniciado", "advertising.*started"], "no_debe": []}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert res["debe_cumplidos"] == 1
        assert "advertising.*started" in res["debe_faltantes"]

    def test_no_debe_violado(self):
        lineas = ["BLE error de conexión"]
        criterios = {"debe": [], "no_debe": ["BLE.*error"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert "BLE.*error" in res["no_debe_violados"]

    def test_no_debe_cumplido(self):
        lineas = ["BLE anuncio iniciado", "todo OK"]
        criterios = {"debe": [], "no_debe": ["BLE.*error", "timeout"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is True
        assert res["no_debe_cumplidos"] == 2


class TestRecortarVentana:
    """Pruebas de la función recortar_ventana."""

    def test_recortar_ventana_basico(self):
        from datetime import datetime, timezone
        from pruebas_malla import recortar_ventana

        lineas = [
            "2024-01-01T10:00:00Z inicio",
            "2024-01-01T10:05:00Z medio",
            "2024-01-01T10:10:00Z fin",
        ]
        inicio = datetime(2024, 1, 1, 10, 2, 0, tzinfo=timezone.utc)
        fin = datetime(2024, 1, 1, 10, 8, 0, tzinfo=timezone.utc)
        res = recortar_ventana(lineas, inicio, fin)
        assert len(res) == 1
        assert "medio" in res[0]

    def test_sin_limites_devuelve_todas(self):
        from pruebas_malla import recortar_ventana

        lineas = ["2024-01-01T10:00:00Z a", "2024-01-01T10:05:00Z b"]
        res = recortar_ventana(lineas, None, None)
        assert res == lineas


if __name__ == "__main__":
    pytest.main([__file__, "-v"])