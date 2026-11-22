"""DIR1121F: `agy models` escribe «id<TAB>Nombre visible»; leer 0 modelos ponía el medidor en «sin sesión de Google»."""
import os
import subprocess
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import antigravity_flota as F  # noqa: E402

REAL = ("Fetching available models...\n"
        "gemini-4-neon-high\tGemini 4 Neon (High)\n"
        "gemini-4-neon-xhigh\tGemini 4 Neon (XHigh)\n"
        "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)\n"
        "claude-sonnet-5-5-medium\tClaude Sonnet 5.5 (Medium)\n"
        "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n")


def _con_salida(monkeypatch, texto, visto=None):
    def falso(argv, **k):
        if visto is not None:
            visto.update(k, argv=list(argv))
        return SimpleNamespace(returncode=0, stdout=texto, stderr="")
    monkeypatch.setattr(F.subprocess, "run", falso)


def test_lee_el_formato_real_con_tabuladores(monkeypatch):
    _con_salida(monkeypatch, REAL)
    modelos = F.obtener_modelos_agy()
    assert [m.nombre for m in modelos] == ["gemini-4-neon-high", "gemini-4-neon-xhigh", "gemini-3.8-flash-low",
                                           "claude-sonnet-5-5-medium", "gpt-oss-120b-medium"]
    assert modelos[0].descripcion == "Gemini 4 Neon (High)"
    assert (modelos[3].familia, modelos[3].nivel) == ("claude-sonnet-5-5", "medium")


def test_la_linea_de_aviso_no_es_un_modelo(monkeypatch):
    _con_salida(monkeypatch, "Fetching available models...\n")
    assert F.obtener_modelos_agy() == []


def test_el_formato_con_barras_sigue_valiendo(monkeypatch):
    _con_salida(monkeypatch, "gemini-4-hydrogen-high  |  Google  |  High context, reasoning\n")
    modelos = F.obtener_modelos_agy()
    assert len(modelos) == 1 and modelos[0].nombre == "gemini-4-hydrogen-high"
    assert modelos[0].descripcion == "High context, reasoning"


def test_la_llamada_no_espera_teclado(monkeypatch):
    visto = {}
    _con_salida(monkeypatch, REAL, visto)
    F.obtener_modelos_agy()
    assert visto["argv"] == ["agy", "models"] and visto.get("stdin") is subprocess.DEVNULL
