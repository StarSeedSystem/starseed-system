"""Pruebas puras de auditar_config_opencode."""

import importlib.util
import json
import os

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
spec = importlib.util.spec_from_file_location("auditar", RUTA)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

auditar = mod.auditar_config_opencode
leer = mod.leer_config
main = mod.main


def config_limpia():
    return {
        "plugin": [],
        "mcp": {},
        "provider": {"p1": {"options": {"apiKey": "{env:MI_VAR}"}}},
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": {}},
    }


def test_config_limpia():
    assert auditar(config_limpia()) == []


def test_plugin_externo():
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    h = auditar(cfg)
    assert any(x["id"] == "plugin-externo" and "oh-my-opencode-slim" in x["texto"] for x in h)


def test_plugin_admitido():
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    h = auditar(cfg, plugins_admitidos=["oh-my-opencode-slim"])
    assert not any(x["id"] == "plugin-externo" for x in h)


def test_mcp_host():
    cfg = config_limpia()
    cfg["mcp"] = {"remoto": {"enabled": True, "url": "https://api.ejemplo.com/v1/thing?x=1"}}
    h = [x for x in auditar(cfg) if x["id"] == "mcp-activo"]
    assert len(h) == 1
    t = h[0]["texto"]
    assert "api.ejemplo.com" in t and "/v1/thing" not in t and "?x=1" not in t


def test_api_key_claro():
    cfg = config_limpia()
    clave = "".join(["sk", "-", "a" * 24])
    cfg["provider"]["p1"]["options"]["apiKey"] = clave
    h = [x for x in auditar(cfg) if x["id"] == "clave-en-claro"]
    assert len(h) == 1
    assert "p1" in h[0]["texto"] and "longitud 27" in h[0]["texto"]
    assert clave not in h[0]["texto"] and clave not in h[0]["arreglo"]


def test_lsp_ausente():
    cfg = config_limpia()
    del cfg["lsp"]
    assert any(x["id"] == "lsp-typescript" for x in auditar(cfg))


def test_config_no_dict():
    h = auditar("no dict")
    assert h[0]["id"] == "config-ilegible" and h[0]["nivel"] == "bloquea"


def test_leer_ausente(tmp_path):
    assert leer(str(tmp_path / "no.json")) == {}


def test_leer_roto(tmp_path):
    p = tmp_path / "r.json"
    p.write_text("{ no json", encoding="utf-8")
    assert leer(str(p)) == {"__ilegible__": True}


def test_main_json(monkeypatch, tmp_path, capsys):
    cfg = config_limpia()
    r = tmp_path / "c.json"
    r.write_text(json.dumps(cfg), encoding="utf-8")
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "")
    assert main([str(r)]) == 0
    data = json.loads(capsys.readouterr().out)
    assert "hallazgos" in data

    cfg["plugin"] = ["malo"]
    r.write_text(json.dumps(cfg), encoding="utf-8")
    assert main([str(r)]) == 1
