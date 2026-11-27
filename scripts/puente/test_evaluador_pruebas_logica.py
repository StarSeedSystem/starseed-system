import json
import pathlib

import pytest

import evaluador_pruebas_logica as EV

RAIZ = pathlib.Path(__file__).resolve().parents[2]
U = json.loads((RAIZ / "config" / "umbrales-pruebas.json").read_text(encoding="utf-8"))
EQ = RAIZ / "config" / "pruebas-equivalencias.json"
BUENAS = {"B4-MT-A1": 6, "B2-MT-A1": 1.5, "B1-MT-A1": 4, "B5-MT-A1": 2,
          "B3-MT-A1": {"valor": "abc", "esperado": "abc"}, "PRB-LLAMADA-CONECTA": 12}


def ev(m, nivel="anillo"):
    return EV.evaluar(m, U, nivel, EQ)


def test_verde_anillo_con_6_cuadros():
    r = ev(BUENAS)
    assert r["veredicto"] == "verde"
    assert r["por_prueba"]["B4-MT-A1"]["ok"] is True


def test_rojo_publica_con_6_cuadros():
    r = ev(BUENAS, "publica")
    assert r["veredicto"] == "rojo"
    assert r["por_prueba"]["B4-MT-A1"]["umbral"] == {"min": 15}


def test_verde_publica_con_15():
    assert ev({**BUENAS, "B4-MT-A1": 15}, "publica")["veredicto"] == "verde"


def test_medida_ausente_es_sin_dato_nunca_verde():
    m = dict(BUENAS)
    del m["B1-MT-A1"]
    r = ev(m)
    assert r["veredicto"] == "sin-dato"
    assert r["por_prueba"]["B1-MT-A1"]["ok"] is None


def test_rojo_manda_sobre_sin_dato():
    m = dict(BUENAS, **{"B2-MT-A1": 3})
    del m["B1-MT-A1"]
    assert ev(m)["veredicto"] == "rojo"


def test_hash_distinto_es_rojo():
    r = ev(dict(BUENAS, **{"B3-MT-A1": {"valor": "abc", "esperado": "abd"}}))
    assert r["por_prueba"]["B3-MT-A1"]["ok"] is False


def test_limites_estrictos_enlace_y_reanudacion():
    assert ev(dict(BUENAS, **{"B1-MT-A1": 10}))["por_prueba"]["B1-MT-A1"]["ok"] is False
    assert ev(dict(BUENAS, **{"B5-MT-A1": 5}))["por_prueba"]["B5-MT-A1"]["ok"] is False
    assert ev(dict(BUENAS, **{"B2-MT-A1": 2}))["por_prueba"]["B2-MT-A1"]["ok"] is True


def test_ids_equivalentes_se_reconocen():
    m = {k: v for k, v in BUENAS.items() if k != "B4-MT-A1"}
    m["B4-MAC-A-TABLETA"] = 6
    assert ev(m)["veredicto"] == "verde"


def test_bool_o_nan_no_es_medida():
    assert ev(dict(BUENAS, **{"B4-MT-A1": True}))["veredicto"] == "sin-dato"
    assert ev(dict(BUENAS, **{"B4-MT-A1": float("nan")}))["veredicto"] == "sin-dato"


def test_nivel_desconocido():
    with pytest.raises(ValueError):
        ev(BUENAS, "otro")


def test_regresion_del_20_por_ciento_aunque_pase():
    assert EV.regresiones({"B4-MT-A1": 8}, {"B4-MT-A1": 10}, U, equivalencias=EQ) == ["B4-MT-A1"]
    assert ev({"B4-MT-A1": 8})["por_prueba"]["B4-MT-A1"]["ok"] is True


def test_regresion_en_tiempos_y_ids_equivalentes():
    assert EV.regresiones({"B1-MT-A1": 6}, {"PIN-BLE-MAC": 4}, U, equivalencias=EQ) == ["B1-MT-A1"]


def test_sin_regresion_dentro_de_tolerancia_o_mejora():
    assert EV.regresiones({"B4-MT-A1": 9}, {"B4-MT-A1": 10}, U, equivalencias=EQ) == []
    assert EV.regresiones({"B1-MT-A1": 2}, {"B1-MT-A1": 4}, U, equivalencias=EQ) == []
