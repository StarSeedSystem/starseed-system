#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1124A · La batería de la malla que faltaba y su generador.

Cubre las costuras nuevas: construcción determinista de los bloques B1–B10 con
sus pares, antenas, rondas y criterios; escritura/lectura del JSON; y el aviso
de una sola línea cuando el archivo no existe, sin traza ni excepción.
"""
import json
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402


def _bateria():
    return PM.construir_bateria()


class TestConstruirBateria:
    def test_tiene_los_diez_bloques(self):
        bateria = _bateria()
        assert [b["id"] for b in bateria["bloques"]] == [f"B{n}" for n in range(1, 11)]

    def test_cada_prueba_tiene_id_unico_y_campos_completos(self):
        pruebas = _bateria()["pruebas"]
        ids = [p["id"] for p in pruebas]
        assert len(ids) == len(set(ids))
        for p in pruebas:
            assert p["bloque"] in {f"B{n}" for n in range(1, 11)}
            assert p["ronda"] >= 1
            assert p["antena"] in {"ble", "wifi", "malla"}
            assert set(p["aparatos"]) == set(p["par"])
            assert p["pasos"]

    def test_cada_bloque_cubre_pares_antenas_y_rondas(self):
        for bloque in _bateria()["bloques"]:
            pruebas = [p for p in _bateria()["pruebas"] if p["bloque"] == bloque["id"]]
            assert {tuple(p["par"]) for p in pruebas}
            assert {p["antena"] for p in pruebas} >= set(bloque["antenas"])
            assert {p["ronda"] for p in pruebas} >= set(bloque["rondas"])

    def test_cada_aparato_lleva_debe_y_no_debe(self):
        for p in _bateria()["pruebas"]:
            assert set(p["criterios"]) == set(p["aparatos"])
            for criterios in p["criterios"].values():
                assert criterios["debe"] and criterios["no_debe"]

    def test_los_patrones_compilan(self):
        for p in _bateria()["pruebas"]:
            for criterios in p["criterios"].values():
                for patron in criterios["debe"] + criterios["no_debe"]:
                    re.compile(patron)

    def test_no_baja_frenos_de_seguridad(self):
        por_bloque = {p["bloque"]: p for p in _bateria()["pruebas"]}
        b4 = json.dumps(por_bloque["B4"]["criterios"], ensure_ascii=False)
        b5 = json.dumps(por_bloque["B5"]["criterios"], ensure_ascii=False)
        assert "seq" in b4 and "nonce" in b4 and "firma" in b4
        assert "armado-por-orden" in b5 and "autoconced" in b5

    def test_es_determinista(self):
        assert _bateria() == _bateria()


class TestArchivo:
    def test_guardar_y_cargar_da_la_misma_bateria(self, tmp_path):
        ruta = tmp_path / "pruebas" / "bateria-1118.json"
        PM.guardar_bateria(_bateria(), ruta)
        assert ruta.exists()
        assert PM.cargar_bateria(ruta) == _bateria()

    def test_la_falta_se_dice_en_una_linea(self, tmp_path):
        ruta = tmp_path / "no-existe.json"
        mensaje = PM.mensaje_bateria_ausente(ruta)
        assert "\n" not in mensaje
        assert str(ruta) in mensaje
        assert "generar-bateria" in mensaje

    def test_cargar_sin_archivo_no_revienta(self, tmp_path, capsys):
        ruta = tmp_path / "no-existe.json"
        assert PM.cargar_bateria(ruta) is None
        salida = capsys.readouterr().out.strip().splitlines()
        assert len(salida) == 1
        assert "generar-bateria" in salida[0]

    def test_cargar_json_roto_no_revienta(self, tmp_path, capsys):
        ruta = tmp_path / "roto.json"
        ruta.write_text("{no es json", encoding="utf-8")
        assert PM.cargar_bateria(ruta) is None
        assert "JSON" in capsys.readouterr().out


class TestCLI:
    def test_listar_sin_bateria_avisa_y_sale_en_uno(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setattr(PM, "BATERIA_JSON", tmp_path / "falta.json")
        assert PM.main(["listar"]) == 1
        salida = capsys.readouterr().out.strip().splitlines()
        assert len(salida) == 1
        assert "generar-bateria" in salida[0]

    def test_generar_bateria_deja_listar_y_siguiente_en_verde(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setattr(PM, "BATERIA_JSON", tmp_path / "bateria-1118.json")
        monkeypatch.setattr(PM, "REGISTRO_JSONL", tmp_path / "registro.jsonl")
        assert PM.main(["generar-bateria"]) == 0
        assert PM.main(["listar"]) == 0
        assert "B1-" in capsys.readouterr().out
        assert PM.main(["siguiente"]) == 0
        assert capsys.readouterr().out.strip().startswith("B1-")

    def test_siguiente_sin_bateria_avisa_y_sale_en_uno(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setattr(PM, "BATERIA_JSON", tmp_path / "falta.json")
        assert PM.main(["siguiente"]) == 1
        assert "generar-bateria" in capsys.readouterr().out
