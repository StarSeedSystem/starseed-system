"""Pruebas del perfil de IA de un nodo (BAP1127K)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import perfil_ia_nodo as p

GB = 1024


def test_8gb_un_slot():
    r = p.perfil(8 * GB, 3 * GB, 8, "linux", None)
    assert (r["slots_bitnet"], r["ctx_total"], r["ctx_por_slot"]) == (1, 512, 512)


def test_16gb_tres_slots():
    r = p.perfil(16 * GB, 9 * GB, 8, "linux", None)
    assert (r["slots_bitnet"], r["ctx_total"], r["ctx_por_slot"]) == (3, 1536, 512)


def test_32gb_cuatro_slots():
    r = p.perfil(32 * GB, 20 * GB, 16, "linux", None)
    assert (r["slots_bitnet"], r["ctx_total"], r["ctx_por_slot"]) == (4, 4096, 1024)


def test_android_sin_bitnet():
    r = p.perfil(8 * GB, 4 * GB, 8, "android", None)
    assert r["slots_bitnet"] == 0 and "needle" in r["capas_que_caben"]
    assert "android" in r["motivo"].lower()


def test_sin_ram():
    r = p.perfil(16 * GB, 1400, 8, "linux", None)
    assert r["slots_bitnet"] == 0 and r["motivo"] == "sin RAM"
    assert r["ctx_total"] == 0 and r["ctx_por_slot"] == 0


def test_hilos_dedicado_y_direccion():
    assert p.perfil(16 * GB, 9 * GB, 8, "linux", None)["hilos"] == 7
    assert p.perfil(16 * GB, 9 * GB, 8, "darwin", None, direccion=True)["hilos"] == 4
    assert p.perfil(8 * GB, 3 * GB, 1, "linux", None)["hilos"] == 1


def test_laya_con_y_sin_ram():
    con = p.perfil(16 * GB, 2500, 4, "linux", None)["capas_que_caben"]
    sin = p.perfil(16 * GB, 2499, 4, "linux", None)["capas_que_caben"]
    assert "laya" in con and "laya" not in sin and "needle" in sin


def test_needle_necesita_300mb():
    assert p.perfil(4 * GB, 299, 2, "linux", None)["capas_que_caben"] == []


def test_solo_capas_instaladas():
    r = p.perfil(16 * GB, 9 * GB, 4, "linux", ["needle"])
    assert r["capas_que_caben"] == ["needle"]


def test_json_valido():
    r = p.perfil(8 * GB, 3 * GB, 4, "darwin", [])
    again = json.loads(json.dumps(r))
    assert set(again) == {"slots_bitnet", "ctx_total", "ctx_por_slot", "hilos",
                          "capas_que_caben", "motivo"}
