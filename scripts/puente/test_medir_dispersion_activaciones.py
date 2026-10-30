"""Pruebas de medir_dispersion_activaciones. No importan torch."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from medir_dispersion_activaciones import PROMPTS_ES, main, ram_libre_gb, resumir

MEMINFO_EJEMPLO = """MemTotal: 16384000 kB
MemFree: 2048000 kB
MemAvailable: 8388608 kB
Buffers: 123456 kB
"""


def test_ram_libre_gb_lee_memavailable():
    assert ram_libre_gb(MEMINFO_EJEMPLO) == 8.0


def test_ram_libre_gb_sin_datos():
    assert ram_libre_gb("") == 0.0
    assert ram_libre_gb("MemTotal: 1000 kB\n") == 0.0


def test_resumir_alta():
    capas = [
        {"capa": 0, "cero_exacto": 0.90, "casi_cero": 0.80},
        {"capa": 1, "cero_exacto": 0.85, "casi_cero": 0.75},
    ]
    resumen = resumir(capas)
    assert resumen["veredicto"].startswith("alta")
    assert resumen["media_casi_cero"] == 0.775
    assert resumen["media_cero_exacto"] == 0.875
    assert resumen["peor_capa"] == 1
    assert resumen["mejor_capa"] == 0


def test_resumir_marginal():
    capas = [
        {"capa": 0, "cero_exacto": 0.50, "casi_cero": 0.60},
        {"capa": 1, "cero_exacto": 0.40, "casi_cero": 0.40},
    ]
    assert resumir(capas)["veredicto"].startswith("marginal")


def test_resumir_baja():
    capas = [
        {"capa": 0, "cero_exacto": 0.20, "casi_cero": 0.20},
        {"capa": 1, "cero_exacto": 0.10, "casi_cero": 0.10},
    ]
    assert resumir(capas)["veredicto"].startswith("baja")


def test_resumir_sin_capas():
    resumen = resumir([])
    assert resumen["veredicto"] == "sin datos"
    assert resumen["media_casi_cero"] == 0.0
    assert resumen["peor_capa"] is None
    assert resumen["mejor_capa"] is None


def test_prompts_es_son_doce():
    assert len(PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in PROMPTS_ES)


def test_main_sin_ram_no_importa_torch(tmp_path):
    sys.modules.pop("torch", None)
    salida = tmp_path / "dispersion.json"
    codigo = main(
        ["--salida", str(salida)],
        leer_meminfo=lambda: "MemAvailable: 1048576 kB\n",
    )
    assert codigo == 2
    assert not salida.exists()
    assert "torch" not in sys.modules


def test_main_escribe_json_con_las_claves(monkeypatch, tmp_path):
    import medir_dispersion_activaciones as modulo

    capas = [{"capa": 0, "cero_exacto": 0.9, "casi_cero": 0.8}]
    monkeypatch.setattr(
        modulo, "medir",
        lambda modelo, prompts: {"capas": capas, "tokens": 3, "nota": ""},
    )
    salida = tmp_path / "dispersion.json"
    codigo = modulo.main(
        ["--salida", str(salida)],
        leer_meminfo=lambda: MEMINFO_EJEMPLO,
    )
    assert codigo == 0
    datos = json.loads(salida.read_text(encoding="utf-8"))
    assert set(datos) == {
        "modelo", "fecha", "n_prompts", "tokens", "capas", "resumen", "nota",
    }
    assert datos["n_prompts"] == 12
    assert datos["resumen"]["veredicto"].startswith("alta")
