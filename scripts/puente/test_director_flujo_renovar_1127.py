#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de las renovaciones que el director ejecuta solo (CAP1127B).

Lo que «Buscar capacidad» marca como «te necesita · ejecutar» lo hacen los
directores: solo la lista blanca exacta, una vez por hora y sin shell. El
`correr` va simulado y todo el disco vive en tmp_path.
"""
import json
import os
import subprocess
import sys
from types import SimpleNamespace

import pytest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import director_flujo as DF

EXPLABS = ["python3", "scripts/puente/explabs_promos.py", "actualizar"]
PASARELAS = ["python3", "scripts/puente/renovador-pasarelas.py"]


class Corredor:
    def __init__(self, codigo=0, salida="ok", error=None):
        self.llamadas = []
        self.codigo = codigo
        self.salida = salida
        self.error = error

    def __call__(self, cmd, segundos=30, **kwargs):
        self.llamadas.append((list(cmd), segundos, kwargs))
        if self.error is not None:
            raise self.error
        return SimpleNamespace(returncode=self.codigo, stdout=self.salida, stderr="")


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    buscar = tmp_path / "buscar-capacidad.json"
    monkeypatch.setattr(DF, "BUSCAR_CAPACIDAD", str(buscar))
    monkeypatch.setattr(DF, "RENOVACIONES_ESTADO",
                        str(tmp_path / "renovaciones-directores.json"))
    monkeypatch.setattr(DF, "RENOVACIONES_LOG",
                        str(tmp_path / "renovaciones-directores.log"))

    def escribir(lineas):
        buscar.write_text(json.dumps({"lineas": lineas}), encoding="utf-8")

    return escribir, tmp_path


def test_lista_blanca_se_ejecuta_como_argv_sin_shell(entorno):
    escribir, _ = entorno
    escribir(["Experiential Labs: te necesita · ejecutar: " + " ".join(EXPLABS)])
    corredor = Corredor()
    res = DF.aplicar_renovaciones(1000.0, corredor)
    assert [c for c, _s, _k in corredor.llamadas] == [EXPLABS]
    cmd, _segundos, kwargs = corredor.llamadas[0]
    assert isinstance(cmd, list)
    assert "shell" not in kwargs
    assert corredor.llamadas[0][1] == 300
    assert res["ejecutadas"][0]["comando"] == " ".join(EXPLABS)


def test_texto_libre_y_metacaracteres_se_ignoran(entorno):
    escribir, _ = entorno
    escribir([
        "Oracle: te necesita · ejecutar: rm -rf /",
        "x · ejecutar: python3 scripts/puente/renovador-pasarelas.py; rm -rf /",
    ])
    corredor = Corredor()
    res = DF.aplicar_renovaciones(1000.0, corredor)
    assert corredor.llamadas == []
    assert len(res["ignoradas"]) == 2


def test_una_vez_por_hora_y_luego_vuelve(entorno):
    escribir, _ = entorno
    escribir(["a · ejecutar: " + " ".join(EXPLABS)])
    corredor = Corredor()
    DF.aplicar_renovaciones(1000.0, corredor)
    res = DF.aplicar_renovaciones(1000.0 + 3599, corredor)
    assert len(corredor.llamadas) == 1
    assert res["omitidas"] == [" ".join(EXPLABS)]
    DF.aplicar_renovaciones(1000.0 + 3600, corredor)
    assert len(corredor.llamadas) == 2


def test_resultado_queda_marcado_y_en_una_linea(entorno):
    escribir, tmp_path = entorno
    escribir(["a · ejecutar: " + " ".join(EXPLABS)])
    DF.aplicar_renovaciones(1000.0, Corredor(salida="renové 3"))
    estado = json.loads((tmp_path / "renovaciones-directores.json").read_text(encoding="utf-8"))
    assert estado[" ".join(EXPLABS)]["codigo"] == 0
    log = (tmp_path / "renovaciones-directores.log").read_text(encoding="utf-8")
    assert "código=0" in log and "renové 3" in log


def test_timeout_no_tumba_el_turno(entorno):
    escribir, _ = entorno
    escribir(["a · ejecutar: " + " ".join(PASARELAS)])
    corredor = Corredor(error=subprocess.TimeoutExpired("x", 300))
    res = DF.aplicar_renovaciones(1000.0, corredor)
    assert corredor.llamadas[0][0] == PASARELAS
    assert res["ejecutadas"][0]["codigo"] is None
    assert "TimeoutExpired" in res["ejecutadas"][0]["salida"]


def test_sin_linea_ejecutar_no_hace_nada(entorno):
    escribir, _ = entorno
    escribir(["Mac: trabajando · 2 agentes"])
    corredor = Corredor()
    assert DF.aplicar_renovaciones(1000.0, corredor) == {
        "ejecutadas": [], "omitidas": [], "ignoradas": []}
    assert corredor.llamadas == []
