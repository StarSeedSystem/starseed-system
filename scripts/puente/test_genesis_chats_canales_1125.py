"""DIR1125W: los canales General y Audiovisual llegan al espejo de Astraura › Genesis."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import genesis_chats_logica as L  # noqa: E402


def test_cada_canal_va_a_una_fuente_que_la_mac_puede_escribir():
    destinos = {n: f for n, _p, f in L.CANALES_ESPEJO}
    assert destinos == {"general": "puente:hermes-avisos", "audiovisual": "direccion"}
    assert all(f in L.FUENTES and f != "puente:peticiones" for f in destinos.values())


def test_registros_de_canal_solo_lo_nuevo_y_marcado():
    lineas = [json.dumps({"id": "gen-1", "t": 1, "texto": "a"}), "no es json", json.dumps({"sin": "id"}),
              json.dumps({"id": "gen-2", "t": 2, "texto": "b"}), json.dumps({"id": "gen-2", "t": 2, "texto": "b"})]
    r = L.registros_de_canal(lineas, "general", "puente:hermes-avisos", ["gen-1"])
    assert [x["id"] for x in r] == ["gen-2"]
    assert r[0]["fuente"] == "puente:hermes-avisos" and r[0]["canalEspecializado"] == "general"


def test_registros_de_canal_nunca_lanza():
    assert L.registros_de_canal(None, "audiovisual", "direccion", None) == []
