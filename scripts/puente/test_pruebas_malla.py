#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_pruebas_malla.py — Tests unitarios para lógica pura de pruebas de malla.

Tests para funciones puras:
- recortar_ventana
- evaluar_patrones
- formatear_informe
- filtrar_bateria
- linea_registro_inicio
- linea_registro_fin
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

# Importar funciones a testear del módulo pruebas_malla
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.puente.pruebas_malla import (
    recortar_ventana,
    evaluar_patrones,
    formatear_informe,
    filtrar_bateria,
    linea_registro_inicio,
    linea_registro_fin,
)


class TestRecortarVentana:
    """Tests para recortar_ventana."""

    def test_todos_los_rangos(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · evento1",
            "2026-11-18T10:01:00.000Z · evento2",
            "2026-11-18T10:02:00.000Z · evento3",
        ]
        inicio = datetime(2026, 11, 18, 10, 0, 0, tzinfo=timezone.utc)
        fin = datetime(2026, 11, 18, 10, 1, 0, tzinfo=timezone.utc)
        resultado = recortar_ventana(lineas, inicio, fin)
        assert len(resultado) == 2
        assert "evento1" in resultado[0]
        assert "evento2" in resultado[1]

    def test_sin_filtro_fin(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · evento1",
            "2026-11-18T10:02:00.000Z · evento2",
        ]
        inicio = datetime(2026, 11, 18, 10, 0, 0, tzinfo=timezone.utc)
        resultado = recortar_ventana(lineas, inicio, None)
        assert len(resultado) == 2

    def test_sin_filtro_inicio(self) -> None:
        lineas = [
            "2026-11-18T09:00:00.000Z · evento1",
            "2026-11-18T10:02:00.000Z · evento2",
        ]
        fin = datetime(2026, 11, 18, 10, 0, 0, tzinfo=timezone.utc)
        resultado = recortar_ventana(lineas, None, fin)
        assert len(resultado) == 1
        assert "evento1" in resultado[0]

    def test_lineas_sin_fecha_se_descartan(self) -> None:
        lineas = [
            "evento sin fecha",
            "2026-11-18T10:00:00.000Z · evento1",
        ]
        inicio = datetime(2026, 11, 18, 10, 0, 0, tzinfo=timezone.utc)
        resultado = recortar_ventana(lineas, inicio, None)
        assert len(resultado) == 1
        assert "evento1" in resultado[0]


class TestEvaluarPatrones:
    """Tests para evaluar_patrones."""

    def test_todos_debe_cumplidos(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · ligado · b3 · neurona e0b9faf2",
        ]
        criterios = {
            "debe": [r".*ligado.*"],
            "no_debe": [r".*error.*"],
        }
        resultado = evaluar_patrones(lineas, criterios)
        assert resultado["ok"] is True
        assert resultado["debe_cumplidos"] == 1
        assert len(resultado["debe_faltantes"]) == 0
        assert resultado["no_debe_cumplidos"] == 1
        assert len(resultado["no_debe_violados"]) == 0

    def test_falta_debe(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · abierto",
        ]
        criterios = {
            "debe": [r".*ligado.*"],
            "no_debe": [],
        }
        resultado = evaluar_patrones(lineas, criterios)
        assert resultado["ok"] is False
        assert ".*ligado.*" in resultado["debe_faltantes"]

    def test_viola_no_debe(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · error en conexión",
        ]
        criterios = {
            "debe": [],
            "no_debe": [r".*error.*"],
        }
        resultado = evaluar_patrones(lineas, criterios)
        assert resultado["ok"] is False
        assert ".*error.*" in resultado["no_debe_violados"]

    def test_multiples_debe(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · ligado",
            "2026-11-18T10:01:00.000Z · abierto",
        ]
        criterios = {
            "debe": [r".*ligado.*", r".*abierto.*"],
            "no_debe": [],
        }
        resultado = evaluar_patrones(lineas, criterios)
        assert resultado["ok"] is True
        assert resultado["debe_cumplidos"] == 2

    def test_case_insensitive(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · LUGADO con texto",
        ]
        criterios = {
            "debe": [r".*LUGADO.*"],
            "no_debe": [],
        }
        resultado = evaluar_patrones(lineas, criterios)
        assert resultado["ok"] is True

    def test_case_insensitive_mayusculas(self) -> None:
        lineas = [
            "2026-11-18T10:00:00.000Z · LUGADO",
        ]
        criterios = {
            "debe": [r".*lugaDO.*"],
            "no_debe": [],
        }
        resultado = evaluar_patrones(lineas, criterios)
        assert resultado["ok"] is True


