# -*- coding: utf-8 -*-
"""Tests puros de la guardia de la configuración de opencode (Ola 1025R · AGT1025E).

Nunca se toca el ~/.config/opencode/opencode.json real: la configuración va en un dict y
los archivos de prueba se montan en tmp_path. Ninguna cadena con forma de clave se escribe
literal: se monta en tiempo de ejecución.
"""

import importlib.util, json, os, sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
mod = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config_opencode"] = mod
ESPEC.loader.exec_module(mod)

def cfg_limpio():
    """La configuración del enjambre tal como la escribe refrescar_bloque_opencode."""
    return {
        "provider": {
            "apinex": {
                "options": {"apiKey": "{env:STARSEED_PASARELA_APINEX_KEY}", "baseURL": "https://apinex.bond/v1"},
                "models": {"modelo-x": {"name": "modelo-x"}},
            }
        },
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": {"*": "deny"}},
    }

def test_config_limpia_sin_hallazgos():
    assert mod.auditar_config_opencode(cfg_limpio()) == []

def test_plugin_externo_bloquea_y_admitido_desaparece():
    cfg = cfg_limpio()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    hallazgos = mod.auditar_config_opencode(cfg)
    assert len(hallazgos) == 1
    assert hallazgos[0]["id"] == "plugin-externo" and hallazgos[0]["nivel"] == "bloquea"
    assert "oh-my-opencode-slim" in hallazgos[0]["texto"]
    assert mod.auditar_config_opencode(cfg, ["oh-my-opencode-slim"]) == []

def test_mcp_remoto_activo_avisa_solo_host():
    cfg = cfg_limpio()
    cfg["mcp"] = {"nube": {"url": "https://host.nube.com/ruta/larga?llave=secreta&x=1"}}
    hallazgos = mod.auditar_config_opencode(cfg)
    assert len(hallazgos) == 1
    assert hallazgos[0]["id"] == "mcp-activo" and hallazgos[0]["nivel"] == "avisa"
    texto = hallazgos[0]["texto"]
    assert "host.nube.com" in texto
    assert "/ruta" not in texto and "llave" not in texto and "secreta" not in texto

def test_mcp_apagado_no_avisa():
    cfg = cfg_limpio()
    cfg["mcp"] = {"nube": {"enabled": False, "url": "https://host.nube.com/x"}}
    assert mod.auditar_config_opencode(cfg) == []

def test_clave_en_claro_bloquea_y_no_revela_el_valor():
    secreto = "sk" + "-" + "a" * 24
    cfg = cfg_limpio()
    cfg["provider"]["apinex"]["options"]["apiKey"] = secreto
    hallazgos = mod.auditar_config_opencode(cfg)
    assert len(hallazgos) == 1
    assert hallazgos[0]["id"] == "clave-en-claro" and hallazgos[0]["nivel"] == "bloquea"
    for campo in ("texto", "arreglo"):
        assert secreto not in hallazgos[0][campo]
    assert "27" in hallazgos[0]["texto"] and "apinex" in hallazgos[0]["texto"]

def test_lsp_ausente_avisa():
    cfg = cfg_limpio()
    del cfg["lsp"]
    hallazgos = mod.auditar_config_opencode(cfg)
    assert len(hallazgos) == 1
    assert hallazgos[0]["id"] == "lsp-typescript" and hallazgos[0]["nivel"] == "avisa"

def test_sin_vetos_bash_avisa():
    cfg = cfg_limpio()
    del cfg["permission"]
    hallazgos = mod.auditar_config_opencode(cfg)
    assert hallazgos[0]["id"] == "sin-vetos-bash"

def test_entrada_no_dict_es_config_ilegible():
    for entrada in ([1, 2, 3], "texto", None, {"__ilegible__": True}):
        hallazgos = mod.auditar_config_opencode(entrada)
        assert len(hallazgos) == 1
        assert hallazgos[0]["id"] == "config-ilegible" and hallazgos[0]["nivel"] == "bloquea"
        assert set(hallazgos[0]) == {"id", "nivel", "texto", "arreglo"}

def test_leer_config_ausente_y_rota(tmp_path):
    assert mod.leer_config(str(tmp_path / "noexiste.json")) == {}
    rota = tmp_path / "rota.json"
    rota.write_text("{ no es json", encoding="utf-8")
    assert mod.leer_config(str(rota)) == {"__ilegible__": True}

def test_main_salida_json_y_codigo(tmp_path, capsys, monkeypatch):
    limpia = tmp_path / "limpia.json"
    limpia.write_text(json.dumps(cfg_limpio()), encoding="utf-8")
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "oh-my-opencode-slim")
    assert mod.main([str(limpia)]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}
    sucia = tmp_path / "sucia.json"
    sucia.write_text(json.dumps({"plugin": ["otro-plugin"]}), encoding="utf-8")
    assert mod.main([str(sucia)]) == 1
    datos = json.loads(capsys.readouterr().out)
    assert datos["bloquea"] == 1
    assert datos["hallazgos"][0]["id"] == "plugin-externo"
