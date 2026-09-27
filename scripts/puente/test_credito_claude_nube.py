import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import credito_claude_nube as cc  # noqa: E402


def test_declarar_guarda_fecha_y_limites(tmp_path):
    ruta = str(tmp_path / "c.json")
    d = cc.declarar(cc.leer(ruta), 180, total=250, semanal_todos=40, cuando="2026-09-28T00:00:00Z")
    cc.guardar(d, ruta)
    leido = cc.leer(ruta)
    assert leido["restante_usd"] == 180
    assert leido["total_usd"] == 250
    assert leido["semanal"]["todos"] == 40
    assert leido["declarado_en"] == "2026-09-28T00:00:00Z"
    assert oct(os.stat(ruta).st_mode)[-3:] == "600"


def test_restante_nunca_negativo():
    assert cc.declarar(dict(cc.POR_DEFECTO), -5)["restante_usd"] == 0


def test_uso_suma_tokens_sin_texto(tmp_path):
    carpeta = tmp_path / "proj"
    carpeta.mkdir()
    lineas = [
        {"timestamp": "2026-09-27T01:00:00Z", "message": {"model": "claude-opus-5-5", "content": "secreto", "usage": {"output_tokens": 10, "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 5}}},
        {"timestamp": "2026-09-27T02:00:00Z", "message": {"model": "claude-opus-5-5", "usage": {"output_tokens": 5, "cache_read_input_tokens": 500}}},
        {"timestamp": "2026-09-26T00:00:00Z", "message": {"model": "claude-opus-5-5", "usage": {"output_tokens": 999}}},
        {"message": {"model": "<synthetic>", "usage": {"output_tokens": 1}}},
    ]
    (carpeta / "abc123.jsonl").write_text("\n".join(json.dumps(x) for x in lineas) + "\nroto{\n", encoding="utf-8")
    inf = cc.uso_de_sesiones(str(tmp_path), desde="2026-09-27")
    assert len(inf) == 1
    assert inf[0]["sesion"] == "abc123"
    assert inf[0]["salida"] == 15
    assert inf[0]["cacheLectura"] == 1500
    assert "secreto" not in json.dumps(inf)


def test_anotar_el_mas_nuevo_gana_y_tope():
    d = cc.anotar(dict(cc.POR_DEFECTO), [{"sesion": "s1", "t": "1", "salida": 1}])
    d = cc.anotar(d, [{"sesion": "s1", "t": "2", "salida": 7}])
    assert len(d["sesiones"]) == 1 and d["sesiones"][0]["salida"] == 7
    d = cc.anotar(d, [{"sesion": "x%d" % i, "t": str(10 + i)} for i in range(30)])
    assert len(d["sesiones"]) == cc.MAX_SESIONES
