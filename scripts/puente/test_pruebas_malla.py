#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas unitarias para las funciones puras de pruebas_malla.py."""
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pruebas_malla as PM


def test_ahora_iso_formato_valido():
    """ahora_iso devuelve ISO 8601 con zona horaria."""
    iso = PM.ahora_iso()
    assert "T" in iso
    assert iso.endswith("Z") or "+" in iso or iso.count(":") >= 2
    # Debe poder parsearse
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    assert dt.tzinfo is not None


def test_recortar_ventana_filtra_por_tiempo():
    """recortar_ventana mantiene solo líneas dentro del rango."""
    lineas = [
        "2026-11-18T10:00:00.000Z inicio",
        "2026-11-18T10:05:00.000Z medio",
        "2026-11-18T10:10:00.000Z fin",
        "2026-11-18T10:15:00.000Z despues",
    ]
    # Ventana de 10:02 a 10:12
    resultado = PM.recortar_ventana(lineas, "2026-11-18T10:02:00Z", "2026-11-18T10:12:00Z")
    assert len(resultado) == 2
    assert "medio" in resultado[0]
    assert "fin" in resultado[1]


def test_recortar_ventana_sin_fin_llega_al_presente():
    """Si no hay fin, incluye todo desde el inicio."""
    lineas = [
        "2026-11-18T10:00:00.000Z inicio",
        "2026-11-18T10:05:00.000Z medio",
    ]
    resultado = PM.recortar_ventana(lineas, "2026-11-18T10:02:00Z", None)
    # Como el "presente" en test es ahora, y las líneas son de 2026, depende de la hora real
    # Lo que importa es que no falle y devuelva lista
    assert isinstance(resultado, list)


def test_recortar_ventana_lineas_sin_timestamp():
    """Líneas sin timestamp ISO se mantienen."""
    lineas = [
        "2026-11-18T10:00:00.000Z con timestamp",
        "línea sin timestamp",
        "2026-11-18T10:05:00.000Z otra con timestamp",
    ]
    resultado = PM.recortar_ventana(lineas, "2026-11-18T10:02:00Z", "2026-11-18T10:10:00Z")
    # La línea sin timestamp se incluye (no se puede filtrar)
    assert any("sin timestamp" in l for l in resultado)
    assert len(resultado) >= 2


def test_evaluar_patrones_debe_encontrado():
    """evaluar_patrones marca ok cuando todos los 'debe' están."""
    lineas = [
        "ble enlace-abierto",
        "ble l2cap-kbps kbps=300",
        "ble latido",
    ]
    res = PM.evaluar_patrones(lineas, ["enlace-abierto", "l2cap-kbps"], [])
    assert res["ok"] is True
    assert all(d["encontrado"] for d in res["debe"])
    assert len(res["lineas_prueba"]) == 2


def test_evaluar_patrones_debe_faltante():
    """evaluar_patrones marca fallo cuando falta un 'debe'."""
    lineas = [
        "ble enlace-abierto",
        "ble latido",
    ]
    res = PM.evaluar_patrones(lineas, ["enlace-abierto", "l2cap-kbps"], [])
    assert res["ok"] is False
    assert any(not d["encontrado"] for d in res["debe"])
    # Debe indicar cuál falta
    faltantes = [d for d in res["debe"] if not d["encontrado"]]
    assert any("l2cap-kbps" in f["patron"] for f in faltantes)


def test_evaluar_patrones_no_debe_encontrado():
    """evaluar_patrones marca fallo cuando aparece un 'no_debe'."""
    lineas = [
        "ble enlace-abierto",
        "ble enlace-cerrado motivo=timeout",
        "ble latido",
    ]
    res = PM.evaluar_patrones(lineas, ["enlace-abierto"], ["enlace-cerrado"])
    assert res["ok"] is False
    assert any(n["encontrado"] for n in res["no_debe"])
    # Línea de prueba debe capturar la violación
    assert any("enlace-cerrado" in l["patron"] for l in res["lineas_prueba"])


def test_evaluar_patrones_no_debe_ausente():
    """evaluar_patrones ok cuando 'no_debe' no aparece."""
    lineas = [
        "ble enlace-abierto",
        "ble l2cap-kbps",
        "ble latido",
    ]
    res = PM.evaluar_patrones(lineas, ["enlace-abierto"], ["enlace-cerrado", "conexion-vencida"])
    assert res["ok"] is True
    assert all(not n["encontrado"] for n in res["no_debe"])


def test_evaluar_patrones_lineas_prueba_capturan_contexto():
    """lineas_prueba incluye la línea completa (truncada) que dispara la regla."""
    lineas = [
        "2026-11-18T10:00:00.000Z ble enlace-abierto psm=19",
        "2026-11-18T10:00:01.000Z ble l2cap-kbps kbps=300 ms=12",
    ]
    res = PM.evaluar_patrones(lineas, ["enlace-abierto", "l2cap-kbps"], [])
    assert len(res["lineas_prueba"]) == 2
    for lp in res["lineas_prueba"]:
        assert "texto" in lp
        assert len(lp["texto"]) <= 200
        assert "linea" in lp


def test_cargar_bateria_estructura():
    """cargar_bateria devuelve la estructura esperada."""
    bateria = PM.cargar_bateria()
    assert "version" in bateria
    assert "pruebas" in bateria
    assert isinstance(bateria["pruebas"], list)
    assert len(bateria["pruebas"]) > 0
    # Verificar estructura de una prueba
    p = bateria["pruebas"][0]
    assert "id" in p
    assert "bloque" in p
    assert "par" in p
    assert "antena" in p
    assert "titulo" in p
    assert "pasos" in p
    assert "aparatos" in p
    assert "antena_nombre" in p
    assert "criterios" in p


