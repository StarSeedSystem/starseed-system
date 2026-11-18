#!/usr/bin/env python3
"""
test_pruebas_malla — Pruebas unitarias de las funciones puras de pruebas_malla.py
"""

from __future__ import annotations

import pytest

from pruebas_malla import (
    recortar_ventana,
    evaluar_patrones,
    Prueba,
    RegistroPrueba,
)


def test_recortar_ventana_basico():
    lineas = [
        "2026-11-18T10:00:00.000Z · ligado · b3 · neurona abc",
        "2026-11-18T10:00:05.000Z · llamada · neurona abc · senal-enviada",
        "2026-11-18T10:00:10.000Z · ligado · b3 · neurona def",
        "2026-11-18T10:00:15.000Z · archivo · id1 · anuncio-enviado",
    ]
    desde = "2026-11-18T10:00:03.000Z"
    hasta = "2026-11-18T10:00:12.000Z"
    res = recortar_ventana(lineas, desde, hasta)
    assert len(res) == 2
    assert "senal-enviada" in res[0]
    assert "neurona def" in res[1]


def test_recortar_ventana_sin_hasta():
    lineas = [
        "2026-11-18T10:00:00.000Z · a",
        "2026-11-18T10:00:05.000Z · b",
        "2026-11-18T10:00:10.000Z · c",
    ]
    desde = "2026-11-18T10:00:03.000Z"
    res = recortar_ventana(lineas, desde)
    assert len(res) == 2
    assert "b" in res[0]
    assert "c" in res[1]


def test_recortar_ventana_lineas_sin_timestamp():
    lineas = [
        "2026-11-18T10:00:00.000Z · a",
        "línea sin timestamp",
        "2026-11-18T10:00:10.000Z · b",
    ]
    desde = "2026-11-18T10:00:05.000Z"
    res = recortar_ventana(lineas, desde)
    assert len(res) == 2
    assert "línea sin timestamp" in res[0]
    assert "b" in res[1]


def test_recortar_ventana_orden_igual():
    lineas = [
        "2026-11-18T10:00:00.000Z · a",
        "2026-11-18T10:00:00.000Z · b",
    ]
    desde = "2026-11-18T10:00:00.000Z"
    res = recortar_ventana(lineas, desde)
    assert len(res) == 2


def test_evaluar_patrones_todos_encontrados():
    lineas = [
        "2026-11-18T10:00:00.000Z · ligado · b3",
        "2026-11-18T10:00:05.000Z · reconectado · b3",
    ]
    enc, fal, pro = evaluar_patrones(lineas, ["ligado", "reconectado"], ["caida"])
    assert enc == ["ligado", "reconectado"]
    assert fal == []
    assert pro == []


def test_evaluar_patrones_faltantes():
    lineas = ["2026-11-18T10:00:00.000Z · ligado · b3"]
    enc, fal, pro = evaluar_patrones(lineas, ["ligado", "reconectado"], [])
    assert enc == ["ligado"]
    assert fal == ["reconectado"]
    assert pro == []


def test_evaluar_patrones_prohibidos():
    lineas = [
        "2026-11-18T10:00:00.000Z · ligado · b3",
        "2026-11-18T10:00:05.000Z · caida · b3",
    ]
    enc, fal, pro = evaluar_patrones(lineas, ["ligado"], ["caida"])
    assert enc == ["ligado"]
    assert fal == []
    assert pro == ["caida"]


def test_evaluar_patrones_varios_prohibidos():
    lineas = [
        "2026-11-18T10:00:00.000Z · ligado · b3",
        "2026-11-18T10:00:05.000Z · caida · b3",
        "2026-11-18T10:00:10.000Z · perdido · b3",
    ]
    enc, fal, pro = evaluar_patrones(lineas, ["ligado"], ["caida", "perdido"])
    assert pro == ["caida", "perdido"]


def test_evaluar_patrones_case_sensitive():
    lineas = ["2026-11-18T10:00:00.000Z · LIGADO · b3"]
    enc, fal, _ = evaluar_patrones(lineas, ["ligado"], [])
    assert fal == ["ligado"]


def test_registro_prueba_serializacion():
    reg = RegistroPrueba(
        id="B4-MT-A1",
        inicio="2026-11-18T10:00:00Z",
        fin="2026-11-18T10:30:00Z",
        resultado="ok",
        nota="Todo bien",
        evidencias={"mac": "/tmp/mac.log"},
    )
    import json
    data = json.loads(json.dumps(reg.__dict__))
    assert data["id"] == "B4-MT-A1"
    assert data["resultado"] == "ok"


def test_prueba_dataclass():
    p = Prueba(
        id="B4-MT-A1",
        bloque="B4",
        par="MT",
        antena="A1",
        titulo="Test",
        pasos=["paso 1"],
        aparatos=["Mac", "tableta"],
        antena_id="bluetooth",
        criterios={
            "Mac": {"debe": ["ligado"], "no_debe": ["caida"]},
            "tableta": {"debe": ["ligado"], "no_debe": ["caida"]},
        },
    )
    assert p.id == "B4-MT-A1"
    assert len(p.aparatos) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])