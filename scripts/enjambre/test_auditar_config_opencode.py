# -*- coding: utf-8 -*-
"""Pruebas de la guardia de opencode del enjambre (Ola 1025 · AGT1025E).

Patrón de `test_plantilla_opencode.py`: el módulo se carga por ruta con importlib.
Toda cadena con forma de clave (sk-…) se monta en tiempo de ejecución y el hallazgo
solo puede llevar su LONGITUD, jamás el valor. Nunca se lee el opencode.json real.
"""

import importlib.util
import json
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
assert ESPEC is not None and ESPEC.loader is not None
guardia = importlib.util.module_from_spec(ESPEC)
sys.modules["guardia"] = guardia
ESPEC.loader.exec_module(guardia)


def clave_falsa():
    """«sk-» + 24 letras, montada aquí y no escrita en el código."""
    pedazo = "a" * 24
    return "sk-" + pedazo


def config_limpia():
    """La configuración del enjambre tal como la escribe el orquestador."""
    return {
        "provider": {
            "groq": {"options": {"apiKey": "{env:STARSEED_GROQ_KEY}", "baseURL": "x"}},
            "libre": {"options": {"apiKey": "sin-clave"}},
        },
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": ["git push: deny"]},
    }


def solo_id(hallazgos):
    return [h["id"] for h in hallazgos]


def test_config_limpia_del_enjambre_no_da_hallazgos():
    assert guardia.auditar_config_opencode(config_limpia()) == []


def test_plugin_externo_bloquea_y_desaparece_si_es_admitido():
    cfg = dict(config_limpia(), plugin=["oh-my-opencode-slim"])
    hallazgos = guardia.auditar_config_opencode(cfg)
    assert solo_id(hallazgos) == ["plugin-externo"]
    assert hallazgos[0]["nivel"] == "bloquea"
    assert "oh-my-opencode-slim" in hallazgos[0]["texto"]
    assert guardia.auditar_config_opencode(cfg, ["oh-my-opencode-slim"]) == []


def test_mcp_activo_avisa_con_solo_el_host_y_apagado_no():
    cfg = dict(config_limpia(), mcp={"klavis": {"url": "https://mcp.klavis.ai/ruta?token=secreto&x=1"}})
    hallazgos = guardia.auditar_config_opencode(cfg)
    assert solo_id(hallazgos) == ["mcp-activo"]
    assert hallazgos[0]["nivel"] == "avisa"
    texto = hallazgos[0]["texto"]
    assert "mcp.klavis.ai" in texto and "gasta contexto en cada turno" in texto
    assert "/ruta" not in texto and "token" not in texto and "secreto" not in texto
    apagado = dict(config_limpia(), mcp={"klavis": {"url": "https://mcp.klavis.ai/r", "enabled": False}})
    assert guardia.auditar_config_opencode(apagado) == []


def test_apikey_en_claro_solo_da_la_longitud():
    valor = clave_falsa()
    cfg = dict(config_limpia(), provider={"peligro": {"options": {"apiKey": valor}}})
    hallazgos = guardia.auditar_config_opencode(cfg)
    assert solo_id(hallazgos) == ["clave-en-claro"]
    assert hallazgos[0]["nivel"] == "bloquea"
    rechazado = json.dumps(hallazgos)
    assert valor not in rechazado and "sk" not in rechazado
    assert str(len(valor)) in rechazado


def test_lsp_ausente_avisa():
    cfg = {k: v for k, v in config_limpia().items() if k != "lsp"}
    hallazgos = guardia.auditar_config_opencode(cfg)
    assert set(solo_id(hallazgos)) == {"lsp-typescript"}
    assert hallazgos[0]["nivel"] == "avisa" and "~2 GB" in hallazgos[0]["texto"]


def test_entrada_que_no_es_dict_da_config_ilegible():
    for raro in ([], "texto", None, 7):
        hallazgos = guardia.auditar_config_opencode(raro)
        assert len(hallazgos) == 1
        assert hallazgos[0]["id"] == "config-ilegible"
        assert hallazgos[0]["nivel"] == "bloquea"


def test_permission_sin_bash_avisa():
    for permisos in (None, {"edit": "allow"}):
        cfg = {k: v for k, v in config_limpia().items() if k != "permission"}
        if permisos is not None:
            cfg["permission"] = permisos
        ids = {h["id"] for h in guardia.auditar_config_opencode(cfg)}
        assert "sin-vetos-bash" in ids


def test_leer_config_ausente_y_roto(tmp_path):
    assert guardia.leer_config(str(tmp_path / "ausente.json")) == {}
    roto = tmp_path / "roto.json"
    roto.write_text("{ esto no es JSON", encoding="utf-8")
    assert guardia.leer_config(str(roto)) == {"__ilegible__": True}
    hallazgos = guardia.auditar_config_opencode({"__ilegible__": True})
    assert hallazgos == [dict(id="config-ilegible", nivel="bloquea", texto="la configuración no es un JSON legible", arreglo="regénrala desde el orquestador (refrescar_bloque_opencode)")]


def test_main_devuelve_y_imprime_json(tmp_path, capsys):
    limpia = tmp_path / "limpia.json"
    limpia.write_text(json.dumps(config_limpia()), encoding="utf-8")
    assert guardia.main([str(limpia)]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}
    sucia = tmp_path / "sucia.json"
    sucia.write_text(json.dumps({"__ilegible__": True}), encoding="utf-8")
    assert guardia.main([str(sucia)]) == 1
    datos = json.loads(capsys.readouterr().out)
    assert datos["bloquea"] == 1 and isinstance(datos["hallazgos"], list)


def test_plugins_admitidos_desde_entorno(monkeypatch):
    monkeypatch.setenv(guardia.VAR_ENTORNO_PLUGINS, " a , b ,")
    assert guardia.plugins_desde_entorno() == ["a", "b"]
    monkeypatch.setenv(guardia.VAR_ENTORNO_PLUGINS, "")
    assert guardia.plugins_desde_entorno() == []
    assert guardia.plugins_desde_entorno("gpt") == ["gpt"]
