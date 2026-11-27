#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAP1127E · Pruebas del registro único (pytest, sin red)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import registro_pruebas_logica as R  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
TABLA = RAIZ / "config" / "pruebas-equivalencias.json"


def test_manual_se_lee_como_fin():
    linea = json.dumps({
        "fecha": "2026-11-18T10:00:00Z",
        "version": "0.5.1",
        "ronda": 4,
        "prueba": "B4-MAC-A-TABLETA",
        "resultado": "ok",
        "nota": "sin cortes",
    })
    assert R.normalizar(linea) == {
        "tipo": "fin",
        "id": "B4-MAC-A-TABLETA",
        "version": "0.5.1",
        "resultado": "ok",
        "nota": "sin cortes",
        "t": "2026-11-18T10:00:00Z",
        "ronda": 4,
    }


def test_conductor_tal_cual():
    original = {"tipo": "inicio", "id": "B1-MT-A1", "version": "0.5.1", "t": "2026-11-18T10:00:00Z"}
    assert R.normalizar(json.dumps(original)) == original


def test_lineas_rotas_se_saltan(tmp_path):
    ruta = tmp_path / "registro.jsonl"
    ruta.write_text(
        "no es json\n"
        '{"tipo":"fin","id":"B1-MT-A1","resultado":"ok"}\n'
        '{"prueba": }\n'
        "\n",
        encoding="utf-8",
    )
    leidas = R.leer_registro(ruta)
    assert len(leidas) == 1 and leidas[0]["id"] == "B1-MT-A1"
    assert R.normalizar("{roto") is None
    assert R.normalizar("[1, 2]") is None


def test_leer_registro_sin_archivo(tmp_path):
    assert R.leer_registro(tmp_path / "no-existe.jsonl") == []


def test_ventana_del_espejo():
    texto = (
        "2026-11-18T09:59:59Z (mac) 2026-11-18T09:59:58Z web ligado\n"
        "2026-11-18T10:00:00Z web (tableta) 2026-11-18T09:59:59Z web ligado\n"
        "2026-11-18T10:05:00Z (tableta) 2026-11-18T10:04:59Z web ligado\n"
        "2026-11-18T10:05:01Z web (tableta) 2026-11-18T10:05:00Z web ligado\n"
        "sin hora al principio\n"
    )
    dentro = R.lineas_espejo(texto, "2026-11-18T10:00:00Z", "2026-11-18T10:05:00Z")
    assert len(dentro) == 2
    assert dentro[0].startswith("2026-11-18T10:00:00Z")
    assert dentro[1].startswith("2026-11-18T10:05:00Z")
    assert R.lineas_espejo(texto, None, None) == texto.splitlines()[:4]


def test_censo_con_guion_y_ultimo_gana():
    texto = (
        "2026-11-18T10:00:00Z web censo neurona=mac rol=director plataforma=macos "
        "app=0.5.1 capa=- mem=1024 disco=12.5 ia=-\n"
        "censo neurona=mac rol=- plataforma=macos app=0.5.2 capa=b123 mem=- disco=- ia=bitnet,needle\n"
        "censo neurona=tab rol=aparato-de-prueba plataforma=android app=0.5.2 capa=b123 "
        "mem=512 disco=3 ia=-\n"
    )
    censo = R.ultimo_censo(texto)
    assert censo["mac"]["app"] == "0.5.2"
    assert censo["mac"]["capa"] == "b123"
    assert censo["mac"]["rol"] is None
    assert censo["mac"]["mem"] is None
    assert censo["mac"]["ia"] == "bitnet,needle"
    assert censo["tab"]["ia"] is None
    assert "neurona" not in censo["mac"]


def test_equivalencias_ida_y_vuelta():
    datos = json.loads(TABLA.read_text(encoding="utf-8"))
    assert datos["equivalencias"]
    for alias, canonico in datos["equivalencias"].items():
        assert R.id_canonico(alias, datos) == canonico
        assert R.id_canonico(canonico, datos) == canonico
    assert R.id_canonico("B4-MAC-A-TABLETA", TABLA) == "B4-MT-A1"
    assert R.id_canonico("PIN-BLE-MAC", TABLA) == "B1-MT-A1"
    assert R.id_canonico("B4-MT-A1", datos["equivalencias"]) == "B4-MT-A1"


def test_comprobaciones_numero_a_canonico():
    for texto in ("prueba 36", "prueba36", "prueba.36", "0.5.1-prueba.36", "36"):
        assert R.id_canonico(texto, TABLA) == "PRB-36"
    assert R.id_canonico("PRB-36", TABLA) == "PRB-36"


def test_id_desconocido_es_none():
    assert R.id_canonico("NO-EXISTE-9", TABLA) is None
    assert R.id_canonico("", TABLA) is None
    assert R.id_canonico("B4-MT-A1", "/tmp/tabla-que-no-existe.json") is None
