# -*- coding: utf-8 -*-
"""Pruebas de la guardia de la configuración de opencode (Ola 1025R · AGT1025E).

Todo puro: la config real de la Mac nunca se toca (tmp_path para `main` y
`leer_config`). Cualquier cadena con forma de clave se monta en tiempo de
ejecución, porque GitHub rechaza el empuje de una clave de ejemplo con forma
real (regla de la casa).
"""

import importlib.util
import json
import os
import sys

import pytest

RUTA = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py"
)
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
guardia = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config_opencode"] = guardia
ESPEC.loader.exec_module(guardia)


def config_limpia():
    """La config que escribe el orquestador: {env:…}, plugin admitido, MCP
    desactivado, lsp apagado y vetos bash."""
    return {
        "plugin": ["puente-de-mando"],
        "provider": {
            "nvidia": {
                "options": {
                    "baseURL": "https://integrate.api.nvidia.com/v1",
                    "apiKey": "{env:NVIDIA_API_KEY}",
                },
                "models": {"kimi-k3": {"name": "kimi-k3"}},
            },
            "llm7": {"options": {"baseURL": "https://llm7.io/v1", "apiKey": "sin-clave"}},
        },
        "mcp": {"gh-grep": {"enabled": False, "url": "https://apagado.example/ruta"}},
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": ["veto-1", "veto-2"]},
    }


def test_config_limpia_del_enjambre_no_da_hallazgos():
    assert guardia.auditar_config_opencode(config_limpia(), ("puente-de-mando",)) == []


def test_plugin_externo_bloquea_y_nombra_la_entrada():
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    hallazgos = guardia.auditar_config_opencode(cfg, ("puente-de-mando",))
    assert [(h["id"], h["nivel"]) for h in hallazgos] == [("plugin-externo", "bloquea")]
    assert "oh-my-opencode-slim" in hallazgos[0]["texto"]


def test_plugin_declared_en_admitidos_desaparece():
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    assert guardia.auditar_config_opencode(cfg, ("oh-my-opencode-slim",)) == []


def test_mcp_remoto_activo_avisa_con_solo_el_host():
    cfg = config_limpia()
    # Host, ruta y parámetros de una URL de MCP (ficticia y sin secretos).
    cfg["mcp"] = {"context7": {"url": "https://mcp.ejemplo.dev/ruta/larga?tok=1"}}
    hallazgos = guardia.auditar_config_opencode(cfg, ("puente-de-mando",))
    h = hallazgos[0]
    assert (h["id"], h["nivel"]) == ("mcp-activo", "avisa")
    assert "gasta contexto en cada turno" in h["texto"]
    assert "mcp.ejemplo.dev" in h["texto"]
    assert "/ruta" not in h["texto"]
    assert "tok=1" not in h["texto"]


def test_api_key_claro_bloquea_con_longitud_sin_valor():
    cfg = config_limpia()
    # Montada en tiempo de ejecución: nunca una clave de ejemplo con forma real.
    clave = "sk" + "-" + "a" * 24
    cfg["provider"]["nvidia"]["options"]["apiKey"] = clave
    hallazgos = guardia.auditar_config_opencode(cfg, ("puente-de-mando",))
    assert [(h["id"], h["nivel"]) for h in hallazgos] == [("clave-en-claro", "bloquea")]
    h = hallazgos[0]
    assert "nvidia" in h["texto"]
    assert str(len(clave)) in h["texto"]
    for campo in ("texto", "arreglo"):
        assert clave not in h[campo]
        assert "aaaaaa" not in h[campo]


def test_lsp_ausente_avisa():
    cfg = config_limpia()
    del cfg["lsp"]
    hallazgos = guardia.auditar_config_opencode(cfg, ("puente-de-mando",))
    assert [(h["id"], h["nivel"]) for h in hallazgos] == [("lsp-typescript", "avisa")]
    h = hallazgos[0]
    assert (h["id"], h["nivel"]) == ("lsp-typescript", "avisa")
    assert "~2 GB" in h["texto"]


def test_permission_ausente_y_no_dict_avisan():
    sin_permisos = config_limpia()
    del sin_permisos["permission"]
    permisos_mal = config_limpia()
    permisos_mal["permission"] = "veto-pendiente"
    for cfg in (sin_permisos, permisos_mal):
        hallazgos = guardia.auditar_config_opencode(cfg, ("puente-de-mando",))
        assert [(h["id"], h["nivel"]) for h in hallazgos] == [
            ("sin-vetos-bash", "avisa")
        ]


def test_entrada_que_no_es_dict_bloquea_como_ilegible():
    for crudo in (None, [1, 2], "texto", {"__ilegible__": True}):
        hallazgos = guardia.auditar_config_opencode(crudo)
        assert [(h["id"], h["nivel"]) for h in hallazgos] == [
            ("config-ilegible", "bloquea")
        ]


def test_leer_config_archivo_ausente(tmp_path):
    assert guardia.leer_config(str(tmp_path / "no-esta.json")) == {}


def test_leer_config_json_roto(tmp_path):
    roto = tmp_path / "opencode-roto.json"
    roto.write_text("{plugin: sin cierre", encoding="utf-8")
    marcado = guardia.leer_config(str(roto))
    assert marcado.get("__ilegible__") is True
    hallazgos = guardia.auditar_config_opencode(marcado)
    assert [h["id"] for h in hallazgos] == ["config-ilegible"]


def test_main_entorno_y_salida_json(tmp_path, capsys, monkeypatch):
    limpio = tmp_path / "limpio.json"
    limpio.write_text(json.dumps(config_limpia()), encoding="utf-8")
    monkeypatch.setenv("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "puente-de-mando")
    assert guardia.main([str(limpio)]) == 0
    assert json.loads(capsys.readouterr().out) == {"hallazgos": [], "bloquea": 0}

    externo = tmp_path / "externo.json"
    cfg = config_limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    externo.write_text(json.dumps(cfg), encoding="utf-8")
    monkeypatch.setenv(
        "STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "puente-de-mando,xkiro-guardia"
    )
    assert guardia.main([str(externo)]) == 1
    datos = json.loads(capsys.readouterr().out)
    assert datos["bloquea"] == 1
    assert datos["hallazgos"][0]["id"] == "plugin-externo"
