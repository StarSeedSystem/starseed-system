# -*- coding: utf-8 -*-
"""Pruebas de la guardia de configuración de opencode (pura, sin red ni reloj)."""

import importlib.util
import json
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auditar_config_opencode.py")
ESPEC = importlib.util.spec_from_file_location("auditar_config_opencode", RUTA)
modulo = importlib.util.module_from_spec(ESPEC)
sys.modules["auditar_config_opencode"] = modulo
ESPEC.loader.exec_module(modulo)

APIKEY_ENV = "{env:STARSEED_PASARELA_APINEX_KEY}"


def _limpia() -> dict:
    """Configuración sana del enjambre: clave por entorno, lsp apagado y vetos de bash."""
    return {
        "provider": {"apinex": {"options": {"apiKey": APIKEY_ENV}}},
        "lsp": {"typescript": {"disabled": True}},
        "permission": {"bash": {"rm": "deny"}},
    }


def _ids(hallazgos: list[dict]) -> list[str]:
    return [h["id"] for h in hallazgos]

def test_config_limpia() -> None:
    assert modulo.auditar_config_opencode(_limpia()) == []


def test_plugin_externo_bloquea_y_admitido_desaparece() -> None:
    cfg = _limpia()
    cfg["plugin"] = ["oh-my-opencode-slim"]
    hallazgos = modulo.auditar_config_opencode(cfg)
    assert _ids(hallazgos) == ["plugin-externo"]
    assert hallazgos[0]["nivel"] == "bloquea"
    assert "oh-my-opencode-slim" in hallazgos[0]["texto"]
    assert modulo.auditar_config_opencode(cfg, ("oh-my-opencode-slim",)) == []

def test_mcp_remoto_avisa_y_solo_da_el_host() -> None:
    cfg = _limpia()
    cfg["mcp"] = {
        "remoto": {
            "enabled": True,
            "url": "https://mcp.ejemplo.com/ruta/privada?token=secreto",
        }
    }
    hallazgos = modulo.auditar_config_opencode(cfg)
    assert _ids(hallazgos) == ["mcp-activo"]
    texto = hallazgos[0]["texto"]
    assert hallazgos[0]["nivel"] == "avisa"
    assert "mcp.ejemplo.com" in texto
    assert "/ruta/privada" not in texto
    assert "token" not in texto
    assert "secreto" not in texto
    assert "contexto en cada turno" in texto


def test_clave_en_claro_no_filtra_el_valor() -> None:
    valor = "".join(["sk", "-", "a" * 24])
    cfg = _limpia()
    cfg["provider"]["apinex"]["options"]["apiKey"] = valor
    hallazgos = modulo.auditar_config_opencode(cfg)
    assert _ids(hallazgos) == ["clave-en-claro"]
    hallazgo = hallazgos[0]
    assert hallazgo["nivel"] == "bloquea"
    assert "apinex" in hallazgo["texto"]
    assert str(len(valor)) in hallazgo["texto"]
    assert valor not in hallazgo["texto"]
    assert valor not in hallazgo["arreglo"]
    assert valor not in json.dumps(hallazgo, ensure_ascii=False)

def test_lsp_ausente_avisa() -> None:
    cfg = _limpia()
    del cfg["lsp"]
    hallazgos = modulo.auditar_config_opencode(cfg)
    assert _ids(hallazgos) == ["lsp-typescript"]
    assert hallazgos[0]["nivel"] == "avisa"
    assert "2 GB" in hallazgos[0]["texto"]


def test_entrada_que_no_es_dict() -> None:
    hallazgos = modulo.auditar_config_opencode(["no", "es", "dict"])
    assert _ids(hallazgos) == ["config-ilegible"]
    assert hallazgos[0]["nivel"] == "bloquea"


def test_leer_config_archivo_ausente(tmp_path) -> None:
    assert modulo.leer_config(str(tmp_path / "no-existe.json")) == {}


def test_leer_config_json_roto(tmp_path) -> None:
    ruta = tmp_path / "roto.json"
    ruta.write_text("{no es json", encoding="utf-8")
    assert modulo.leer_config(str(ruta)) == {"__ilegible__": True}
    hallazgos = modulo.auditar_config_opencode(modulo.leer_config(str(ruta)))
    assert _ids(hallazgos) == ["config-ilegible"]

def test_main_devuelve_cero_con_config_limpia(tmp_path, capsys) -> None:
    ruta = tmp_path / "opencode.json"
    ruta.write_text(json.dumps(_limpia()), encoding="utf-8")
    codigo = modulo.main([str(ruta)])
    salida = json.loads(capsys.readouterr().out)
    assert codigo == 0
    assert salida["bloquea"] == 0
    assert salida["hallazgos"] == []


def test_main_devuelve_uno_si_bloquea(tmp_path, capsys) -> None:
    cfg = _limpia()
    cfg["plugin"] = ["externo"]
    ruta = tmp_path / "opencode.json"
    ruta.write_text(json.dumps(cfg), encoding="utf-8")
    codigo = modulo.main([str(ruta)])
    salida = json.loads(capsys.readouterr().out)
    assert codigo == 1
    assert salida["bloquea"] == 1
