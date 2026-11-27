# -*- coding: utf-8 -*-
"""Pruebas del calentamiento de Laya (LAY1127C), SIN red: gobernador, marca, transporte,
reloj y lanzador siempre inyectados. Laya se descarga tras 10 min sin uso; cuando la llamada
se pasa de plazo se lanza una petición mínima en un hilo daemon (no bloquea) y la siguiente
tarea la encuentra caliente.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import habilidades_enjambre as H


@pytest.mark.parametrize("gobernador, esperado", [
    ({}, True),
    ({"presion": 1, "ram_libre_mb": 2000}, True),
    ({"presion": 2}, False),
    ({"presion": 3, "ram_libre_mb": 4000}, False),
    ({"ram_libre_mb": 1499}, False),
    ({"ram_libre_mb": 1500}, True),
    ({"ram_libre_mb": None, "presion": None}, True),
])
def test_puede_calentar_respeta_la_puerta_del_gobernador(gobernador, esperado):
    assert H.puede_calentar(gobernador, None, ahora=1000.0) is esperado


def test_ventana_y_raiz_descargada():
    assert H.puede_calentar({}, {"t": 1000.0}, ahora=1599.0) is False
    assert H.puede_calentar({}, {"t": 1000.0}, ahora=1600.0) is True
    assert H.raiz_descargada('{"cargado": false}') is True
    assert H.raiz_descargada('{"cargado": true}') is False
    assert H.raiz_descargada("no es json") is False


def test_no_lanza_con_presion_ni_ram_baja_ni_dentro_de_la_ventana(tmp_path):
    lanzados, ruta = [], tmp_path / "marca.json"
    for gobernador in ({"presion": 2}, {"ram_libre_mb": 1499}):
        assert H.calentar_si_toca(gobernador=gobernador, marca={}, reloj=lambda: 5000.0,
                                  ruta_marca=str(ruta), lanzador=lanzados.append) is False
    assert H.calentar_si_toca(gobernador={}, marca={"t": 1000.0}, reloj=lambda: 1300.0,
                              ruta_marca=str(ruta), lanzador=lanzados.append) is False
    assert lanzados == [] and not ruta.exists()


def test_lanza_la_peticion_minima_y_deja_la_marca(tmp_path):
    llamadas, trabajo, ruta = [], [], tmp_path / "laya-calentar.json"

    def transporte(url, cuerpo, plazo):
        llamadas.append((url, json.loads(cuerpo.decode("utf-8")), plazo))
        return 200, "{}"

    assert H.calentar_si_toca(gobernador={}, marca={}, reloj=lambda: 2000.0,
                              transporte=transporte, ruta_marca=str(ruta),
                              lanzador=trabajo.append) is True
    assert json.loads(ruta.read_text(encoding="utf-8")) == {"t": 2000.0}
    trabajo[0]()
    url, cuerpo, plazo = llamadas[0]
    assert url == H.URL_LAYA and cuerpo["state"] and "questions" in cuerpo
    assert plazo == H.PLAZO_CALENTAR_S


def test_elegir_calienta_cuando_la_llamada_se_pasa_de_plazo():
    reloj, calentados = {"t": 0.0}, []

    def transporte_lento(_url, _cuerpo, _plazo):
        reloj["t"] += H.PLAZO_LAYA_S + 1
        return 200, "{}"

    assert H.elegir_con_laya({"id": "x"}, transporte=transporte_lento,
                             reloj=lambda: reloj["t"],
                             calentador=calentados.append) is None
    assert calentados == [H.URL_LAYA]


def test_elegir_calienta_solo_con_la_raiz_descargada_o_el_plazo():
    calentados = []
    assert H.elegir_con_laya({}, transporte=lambda *_: (200, '{"cargado": false}'),
                             reloj=lambda: 0.0, calentador=calentados.append) is None
    assert calentados == [H.URL_LAYA]

    calentados.clear()

    def caido(*_args):
        raise ConnectionError("refused")

    assert H.elegir_con_laya({}, transporte=caido, reloj=lambda: 0.0,
                             calentador=calentados.append) is None
    assert calentados == []
