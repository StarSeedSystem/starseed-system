# -*- coding: utf-8 -*-
"""Pruebas de la guardia de opencode.json (Ola 1025 · AGT1025E): módulo cargado por
ruta con importlib (como test_plantilla_opencode.py). La clave de ejemplo se monta en
tiempo de ejecución (nunca literal) y el hallazgo solo lleva su LONGITUD, jamás el valor."""

import importlib.util
import json
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
guardia = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config_opencode"] = guardia
ESPEC.loader.exec_module(guardia)

CLAVE = "".join(["sk", "-", "a" * 24])  # montada en runtime; NUNCA una literal


def config_limpia():
    return {
        "provider": {
            "nvidia": {"options": {"apiKey": "{env:NVIDIA_API_KEY}"}},
            "llm7": {"options": {"apiKey": "sin-clave"}},
        },
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": {"*": "deny"}},
    }


def test_plugin_externo_bloquea_y_admitido_desaparece():
    assert guardia.auditar_config_opencode(config_limpia()) == []
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim", "kilo-code"]
    hal = guardia.auditar_config_opencode(cfg)
    assert [h["id"] for h in hal] == ["plugin-externo", "plugin-externo"]
    assert all(h["nivel"] == "bloquea" for h in hal)
    assert "oh-my-opencode-slim" in hal[0]["texto"]
    hal2 = guardia.auditar_config_opencode(cfg, ["oh-my-opencode-slim", "kilo-code"])
    assert hal2 == []


def test_mcp_activo_avisa_solo_host_y_apagado_calla():
    cfg = config_limpia()
    cfg["mcp"] = {"tarea": {"type": "remote", "url": "https://ejemplo.com/ruta?token=abc", "enabled": True}}
    hal = guardia.auditar_config_opencode(cfg)
    assert [h["id"] for h in hal] == ["mcp-activo"] and hal[0]["nivel"] == "avisa"
    texto = hal[0]["texto"]
    assert "gasta contexto en cada turno" in texto and "ejemplo.com" in texto
    assert "/ruta" not in texto and "token" not in texto
    apagado = config_limpia()
    apagado["mcp"] = {"todo": {"enabled": False}}
    assert guardia.auditar_config_opencode(apagado) == []
    silencioso = config_limpia()
    silencioso["mcp"] = {"otro": {"command": ["x"]}}  # sin enabled: se considera activo
    assert [h["id"] for h in guardia.auditar_config_opencode(silencioso)] == ["mcp-activo"]


def test_clave_en_claro_bloquea_y_solo_longitud():
    cfg = config_limpia()
    cfg["provider"]["fuga"] = {"options": {"apiKey": CLAVE}}
    hal = guardia.auditar_config_opencode(cfg)
    assert [h["id"] for h in hal] == ["clave-en-claro"] and hal[0]["nivel"] == "bloquea"
    completo = json.dumps(hal[0], ensure_ascii=False)
    assert CLAVE not in completo and str(len(CLAVE)) in hal[0]["texto"]


def test_lsp_y_vetos_bash_avisan():
    cfg = config_limpia()
    del cfg["lsp"]
    hal = guardia.auditar_config_opencode(cfg)
    assert [h["id"] for h in hal] == ["lsp-typescript"] and hal[0]["nivel"] == "avisa"
    cfg2 = config_limpia()
    cfg2["lsp"]["typescript"] = {"disabled": False}
    assert [h["id"] for h in guardia.auditar_config_opencode(cfg2)] == ["lsp-typescript"]
    for permisos in (None, {}, {"edit": "allow"}, "texto"):
        c = config_limpia()
        if permisos is None:
            del c["permission"]
        else:
            c["permission"] = permisos
        h = guardia.auditar_config_opencode(c)
        assert [x["id"] for x in h] == ["sin-vetos-bash"] and h[0]["nivel"] == "avisa"


def test_ilegible_ausente_y_rota(tmp_path):
    for raro in (None, [], "texto", 7, {"__ilegible__": True}):
        hal = guardia.auditar_config_opencode(raro)
        assert [h["id"] for h in hal] == ["config-ilegible"] and hal[0]["nivel"] == "bloquea"
    assert guardia.leer_config(str(tmp_path / "no-esta.json")) == {}
    rota = tmp_path / "rota.json"
    rota.write_text("{ no es json", encoding="utf-8")
    assert guardia.leer_config(str(rota)) == {"__ilegible__": True}


def test_main_devuelve_y_json_parseable(capsys, tmp_path):
    limpia = tmp_path / "limpia.json"
    limpia.write_text(json.dumps(config_limpia()), encoding="utf-8")
    assert guardia.main([str(limpia)]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}
    cfg = config_limpia()
    cfg["provider"]["fuga"] = {"options": {"apiKey": CLAVE}}
    fuga = tmp_path / "fuga.json"
    fuga.write_text(json.dumps(cfg), encoding="utf-8")
    assert guardia.main([str(fuga)]) == 1
    texto = capsys.readouterr().out
    salida = json.loads(texto)
    assert salida["bloquea"] == 1 and salida["hallazgos"][0]["id"] == "clave-en-claro"
    assert CLAVE not in texto


def test_main_plugins_admitidos_por_entorno(capsys, tmp_path, monkeypatch):
    cfg = {**config_limpia(), "plugin": ["oh-my-opencode-slim"]}
    con_plugin = tmp_path / "plugin.json"
    con_plugin.write_text(json.dumps(cfg), encoding="utf-8")
    assert guardia.main([str(con_plugin)]) == 1
    assert json.loads(capsys.readouterr().out)["bloquea"] == 1
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "oh-my-opencode-slim, otro")
    assert guardia.main([str(con_plugin)]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}
