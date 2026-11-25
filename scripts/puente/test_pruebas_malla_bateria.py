#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1123A · Esquema de la batería 1118 contra el conductor de la malla.

Valida que `starseed_memory_root/pruebas/bateria-1118.json` tenga la forma que
`pruebas_malla.py` espera: bloques B1..B5, patrones `debe`/`no_debe` compilables
y ningún dato sensible (IPs o credenciales) en pasos ni criterios.
"""
import json
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402

BLOQUES = {"B1", "B2", "B3", "B4", "B5"}
RE_ID = re.compile(r"^(B[1-5])-[A-Z0-9]+-[A-Z0-9]+$")
RE_IP = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
RE_SECRETO = re.compile(
    r"(password|passwd|contraseña|token|secret|api[_-]?key|bearer)",
    re.IGNORECASE,
)


@pytest.fixture(scope="module")
def bateria():
    ruta = PM.BATERIA_JSON
    assert ruta.exists(), f"falta {ruta}"
    with ruta.open("r", encoding="utf-8") as archivo:
        return json.load(archivo)


def _textos(prueba):
    partes = [prueba.get("titulo", ""), prueba.get("antena", "")]
    partes.extend(prueba.get("pasos", []))
    for crit in prueba.get("criterios", {}).values():
        partes.extend(crit.get("debe", []))
        partes.extend(crit.get("no_debe", []))
    return [str(parte) for parte in partes]


def test_carga_la_bateria(bateria):
    assert isinstance(bateria.get("pruebas"), list)
    assert bateria["pruebas"], "la batería no puede estar vacía"


def test_ids_unicos_y_con_bloque_valido(bateria):
    ids = [p["id"] for p in bateria["pruebas"]]
    assert len(ids) == len(set(ids))
    for prueba in bateria["pruebas"]:
        coincidencia = RE_ID.match(prueba["id"])
        assert coincidencia, f"id fuera de patrón: {prueba['id']}"
        assert prueba["bloque"] == coincidencia.group(1), (
            f"bloque no coincide con el id {prueba['id']}"
        )


def test_cubren_los_cinco_bloques(bateria):
    bloques = {p["bloque"] for p in bateria["pruebas"]}
    assert BLOQUES <= bloques


def test_cada_prueba_tiene_lo_que_el_conductor_lee(bateria):
    for prueba in bateria["pruebas"]:
        assert isinstance(prueba["titulo"], str) and prueba["titulo"]
        assert isinstance(prueba["ronda"], int) and prueba["ronda"] >= 1
        assert set(prueba["aparatos"]) <= set(PM.APARATOS)
        assert prueba["aparatos"], f"{prueba['id']} sin aparatos"
        assert prueba["antena"] in PM.ANTenas
        assert isinstance(prueba["pasos"], list) and prueba["pasos"]
        assert all(isinstance(paso, str) and paso for paso in prueba["pasos"])


def test_criterios_son_debe_y_no_debe_compilables(bateria):
    for prueba in bateria["pruebas"]:
        criterios = prueba["criterios"]
        assert criterios, f"{prueba['id']} sin criterios"
        assert set(criterios) <= set(prueba["aparatos"])
        for aparato, crit in criterios.items():
            assert set(crit) <= {"debe", "no_debe"}, (
                f"{prueba['id']}/{aparato} con claves de más"
            )
            assert crit.get("debe"), f"{prueba['id']}/{aparato} sin ningún debe"
            for patron in crit.get("debe", []) + crit.get("no_debe", []):
                re.compile(patron, re.IGNORECASE)


def test_no_hay_ips_ni_credenciales(bateria):
    for prueba in bateria["pruebas"]:
        for texto in _textos(prueba):
            assert not RE_IP.search(texto), f"IP real en {prueba['id']}: {texto}"
            assert not RE_SECRETO.search(texto), (
                f"credencial en {prueba['id']}: {texto}"
            )


def test_listar_y_siguiente_no_fallan(bateria, capsys):
    assert PM.main(["listar"]) == 0
    salida = capsys.readouterr().out
    for prueba in bateria["pruebas"]:
        assert prueba["id"] in salida
    assert PM.cargar_bateria()["pruebas"]
    assert PM.main(["siguiente"]) in (0, 1)
