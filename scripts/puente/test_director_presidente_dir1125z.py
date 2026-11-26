"""DIR1125Z: el presidente renueva la lectura de límites de Claude cuando está vieja, y solo entonces."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_presidente as D  # noqa: E402
import limites_claude  # noqa: E402


def _preparar(monkeypatch, minutos):
    lecturas = {"n": 0}
    monkeypatch.setattr(limites_claude, "leer", lambda: {"lecturas": [{"t": "x"}], "leido": lecturas.__setitem__("n", lecturas["n"] + 1)})
    monkeypatch.setattr(limites_claude, "estado", lambda datos, ahora: {"lectura_hace_min": minutos})
    llamadas = []
    return lecturas, llamadas


def test_lectura_vieja_se_renueva_y_se_vuelve_a_leer(monkeypatch):
    lecturas, llamadas = _preparar(monkeypatch, 240)
    D.leer_limites(lector=lambda: llamadas.append(1))
    assert llamadas == [1] and lecturas["n"] == 2


def test_lectura_fresca_no_llama_al_lector(monkeypatch):
    lecturas, llamadas = _preparar(monkeypatch, 15)
    D.leer_limites(lector=lambda: llamadas.append(1))
    assert llamadas == [] and lecturas["n"] == 1


def test_sin_lectura_tambien_se_renueva(monkeypatch):
    lecturas, llamadas = _preparar(monkeypatch, None)
    D.leer_limites(lector=lambda: llamadas.append(1))
    assert llamadas == [1]