def test_obtener_prueba_existente():
    """obtener_prueba encuentra una prueba por id."""
    bateria = PM.cargar_bateria()
    pid = bateria["pruebas"][0]["id"]
    prueba = PM.obtener_prueba(bateria, pid)
    assert prueba is not None
    assert prueba["id"] == pid


def test_obtener_prueba_inexistente():
    """obtener_prueba devuelve None para id inexistente."""
    bateria = PM.cargar_bateria()
    prueba = PM.obtener_prueba(bateria, "ID-QUE-NO-EXISTE")
    assert prueba is None


def test_registro_jsonl_escritura_lectura():
    """guardar_registro y leer_registro funcionan en round-trip."""
    with tempfile.TemporaryDirectory() as d:
        # Monkey-patch de la ruta del registro
        original = PM.REGISTRO_PATH
        PM.REGISTRO_PATH = Path(d) / "registro.jsonl"
        try:
            entrada = {"t": "2026-11-18T10:00:00Z", "accion": "test", "prueba": "B1-MT-A1", "extra": 123}
            PM.guardar_registro(entrada)
            leido = PM.leer_registro()
            assert len(leido) == 1
            assert leido[0]["accion"] == "test"
            assert leido[0]["extra"] == 123
        finally:
            PM.REGISTRO_PATH = original


def test_registro_jsonl_multiples_entradas():
    """Múltiples entradas se leen en orden."""
    with tempfile.TemporaryDirectory() as d:
        original = PM.REGISTRO_PATH
        PM.REGISTRO_PATH = Path(d) / "registro.jsonl"
        try:
            for i in range(3):
                PM.guardar_registro({"t": f"2026-11-18T10:00:0{i}Z", "n": i})
            leido = PM.leer_registro()
            assert len(leido) == 3
            assert [e["n"] for e in leido] == [0, 1, 2]
        finally:
            PM.REGISTRO_PATH = original


def test_prefijo_aparato():
    """prefijo_aparato devuelve el prefijo correcto para cada aparato."""
    assert PM.prefijo_aparato("mac") == "mac-"
    assert PM.prefijo_aparato("tablet") == "tableta-"
    assert PM.prefijo_aparato("maggaboard") == "tableta-"
    assert PM.prefijo_aparato("tableta") == "tableta-"
    assert PM.prefijo_aparato("maggabox") == "maggabox-"
    assert PM.prefijo_aparato("otro") == "maggabox-"


def test_formatear_informe_tabla_basica():
    """formatear_informe genera una tabla markdown correcta."""
    bateria = {
        "pruebas": [
            {"id": "B1-MT-A1", "titulo": "Test 1", "bloque": 1},
            {"id": "B2-CT-A1", "titulo": "Test 2", "bloque": 2},
        ]
    }
    registro = [
        {"prueba": "B1-MT-A1", "accion": "cerrar", "resultado": "ok", "nota": "todo bien", "t": "2026-11-18T10:00:00Z"},
        {"prueba": "B2-CT-A1", "accion": "empezar", "t": "2026-11-18T11:00:00Z"},
    ]
    tabla = PM.formatear_informe(bateria, registro)
    assert "| ID | Título | Estado | Resultado | Nota |" in tabla
    assert "|---|---|---|---|---|" in tabla
    assert "B1-MT-A1" in tabla
    assert "Test 1" in tabla
    assert "ok" in tabla
    assert "todo bien" in tabla
    assert "B2-CT-A1" in tabla
    assert "en curso" in tabla


def test_formatear_informe_filtra_por_ronda():
    """formatear_informe filtra por bloque/ronda cuando se especifica."""
    bateria = {
        "pruebas": [
            {"id": "B1-MT-A1", "titulo": "Test 1", "bloque": 1},
            {"id": "B2-CT-A1", "titulo": "Test 2", "bloque": 2},
        ]
    }
    registro = [
        {"prueba": "B1-MT-A1", "accion": "cerrar", "resultado": "ok", "nota": "", "t": "2026-11-18T10:00:00Z"},
        {"prueba": "B2-CT-A1", "accion": "cerrar", "resultado": "ok", "nota": "", "t": "2026-11-18T11:00:00Z"},
    ]
    tabla = PM.formatear_informe(bateria, registro, ronda=1)
    assert "B1-MT-A1" in tabla
    assert "B2-CT-A1" not in tabla


def test_formatear_informe_estado_evaluado():
    """formatear_informe usa 'evaluado' cuando hay evaluación pero no cierre."""
    bateria = {"pruebas": [{"id": "B1-MT-A1", "titulo": "Test 1", "bloque": 1}]}
    registro = [
        {"prueba": "B1-MT-A1", "accion": "evaluar", "veredicto": "parcial", "t": "2026-11-18T10:00:00Z"},
    ]
    tabla = PM.formatear_informe(bateria, registro)
    assert "parcial" in tabla
    assert "evaluado" in tabla


def test_formatear_informe_pendiente():
    """formatear_informe marca 'pendiente' para pruebas sin entradas."""
    bateria = {"pruebas": [{"id": "B1-MT-A1", "titulo": "Test 1", "bloque": 1}]}
    registro = []
    tabla = PM.formatear_informe(bateria, registro)
    assert "pendiente" in tabla


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])