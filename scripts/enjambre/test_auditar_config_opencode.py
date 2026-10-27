# -*- coding: utf-8 -*-
"""Tests de la guardia de la config de opencode (AGT1025E · Ola 1025R). Nunca se toca el
~/.config/opencode/opencode.json real: la auditora es pura y main se prueba con JSON en tmp_path.
Toda cadena con forma de clave se monta en tiempo de ejecución (GitHub rechaza commits con claves
de ejemplo con forma real).
"""

import importlib.util
import json
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_cfg", RUTA)
auditar_cfg = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_cfg"] = auditar_cfg
ESPEC.loader.exec_module(auditar_cfg)
CLAVE = "sk" + "-" + "a" * 24  # forma de clave montada en tiempo de ejecución

CONFIG_LIMPIA = {
    "provider": {
        "llm7": {"options": {"apiKey": "sin-clave"}},
        "xkiro": {"options": {"apiKey": "{env:XKIRO_API_KEY}"}},
    },
    "lsp": {"typescript": {"disabled": True}},
    "permission": {"bash": {":*": "deny"}},
}


def module_cfg(cfg): return auditar_cfg.auditar_config_opencode(cfg)

def escribir(tmp_path, nombre, datos):
    ruta = tmp_path / nombre; ruta.write_text(json.dumps(datos), encoding="utf-8")
    return str(ruta)

def test_config_limpia_no_d_hallazgos():
    assert module_cfg(CONFIG_LIMPIA) == []

def test_plugin_externo_bloquea_con_su_nombre():
    cfg = dict(CONFIG_LIMPIA, plugin=["oh-my-opencode-slim"])
    hallazgos = module_cfg(cfg)
    assert all(h["id"] == "plugin-externo" and h["nivel"] == "bloquea" for h in hallazgos)
    assert "oh-my-opencode-slim" in json.dumps(hallazgos)

def test_plugin_admitido_desaparece():
    cfg = dict(CONFIG_LIMPIA, plugin=["oh-my-opencode-slim"])
    admitido = auditar_cfg.auditar_config_opencode(cfg, plugins_admitidos=("oh-my-opencode-slim",))
    assert admitido == []

def test_mcp_activo_avisa_solo_host():
    cfg = dict(CONFIG_LIMPIA, mcp={"klavis": {"url": "https://mcp.ejemplo.com:8443/ruta?param=1"}})
    hallazgos = module_cfg(cfg)
    assert [h["nivel"] for h in hallazgos] == ["avisa"] and hallazgos[0]["id"] == "mcp-activo"
    texto = json.dumps(hallazgos)
    assert "gasta contexto en cada turno" in hallazgos[0]["texto"]
    assert "mcp.ejemplo.com" in texto
    assert "/ruta" not in texto and "param" not in texto and "8443" not in texto

def test_mcp_apagado_no_avisa():
    cfg = dict(CONFIG_LIMPIA, mcp={"klavis": {"url": "https://ok.com/x", "enabled": False}})
    assert module_cfg(cfg) == []

def test_clave_en_claro_bloquea_solo_con_longitud():
    cfg = json.loads(json.dumps(CONFIG_LIMPIA))
    cfg["provider"]["xkiro"]["options"]["apiKey"] = CLAVE
    hallazgo = module_cfg(cfg)[0]
    assert hallazgo["id"] == "clave-en-claro" and hallazgo["nivel"] == "bloquea"
    assert "xkiro" in hallazgo["texto"] and str(len(CLAVE)) in hallazgo["texto"]
    # El valor (ni trozo suyo) aparece por ningún sitio del hallazgo: solo su longitud.
    assert CLAVE not in json.dumps(hallazgo) and "sk-aaaa" not in json.dumps(hallazgo)
    assert "apiKey" in hallazgo["texto"] and "{env:" in hallazgo["arreglo"]

def test_lsp_ausente_y_permission_ausente_avisan():
    cfg = {"provider": {"llm7": {"options": {"apiKey": "sin-clave"}}}}
    assert [h["id"] for h in module_cfg(cfg)] == ["lsp-typescript", "sin-vetos-bash"]
    assert [h["nivel"] for h in module_cfg(cfg)] == ["avisa", "avisa"]

def test_permission_sin_bash_avisa():
    for permisos in ({"edit": "deny"}, "de todo"):
        cfg = dict(CONFIG_LIMPIA, permission=permisos)
        assert "sin-vetos-bash" in [h["id"] for h in module_cfg(cfg)]

def test_entrada_que_no_es_dict():
    for entrada in ([], "texto", 7, None, {"__ilegible__": True}):
        hallazgos = module_cfg(entrada)
        assert len(hallazgos) == 1 and hallazgos[0]["id"] == "config-ilegible"
        assert hallazgos[0]["nivel"] == "bloquea"

def test_leer_config_ausente_y_rota(tmp_path):
    assert auditar_cfg.leer_config(str(tmp_path / "no-hay.json")) == {}
    rota = tmp_path / "rota.json"
    rota.write_text("{provider: sin comillas", encoding="utf-8")
    ilegible = auditar_cfg.leer_config(str(rota))
    assert ilegible.get("__ilegible__") is True
    hallazgo = module_cfg(ilegible)[0]
    assert hallazgo["id"] == "config-ilegible" and hallazgo["nivel"] == "bloquea"
    assert auditar_cfg.leer_config(escribir(tmp_path, "limpia.json", CONFIG_LIMPIA)) == CONFIG_LIMPIA

def test_main_json_y_codigo(capsys, tmp_path, monkeypatch):
    monkeypatch.delenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", raising=False)
    assert auditar_cfg.main([escribir(tmp_path, "limpia.json", CONFIG_LIMPIA)]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}
    sucia = json.loads(json.dumps(CONFIG_LIMPIA))
    sucia["provider"]["xkiro"]["options"]["apiKey"] = CLAVE
    assert auditar_cfg.main([escribir(tmp_path, "con-clave.json", sucia)]) == 1
    salida = json.loads(capsys.readouterr().out)
    assert salida["bloquea"] == 1 and salida["hallazgos"][0]["id"] == "clave-en-claro"

def test_main_sin_argumentos_vuelve_a_la_ruta_defecto(capsys, monkeypatch, tmp_path):
    monkeypatch.setattr(auditar_cfg, "RUTA_DEFECTO", str(tmp_path / "no-hay.json"))
    monkeypatch.delenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", raising=False)
    assert auditar_cfg.main([]) == 0
    salida = json.loads(capsys.readouterr().out)
    assert salida["bloquea"] == 0 and salida["hallazgos"][0]["id"] == "lsp-typescript"

def test_plugins_admitidos_entorno(monkeypatch):
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "a,b,c")
    assert auditar_cfg.plugins_admitidos_entorno() == ["a", "b", "c"]
    monkeypatch.delenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS")
    assert auditar_cfg.plugins_admitidos_entorno() == []
