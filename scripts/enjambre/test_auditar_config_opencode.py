# -*- coding: utf-8 -*-
"""Tests puros de `auditar_config_opencode` (Ola 1025R · AGT1025E).

Nada toca el ~/.config/opencode/opencode.json real: se auditan dicts en memoria y se
usan tmp_path para `leer_config` y `main`. Toda cadena con forma de clave se monta en
tiempo de ejecución, porque GitHub rechaza el empuje de una clave de ejemplo con forma
real. Solo funciones puras: sin red, sin mocks de módulos de Node (ni de nada).
"""

import importlib.util
import json
import os
import sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config", RUTA)
auditar_config = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config"] = auditar_config
ESPEC.loader.exec_module(auditar_config)










CLAVE_EN_CLARO = "sk" + "-" + "a" * 24


def config_limpia():
    """La configuración del enjambre tal como la escribe el orquestador."""
    return {
        "provider": {
            "openrouter": {
                "options": {
                    "apiKey": "{env:STARSEED_OPENROUTER_KEY}",
                    "baseURL": "https://openrouter.ai/api/v1",
                }
            }
        },
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": {"edit": "deny"}},
    }


def test_config_limpia_sin_hallazgos():
    assert auditar_config.auditar_config_opencode(config_limpia()) == []


def test_plugin_externo_bloquea():
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    hallazgos = auditar_config.auditar_config_opencode(cfg)
    assert [h for h in hallazgos if h["id"] == "plugin-externo"][0]["nivel"] == "bloquea"
    assert "oh-my-opencode-slim" in hallazgos[0]["texto"]


def test_plugin_admitido_desaparece():
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    hallazgos = auditar_config.auditar_config_opencode(cfg, ["oh-my-opencode-slim"])
    assert hallazgos == []


def test_mcp_remoto_activo_avisa_con_solo_el_host():
    cfg = config_limpia()
    cfg["mcp"] = {"remoto": {
        "enabled": True,
        "url": "https://mcp.ejemplo.dev/ruta/larga?token=secreto",
    }}
    hallazgos = auditar_config.auditar_config_opencode(cfg)
    activo = [h for h in hallazgos if h["id"] == "mcp-activo"]
    assert len(activo) == 1
    assert activo[0]["nivel"] == "avisa"
    assert "mcp.ejemplo.dev" in activo[0]["texto"]
    assert "/ruta/larga" not in activo[0]["texto"]
    assert "token" not in activo[0]["texto"]
    assert "secreto" not in activo[0]["texto"]


def test_mcp_desactivado_no_avisa():
    cfg = config_limpia()
    cfg["mcp"] = {"apagado": {"enabled": False, "url": "https://mcp.ejemplo.dev"}}
    assert auditar_config.auditar_config_opencode(cfg) == []


def test_clave_en_claro_bloquea_y_da_solo_la_longitud():
    cfg = config_limpia()
    cfg["provider"]["openrouter"]["options"]["apiKey"] = CLAVE_EN_CLARO
    hallazgos = auditar_config.auditar_config_opencode(cfg)
    clara = [h for h in hallazgos if h["id"] == "clave-en-claro"]
    assert len(clara) == 1
    assert clara[0]["nivel"] == "bloquea"
    assert "openrouter" in clara[0]["texto"]
    assert "%d" % len(CLAVE_EN_CLARO) in clara[0]["texto"]
    # La clave NO aparece en ningún campo del hallazgo: ni texto ni arreglo.
    for campo in clara[0].values():
        assert isinstance(campo, str)
        assert CLAVE_EN_CLARO not in campo
        assert "aaaa" not in campo


def test_apikey_sin_clave_y_env_validos():
    cfg = config_limpia()
    cfg["provider"]["sincl"] = {"options": {"apiKey": "sin-clave"}}
    base = auditar_config.auditar_config_opencode(cfg)
    assert [h for h in base if h["id"] == "clave-en-claro"] == []
    cfg["provider"]["salida"] = {"options": {"apiKey": "{env:minusc_wpq}"}}
    rotos = auditar_config.auditar_config_opencode(cfg)
    assert [h for h in rotos if h["id"] == "clave-en-claro"] != []


def test_lsp_typescript_ausente_avisa():
    cfg = config_limpia()
    del cfg["lsp"]
    hallazgos = auditar_config.auditar_config_opencode(cfg)
    lsp = [h for h in hallazgos if h["id"] == "lsp-typescript"]
    assert len(lsp) == 1 and lsp[0]["nivel"] == "avisa"


def test_sin_vetos_bash_avisa():
    cfg = config_limpia()
    del cfg["permission"]
    hallazgos = auditar_config.auditar_config_opencode(cfg)
    vetos = [h for h in hallazgos if h["id"] == "sin-vetos-bash"]
    assert len(vetos) == 1 and vetos[0]["nivel"] == "avisa"
    permiso_roto = config_limpia()
    permiso_roto["permission"] = "todo permitido"
    assert [h for h in auditar_config.auditar_config_opencode(permiso_roto)
            if h["id"] == "sin-vetos-bash"]


def test_entrada_que_no_es_dict_bloquea():
    for fea in (["lista"], "texto", None, 7):
        hallazgos = auditar_config.auditar_config_opencode(fea)
        assert len(hallazgos) == 1
    assert hallazgos[0]["id"] == "config-ilegible"


def test_leer_config_archivo_ausente(tmp_path):
    assert auditar_config.leer_config(str(tmp_path / "no-existe.json")) == {}


def test_leer_config_json_roto(tmp_path):
    roto = tmp_path / "roto.json"
    roto.write_text("{provider: sin comillas", encoding="utf-8")
    assert auditar_config.leer_config(str(roto)) == {"__ilegible__": True}


def test_leer_config_json_valido(tmp_path):
    bueno = tmp_path / "bueno.json"
    bueno.write_text(json.dumps(config_limpia()), encoding="utf-8")
    assert auditar_config.leer_config(str(bueno)) == config_limpia()


def test_main_devuelve_1_y_salida_json(tmp_path, capsys):
    fea = tmp_path / "fea.json"
    fea.write_text(json.dumps({"plugin": ["oh-my-opencode-slim"]}), encoding="utf-8")
    assert auditar_config.main([str(fea)]) == 1
    salida = json.loads(capsys.readouterr().out)
    assert salida["bloquea"] >= 1
    assert any(h["id"] == "plugin-externo" for h in salida["hallazgos"])


def test_main_devuelve_0_con_config_limpia(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv(auditar_config.VARIABLE_PLUGINS, raising=False)
    bueno = tmp_path / "bueno.json"
    bueno.write_text(json.dumps(config_limpia()), encoding="utf-8")
    assert auditar_config.main([str(bueno)]) == 0
    salida = json.loads(capsys.readouterr().out)
    assert salida["hallazgos"] == [] and salida["bloquea"] == 0


def test_main_con_plugins_admitidos_por_entorno(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv(auditar_config.VARIABLE_PLUGINS, "oh-my-opencode-slim, kilo")
    fea = tmp_path / "fea.json"
    fea.write_text(json.dumps({"plugin": ["oh-my-opencode-slim"]}), encoding="utf-8")
    assert auditar_config.main([str(fea)]) == 0
    assert json.loads(capsys.readouterr().out)["bloquea"] == 0


def test_config_ilegible_de_leer_config_bloquea():
    hallazgos = auditar_config.auditar_config_opencode({"__ilegible__": True})
    assert hallazgos[0]["id"] == "config-ilegible"
