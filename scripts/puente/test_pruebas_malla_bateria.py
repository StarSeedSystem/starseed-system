"""Tests de validación de esquema para bateria-1118.json contra pruebas_malla.py."""
import json
from pathlib import Path

import pytest

from pruebas_malla import (
    APARATOS,
    ANTenas,
    BATERIA_JSON,
    cargar_bateria,
    filtrar_bateria,
    evaluar_patrones,
    recortar_ventana,
)


class TestBateriaSchema:
    """Valida que bateria-1118.json cumple el contrato esperado por pruebas_malla.py."""

    def test_archivo_existe(self):
        assert BATERIA_JSON.exists(), f"Falta {BATERIA_JSON}"

    def test_estructura_raiz(self):
        bateria = cargar_bateria()
        assert isinstance(bateria, dict)
        assert "version" in bateria
        assert "descripcion" in bateria
        assert "pruebas" in bateria
        assert isinstance(bateria["pruebas"], list)
        assert len(bateria["pruebas"]) > 0

    def test_cada_prueba_tiene_campos_obligatorios(self):
        bateria = cargar_bateria()
        campos_obligatorios = {"id", "titulo", "aparatos", "antena", "ronda", "pasos", "criterios"}
        for p in bateria["pruebas"]:
            assert campos_obligatorios.issubset(p.keys()), f"Faltan campos en {p.get('id', '?')}: {campos_obligatorios - p.keys()}"

    def test_id_formato_bloque(self):
        """ID debe empezar con B1..B5 seguido de guión."""
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert p["id"].startswith(("B1-", "B2-", "B3-", "B4-", "B5-")), f"ID inválido: {p['id']}"

    def test_aparatos_validos(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert isinstance(p["aparatos"], list)
            assert len(p["aparatos"]) > 0
            for a in p["aparatos"]:
                assert a in APARATOS, f"Aparato inválido {a} en {p['id']}"

    def test_antena_valida(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert p["antena"] in ANTenas, f"Antena inválida {p['antena']} en {p['id']}"

    def test_ronda_entero_positivo(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert isinstance(p["ronda"], int)
            assert p["ronda"] > 0

    def test_pasos_lista_no_vacia(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            assert isinstance(p["pasos"], list)
            assert len(p["pasos"]) > 0
            for paso in p["pasos"]:
                assert isinstance(paso, str)
                assert len(paso) > 0

    def test_criterios_estructura(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            criterios = p["criterios"]
            assert isinstance(criterios, dict)
            assert len(criterios) > 0
            for aparato, crit in criterios.items():
                assert aparato in APARATOS, f"Aparato en criterios no válido: {aparato}"
                assert isinstance(crit, dict)
                assert "debe" in crit
                assert "no_debe" in crit
                assert isinstance(crit["debe"], list)
                assert isinstance(crit["no_debe"], list)
                for patron in crit["debe"] + crit["no_debe"]:
                    assert isinstance(patron, str)
                    assert len(patron) > 0

    def test_ids_unicos(self):
        bateria = cargar_bateria()
        ids = [p["id"] for p in bateria["pruebas"]]
        assert len(ids) == len(set(ids)), "Hay IDs duplicados"

    def test_filtrar_bateria_por_bloque(self):
        bateria = cargar_bateria()
        pruebas_b1 = filtrar_bateria(bateria, bloque="B1")
        assert all(p["id"].startswith("B1-") for p in pruebas_b1)
        assert len(pruebas_b1) == 2

    def test_filtrar_bateria_por_ronda(self):
        bateria = cargar_bateria()
        pruebas_ronda2 = filtrar_bateria(bateria, ronda=2)
        assert all(p["ronda"] == 2 for p in pruebas_ronda2)
        assert len(pruebas_ronda2) == 2

    def test_filtrar_bateria_por_bloque_y_ronda(self):
        bateria = cargar_bateria()
        pruebas = filtrar_bateria(bateria, bloque="B2", ronda=2)
        assert len(pruebas) == 1
        assert pruebas[0]["id"] == "B2-ML-A2"


class TestLogicaPura:
    """Tests de las funciones puras de pruebas_malla.py."""

    def test_recortar_ventana_sin_limites(self):
        lineas = ["2024-01-01T10:00:00Z a", "2024-01-01T11:00:00Z b"]
        assert recortar_ventana(lineas, None, None) == lineas

    def test_recortar_ventana_con_limites(self):
        from datetime import datetime, timezone
        lineas = [
            "2024-01-01T09:00:00Z antes",
            "2024-01-01T10:00:00Z dentro",
            "2024-01-01T11:00:00Z dentro",
            "2024-01-01T12:00:00Z despues",
        ]
        inicio = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        fin = datetime(2024, 1, 1, 11, 0, 0, tzinfo=timezone.utc)
        res = recortar_ventana(lineas, inicio, fin)
        assert res == ["2024-01-01T10:00:00Z dentro", "2024-01-01T11:00:00Z dentro"]

    def test_evaluar_patrones_todo_ok(self):
        lineas = ["ERROR: algo falló", "INFO: todo bien", "WARN: cuidado"]
        criterios = {"debe": ["INFO.*bien"], "no_debe": ["ERROR"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False  # ERROR aparece y está en no_debe

    def test_evaluar_patrones_debe_cumplido_no_debe_respetado(self):
        lineas = ["INFO: todo bien", "DEBUG: detalles"]
        criterios = {"debe": ["INFO.*bien"], "no_debe": ["ERROR"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 1
        assert res["debe_faltantes"] == []
        assert res["no_debe_cumplidos"] == 1
        assert res["no_debe_violados"] == []

    def test_evaluar_patrones_debe_falta(self):
        lineas = ["DEBUG: solo debug"]
        criterios = {"debe": ["INFO.*bien"], "no_debe": ["ERROR"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert res["debe_cumplidos"] == 0
        assert "INFO.*bien" in res["debe_faltantes"]

    def test_evaluar_patrones_no_debe_violado(self):
        lineas = ["ERROR: catastrófico", "INFO: todo bien"]
        criterios = {"debe": ["INFO.*bien"], "no_debe": ["ERROR"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert "ERROR" in res["no_debe_violados"]


class TestBateriaCobertura:
    """Verifica cobertura mínima de la batería."""

    def test_todos_los_bloques_presentes(self):
        bateria = cargar_bateria()
        bloques = set(p["id"].split("-")[0] for p in bateria["pruebas"])
        assert bloques == {"B1", "B2", "B3", "B4", "B5"}

    def test_todas_antenas_cubiertas(self):
        bateria = cargar_bateria()
        antenas = set(p["antena"] for p in bateria["pruebas"])
        assert antenas == set(ANTenas)

    def test_todos_aparatos_cubiertos(self):
        bateria = cargar_bateria()
        aparatos_usados = set()
        for p in bateria["pruebas"]:
            aparatos_usados.update(p["aparatos"])
        assert aparatos_usados == set(APARATOS)

    def test_minimo_dos_pruebas_por_bloque(self):
        bateria = cargar_bateria()
        from collections import Counter
        conteo = Counter(p["id"].split("-")[0] for p in bateria["pruebas"])
        for bloque in ["B1", "B2", "B3", "B4", "B5"]:
            assert conteo[bloque] >= 2, f"Bloque {bloque} tiene menos de 2 pruebas"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])