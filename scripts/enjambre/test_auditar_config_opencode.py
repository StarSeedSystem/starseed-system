# -*- coding: utf-8 -*-
"""Pruebas de la guardia de opencode.json del enjambre (Ola 1025R · AGT1025E).

Módulo puro: nada de red ni reloj; el disco solo en `leer_config`, con tmp_path. Cualquier
cadena con forma de clave (sk-…) se monta en tiempo de ejecución por partes, porque GitHub
rechaza un empuje que lleve una clave de ejemplo con forma real.
"""

import importlib.util
import json
import os
import sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
guardia = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config_opencode"] = guardia
ESPEC.loader.exec_module(guardia)


def _valor_clave_prueba():
    """«sk-» + 24 letras, montado por partes: jamás la cadena completa en el código."""
    return "".join(["sk", "-", "a" * 24])


CONFIG_LIMPIO = {
    "provider": {
        "nvidia": {"options": {"apiKey": "{env:STARSEED_NVIDIA_KEY}"}},
        "llm7": {"options": {"apiKey": "sin-clave"}},
    },
    "lsp": {"typescript": {"disabled": True}},
    "permission": {"bash": {"ask": "sorry-por-contrasenas"}},
}


@pytest.fixture
def cfg_limpio():
    return json.loads(json.dumps(CONFIG_LIMPIO))


def test_configuracion_limpia_sin_hallazgos(cfg_limpio):
    assert guardia.auditar_config_opencode(cfg_limpio) == []


def test_plugin_externo_bloquea_y_admitido_desaparece(cfg_limpio):
    cfg_limpio["plugin"] = ["oh-my-opencode-slim", "kilo-code"]
    hallazgos = guardia.auditar_config_opencode(cfg_limpio)
    externos = [h for h in hallazgos if h["id"] == "plugin-externo"]
    assert len(externos) == 2
    assert all(h["nivel"] == "bloquea" for h in externos)
    assert "oh-my-opencode-slim" in externos[0]["texto"]
    # Con ese nombre entre los admitidos, su hallazgo desaparece y el otro sigue.
    con_admitido = guardia.auditar_config_opencode(cfg_limpio, ["oh-my-opencode-slim"])
    externos_restantes = [h for h in con_admitido if h["id"] == "plugin-externo"]
    assert len(externos_restantes) == 1
    assert "kilo-code" in externos_restantes[0]["texto"]


def test_mcp_activo_avisa_y_solo_nombra_el_host(cfg_limpio):
    cfg_limpio["mcp"] = {"klavis": {"url": "https://api.klavis.ai/ruta/secreta?clave=1"}}
    hallazgos = guardia.auditar_config_opencode(cfg_limpio)
    mcp = [h for h in hallazgos if h["id"] == "mcp-activo"]
    assert len(mcp) == 1 and mcp[0]["nivel"] == "avisa"
    assert "api.klavis.ai" in mcp[0]["texto"]
    assert "ruta" not in mcp[0]["texto"] and "clave" not in mcp[0]["texto"]


def test_mcp_apagado_no_avisa(cfg_limpio):
    cfg_limpio["mcp"] = {"klavis": {"url": "https://api.klavis.ai", "enabled": False}}
    assert [h for h in guardia.auditar_config_opencode(cfg_limpio) if h["id"] == "mcp-activo"] == []


def test_clave_en_claro_bloquea_y_no_filtrada(cfg_limpio):
    valor = _valor_clave_prueba()
    cfg_limpio["provider"]["nvidia"]["options"]["apiKey"] = valor
    hallazgos = guardia.auditar_config_opencode(cfg_limpio)
    claves = [h for h in hallazgos if h["id"] == "clave-en-claro"]
    assert len(claves) == 1 and claves[0]["nivel"] == "bloquea"
    assert "nvidia" in claves[0]["texto"]
    # Solo la longitud: el valor no aparece en NI UNA parte del hallazgo.
    for campo in ("texto", "arreglo", "id", "nivel"):
        assert valor not in claves[0][campo]
    assert "longitud %d" % len(valor) in claves[0]["texto"]


def test_lsp_ausente_avisa(cfg_limpio):
    del cfg_limpio["lsp"]["typescript"]
    hallazgos = guardia.auditar_config_opencode(cfg_limpio)
    lsp = [h for h in hallazgos if h["id"] == "lsp-typescript"]
    assert len(lsp) == 1 and lsp[0]["nivel"] == "avisa"


def test_entrada_no_dict_config_ilegible():
    for entrada in ([], "texto", 17, None, {"__ilegible__": True}):
        hallazgos = guardia.auditar_config_opencode(entrada)
        assert len(hallazgos) == 1
        assert hallazgos[0]["id"] == "config-ilegible"
        assert hallazgos[0]["nivel"] == "bloquea"


def test_permission_sin_bash_avisa(cfg_limpio):
    cfg_limpio["permission"] = {"edit": {"deny": []}}
    hallazgos = guardia.auditar_config_opencode(cfg_limpio)
    vetos = [h for h in hallazgos if h["id"] == "sin-vetos-bash"]
    assert len(vetos) == 1 and vetos[0]["nivel"] == "avisa"
    # permission ausente o no dict → el mismo aviso.
    for config in ({}, {"permission": "sin formato"}):
        assert any(h["id"] == "sin-vetos-bash" for h in guardia.auditar_config_opencode(config))


def test_leer_config_archivo_ausente_y_json_roto(tmp_path):
    assert guardia.leer_config(str(tmp_path / "no_existe.json")) == {}
    roto = tmp_path / "roto.json"
    roto.write_text("{\"provider\": ", encoding="utf-8")
    assert guardia.leer_config(str(roto)) == {"__ilegible__": True}
    # El marcador lo convierte en hallazgo único que bloquea.
    hallazgos = guardia.auditar_config_opencode(guardia.leer_config(str(roto)))
    assert [h["id"] for h in hallazgos] == ["config-ilegible"]


def test_main_salida_json_parseable_y_codigo(cfg_limpio, tmp_path, monkeypatch, capsys):
    buen_archivo = tmp_path / "opencode.json"
    buen_archivo.write_text(json.dumps(cfg_limpio), encoding="utf-8")
    assert guardia.main([str(buen_archivo)]) == 0
    salida_buena = json.loads(capsys.readouterr().out)
    assert salida_buena == {"hallazgos": [], "bloquea": 0}

    cfg_limpio["plugin"] = ["oh-my-opencode-slim"]
    mal_archivo = tmp_path / "mal.json"
    mal_archivo.write_text(json.dumps(cfg_limpio), encoding="utf-8")
    assert guardia.main([str(mal_archivo)]) == 1
    salida_mala = json.loads(capsys.readouterr().out)
    assert salida_mala["bloquea"] >= 1
    assert any(h["id"] == "plugin-externo" for h in salida_mala["hallazgos"])


def test_plugins_de_entorno(monkeypatch):
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", " oh-my-opencode-slim , kilo-code,")
    assert guardia.plugins_de_entorno(os.environ["STARSEED_PLUGINS_OPENCODE_ADMITIDOS"]) == {
        "oh-my-opencode-slim",
        "kilo-code",
    }
    monkeypatch.delenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", raising=False)
    assert guardia.plugins_de_entorno("") == set()
