import medir_dispersion_activaciones as m


def test_ram_libre_gb_ejemplo():
    txt = "MemTotal:       16384000 kB\nMemFree:        1024000 kB\nMemAvailable:   8192000 kB\n"
    assert abs(m.ram_libre_gb(txt) - 8.0) < 1e-6


def test_ram_libre_gb_vacio():
    assert m.ram_libre_gb("") == 0.0


def test_resumir_tres_tramos():
    capas = [
        {"capa": 0, "cero_exacto": 0.8, "casi_cero": 0.8},
        {"capa": 1, "cero_exacto": 0.5, "casi_cero": 0.55},
        {"capa": 2, "cero_exacto": 0.3, "casi_cero": 0.35},
    ]
    r = m.resumir(capas)
    assert abs(r["media_casi_cero"] - (0.8 + 0.55 + 0.35) / 3) < 1e-9
    assert r["veredicto"].startswith("marginal")
    r2 = m.resumir([{"capa": 0, "cero_exacto": 0.9, "casi_cero": 0.75}])
    assert r2["veredicto"].startswith("alta")
    r3 = m.resumir([{"capa": 0, "cero_exacto": 0.1, "casi_cero": 0.3}])
    assert r3["veredicto"].startswith("baja")


def test_resumir_vacio():
    r = m.resumir([])
    assert r["veredicto"] == "sin datos"


def test_prompts_es_tiene_12():
    assert isinstance(m.PROMPTS_ES, list)
    assert len(m.PROMPTS_ES) == 12
    assert all(isinstance(p, str) and p.strip() for p in m.PROMPTS_ES)


def test_main_bajo_umbral_sin_forzar_no_importa_torch(tmp_path):
    def fake_meminfo():
        return "MemAvailable:   4000000 kB\n"

    salida = tmp_path / "out.json"
    rc = m.main(["--salida", str(salida)], leer_meminfo=fake_meminfo)
    assert rc == 2
    assert not salida.exists()
