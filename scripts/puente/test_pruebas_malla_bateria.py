#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests de validación del esquema de bateria-1118.json contra pruebas_malla.py."""

import json
from pathlib import Path

import pytest

from pruebas_malla import (
    cargar_bateria,
    filtrar_bateria,
    evaluar_patrones,
    BATERIA_JSON,
)


class TestBateriaSchema:
    """Valida que bateria-1118.json cumple el esquema esperado por pruebas_malla.py."""

    def test_archivo_existe(self):
        assert BATERIA_JSON.exists(), f"No existe {BATERIA_JSON}"

    def test_estructura_raiz(self):
        bateria = cargar_bateria()
        assert "version" in bateria
        assert "descripcion" in bateria
        assert "pruebas" in bateria
        assert isinstance(bateria["pruebas"], list)
        assert len(bateria["pruebas"]) > 0

    def test_cada_prueba_tiene_campos_obligatorios(self):
        bateria = cargar_bateria()
        campos_obligatorios = {"id", "titulo", "aparatos", "antena", "ronda", "pasos", "criterios"}
        for p in bateria["pruebas"]:
            assert campos_obligatorios.issubset(p.keys()), f"Faltan campos en {p.get('id', '?')}"
            assert isinstance(p["aparatos"], list) and len(p["aparatos"]) > 0
            assert isinstance(p["pasos"], list) and len(p["pasos"]) > 0
            assert isinstance(p["criterios"], dict) and len(p["criterios"]) > 0
            assert p["ronda"] >= 1
            assert p["antena"] in ("ble", "wifi", "malla")
            for ap in p["aparatos"]:
                assert ap in ("mac", "maggabox", "tableta")

    def test_criterios_tienen_debe_y_no_debe(self):
        bateria = cargar_bateria()
        for p in bateria["pruebas"]:
            for aparato, crit in p["criterios"].items():
                assert aparato in ("mac", "maggabox", "tableta")
                assert "debe" in crit and isinstance(crit["debe"], list)
                assert "no_debe" in crit and isinstance(crit["no_debe"], list)
                for pat in crit["debe"] + crit["no_debe"]:
                    assert isinstance(pat, str) and len(pat) > 0

    def test_bloques_b1_a_b5_presentes(self):
        bateria = cargar_bateria()
        ids = {p["id"] for p in bateria["pruebas"]}
        bloques = {pid.split("-")[0] for pid in ids}
        assert bloques == {"B1", "B2", "B3", "B4", "B5"}

    def test_filtrar_por_bloque(self):
        bateria = cargar_bateria()
        b4 = filtrar_bateria(bateria, bloque="B4")
        assert all(p["id"].startswith("B4-") for p in b4)
        assert len(b4) == 2

    def test_filtrar_por_ronda(self):
        bateria = cargar_bateria()
        r2 = filtrar_bateria(bateria, ronda=2)
        assert all(p["ronda"] == 2 for p in r2)
        assert len(r2) == 2

    def test_evaluar_patrones_funciona(self):
        lineas = [
            "2024-01-01T12:00:00Z Conectado a WiFi",
            "2024-01-01T12:00:01Z mDNS resuelto starseed-nodo-1.local",
            "2024-01-01T12:00:02Z Socket TCP abierto en 8080",
        ]
        criterios = {
            "debe": ["Conectado a WiFi", "mDNS resuelto"],
            "no_debe": ["Error de conexión"],
        }
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is True
        assert res["debe_cumplidos"] == 2
        assert res["debe_faltantes"] == []
        assert res["no_debe_cumplidos"] == 1

    def test_evaluar_patrones_detecta_faltantes(self):
        lineas = ["2024-01-01T12:00:00Z Conectado a WiFi"]
        criterios = {"debe": ["Conectado a WiFi", "mDNS resuelto"], "no_debe": []}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert "mDNS resuelto" in res["debe_faltantes"]

    def test_evaluar_patrones_detecta_violaciones(self):
        lineas = ["2024-01-01T12:00:00Z Error de conexión"]
        criterios = {"debe": [], "no_debe": ["Error de conexión"]}
        res = evaluar_patrones(lineas, criterios)
        assert res["ok"] is False
        assert "Error de conexión" in res["no_debe_violados"]

    def test_sin_credenciales_reales(self):
        bateria = cargar_bateria()
        texto = json.dumps(bateria, ensure_ascii=False)
        assert "starseed-nodo-1.local" in texto
        assert "192.168." not in texto
        assert "10.0." not in texto
        assert "password" not in texto.lower()
        assert "secret" not in texto.lower()
        assert "token" not in texto.lower()