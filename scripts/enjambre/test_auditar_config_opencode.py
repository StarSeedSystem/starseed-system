# -*- coding: utf-8 -*-
"""Pruebas de la guardia de la configuración de opencode (AGT1025E). Se carga el módulo
por ruta con importlib (como hace `test_plantilla_opencode.py`). Las cadenas que tendrían
forma de clave real se montan en tiempo de ejecución: GitHub rechazaría ese empuje.
"""
import importlib.util
import json
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
modulo = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config_opencode"] = modulo
ESPEC.loader.exec_module(modulo)
CLAVE = "sk" + "-" + "".join(chr(97 + i % 26) for i in range(24))  # «sk-» + 24 letras; jamás de corrido

def cfg_limpia():
    """Configuración limpia del enjambre: {env:…}, MCP apagado, tsserver off, vetos."""
    return {
        "plugin": [],
        "mcp": {"local": {"enabled": False}},
        "provider": {
            "xkiro": {"options": {"baseURL": "https://api.xkiro.com/v1", "apiKey": "{env:XKIRO_API_KEY}"}, "models": {}},
            "google": {"options": {"apiKey": "sin-clave"}},
        },
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": {"*": False}},
    }

def test_config_limpia_sin_hallazgos():
    assert modulo.auditar_config_opencode(cfg_limpia()) == []

def test_plugin_externo_bloquea_y_desaparece_si_es_admitido():
    cfg = cfg_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    hallazgos = modulo.auditar_config_opencode(cfg)
    assert [(h["id"], h["nivel"]) for h in hallazgos] == [("plugin-externo", "bloquea")]
    assert "oh-my-opencode-slim" in hallazgos[0]["texto"]
    assert modulo.auditar_config_opencode(cfg, ("oh-my-opencode-slim",)) == []

def test_mcp_remoto_activo_avisa_con_solo_el_host():
    cfg = cfg_limpia()
    cfg["mcp"] = {"gh": {"url": "https://mcp.ejemplo.com/ruta/de/tools?token=secreto"}}
    (hallazgo,) = modulo.auditar_config_opencode(cfg)
    assert (hallazgo["id"], hallazgo["nivel"]) == ("mcp-activo", "avisa")
    texto = hallazgo["texto"]
    assert "gasta contexto en cada turno" in texto
    assert "mcp.ejemplo.com" in texto
    assert "/ruta/de/tools" not in texto and "secreto" not in texto

def test_mcp_apagado_no_avisa():
    cfg = cfg_limpia()
    cfg["mcp"] = {"gh": {"url": "https://mcp.ejemplo.com", "enabled": False}}
    assert modulo.auditar_config_opencode(cfg) == []

def test_clave_en_claro_bloquea_y_no_delata_valor():
    cfg = cfg_limpia()
    cfg["provider"]["xkiro"]["options"]["apiKey"] = CLAVE
    (hallazgo,) = modulo.auditar_config_opencode(cfg)
    assert (hallazgo["id"], hallazgo["nivel"]) == ("clave-en-claro", "bloquea")
    assert "xkiro" in hallazgo["texto"] and "27" in hallazgo["texto"]
    for campo in ("texto", "arreglo"):
        assert CLAVE not in hallazgo[campo] and CLAVE[:6] not in hallazgo[campo]

def test_lsp_ausente_avisa():
    cfg = cfg_limpia()
    del cfg["lsp"]
    (hallazgo,) = modulo.auditar_config_opencode(cfg)
    assert (hallazgo["id"], hallazgo["nivel"]) == ("lsp-typescript", "avisa")
    assert "un tsserver gasta ~2 GB en la Mac de 8 GB" in hallazgo["texto"]

def test_permission_ausente_o_sin_bash_avisa():
    for permission in (None, {"otra": {}}, "no-es-dict"):
        cfg = cfg_limpia()
        (cfg.pop("permission") if permission is None else cfg.update({"permission": permission}))
        hallazgos = modulo.auditar_config_opencode(cfg)
        assert [(h["id"], h["nivel"]) for h in hallazgos] == [("sin-vetos-bash", "avisa")]

def test_entrada_no_dict_y_sentinela_devuelven_ilegible():
    for cfg in ("no-soy-dict", [1, 2], None, {"__ilegible__": True}):
        hallazgos = modulo.auditar_config_opencode(cfg)
        assert len(hallazgos) == 1
        assert (hallazgos[0]["id"], hallazgos[0]["nivel"]) == ("config-ilegible", "bloquea")

def test_leer_config(tmp_path):
    assert modulo.leer_config(str(tmp_path / "ausente.json")) == {}
    roto = tmp_path / "roto.json"
    roto.write_text("{no es json", encoding="utf-8")
    assert modulo.leer_config(str(roto)) == {"__ilegible__": True}
    # El audit convierte esa marca __ilegible__ en el hallazgo config-ilegible.
    assert modulo.auditar_config_opencode(modulo.leer_config(str(roto)))[0]["id"] == "config-ilegible"
    bueno = tmp_path / "bueno.json"
    bueno.write_text(json.dumps(cfg_limpia()), encoding="utf-8")
    assert modulo.auditar_config_opencode(modulo.leer_config(str(bueno))) == []

def _cfg_en(tmp_path, nombre, cfg):
    ruta = tmp_path / nombre
    ruta.write_text(json.dumps(cfg), encoding="utf-8")
    return str(ruta)

def test_main_devuelve_y_imprime_json(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", raising=False)
    assert modulo.main([_cfg_en(tmp_path, "b.json", cfg_limpia())]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}
    assert modulo.main([_cfg_en(tmp_path, "m.json", {"plugin": ["externo-sin-ver"]})]) == 1
    salida = json.loads(capsys.readouterr().out)
    assert salida["bloquea"] == 1 and salida["hallazgos"][0]["id"] == "plugin-externo"
    roto = tmp_path / "r.json"
    roto.write_text("{", encoding="utf-8")
    assert modulo.main([str(roto)]) == 1
    assert json.loads(capsys.readouterr().out)["hallazgos"][0]["id"] == "config-ilegible"

def test_main_lee_plugins_admitidos_del_entorno(tmp_path, capsys, monkeypatch):
    con_plugin = _cfg_en(tmp_path, "c.json", {"plugin": ["oh-my-opencode-slim"]})
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "oh-my-opencode-slim,otro")
    assert modulo.main([con_plugin]) == 0
    salida = json.loads(capsys.readouterr().out)
    assert salida["bloquea"] == 0
    assert all(h["id"] != "plugin-externo" for h in salida["hallazgos"])