class TestFormatearInforme:
    """Tests para formatear_informe."""

    def test_informe_con_resultados(self) -> None:
        resultados = [
            {
                "id": "B4-MT-A1",
                "titulo": "Test 1",
                "resultado": "ok",
                "aparatos": ["mac", "tableta"],
            },
            {
                "id": "B4-MT-A2",
                "titulo": "Test 2",
                "resultado": "fallo",
                "aparatos": ["mac"],
                "nota": "Error de conexión",
            },
        ]
        md = formatear_informe(resultados, ronda=1)
        assert "B4-MT-A1" in md
        assert "Test 1" in md
        assert "✅ ok" in md
        assert "Test 2" in md
        assert "❌ fallo" in md
        assert "Error de conexión" in md
        assert "Ronda 1" in md

    def test_informe_vacio(self) -> None:
        md = formatear_informe([], ronda=1)
        assert "Sin pruebas" in md

    def test_informe_sin_ronda(self) -> None:
        resultados = [{"id": "B4-MT-A1", "titulo": "Test", "resultado": "ok", "aparatos": ["mac"]}]
        md = formatear_informe(resultados, ronda=None)
        assert "Informe de pruebas" in md
        assert "Ronda" not in md


class TestFiltrarBateria:
    """Tests para filtrar_bateria."""

    @pytest.fixture
    def bateria_temp(self, tmp_path: Path) -> str:
        bateria = {
            "pruebas": [
                {"id": "B4-MT-A1", "titulo": "Test 1", "ronda": 1, "aparatos": ["mac"]},
                {"id": "B4-WI-A1", "titulo": "Test WiFi", "ronda": 1, "aparatos": ["mac"]},
                {"id": "B4-MA-A1", "titulo": "Test Malla", "ronda": 2, "aparatos": ["mac"]},
            ]
        }
        ruta = tmp_path / "bateria.json"
        ruta.write_text(json.dumps(bateria))
        return str(ruta)

    def test_filtrar_por_bloque(self, bateria_temp: str) -> None:
        import scripts.puente.pruebas_malla as pm
        original_ruta = pm.BATERIA_JSON
        pm.BATERIA_JSON = Path(bateria_temp)
        try:
            bateria = json.loads(Path(bateria_temp).read_text())
            resultado = filtrar_bateria(bateria, bloque="B4-MT")
            assert len(resultado) == 1
            assert resultado[0]["id"] == "B4-MT-A1"
        finally:
            pm.BATERIA_JSON = original_ruta

    def test_filtrar_por_ronda(self, bateria_temp: str) -> None:
        import scripts.puente.pruebas_malla as pm
        pm.BATERIA_JSON = Path(bateria_temp)
        try:
            bateria = json.loads(Path(bateria_temp).read_text())
            resultado = filtrar_bateria(bateria, ronda=1)
            assert len(resultado) == 2
        finally:
            pm.BATERIA_JSON = Path(bateria_temp).parent / "bateria-1118.json"


class TestLineaRegistro:
    """Tests para líneas de registro.jsonl."""

    def test_linea_inicio(self) -> None:
        inicio_iso = "2026-11-18T10:00:00Z"
        linea = linea_registro_inicio("B4-MT-A1", inicio_iso)
        obj = json.loads(linea)
        assert obj["tipo"] == "inicio"
        assert obj["id"] == "B4-MT-A1"
        assert obj["inicio"] == inicio_iso

    def test_linea_fin(self) -> None:
        linea = linea_registro_fin("B4-MT-A1", "ok", "Prueba completada")
        obj = json.loads(linea)
        assert obj["tipo"] == "fin"
        assert obj["id"] == "B4-MT-A1"
        assert obj["resultado"] == "ok"
        assert obj["nota"] == "Prueba completada"

    def test_linea_fin_sin_nota(self) -> None:
        linea = linea_registro_fin("B4-MT-A1", "fallo")
        obj = json.loads(linea)
        assert obj["tipo"] == "fin"
        assert obj["id"] == "B4-MT-A1"
        assert obj["resultado"] == "fallo"
        assert "nota" not in obj