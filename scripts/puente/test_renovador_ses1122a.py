# -*- coding: utf-8 -*-
"""SES1122A: una sonda con un modelo retirado no condena a la pasarela.

Medido el 22-11 00:20: openrouter, xkiro, tokenrouter y opencode-zen salían
«modelo_fuera» porque SONDAS usaba un id que su catálogo ya había retirado. La
pasarela estaba viva. Ahora, ante MODELO_FUERA, se pide su catálogo y se repite
la sonda UNA vez con un gratuito vigente; el informe guarda `modelo` (el usado)
y `modelo_anterior`.
"""
import importlib.util
import io
import json
import os
import sys
import urllib.error

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import pasarelas as P  # noqa: E402


def _cargar(nombre, archivo):
    spec = importlib.util.spec_from_file_location(nombre, os.path.join(AQUI, archivo))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


R = _cargar("renovador_ses1122a", "renovador-pasarelas.py")


class _Resp(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _catalogo(*ids, con_precio=False):
    filas = []
    for mid in ids:
        fila = {"id": mid}
        if con_precio:
            fila["pricing"] = {"prompt": "0", "completion": "0"}
        filas.append(fila)
    return {"data": filas}


# ── la decisión, pura ────────────────────────────────────────────────────────

def test_elige_un_gratuito_vigente_y_no_el_retirado():
    datos = _catalogo("de-pago/modelo", "qwen/qwen3-coder-plus:free", "z-ai/glm-5.3-free")
    elegido = P.elegir_modelo_gratuito(datos, "viejo/retirado:free")
    assert elegido in ("qwen/qwen3-coder-plus:free", "z-ai/glm-5.3-free")


def test_el_modelo_anterior_nunca_se_repite():
    datos = _catalogo("viejo/retirado:free", "nuevo/vivo:free")
    assert P.elegir_modelo_gratuito(datos, "viejo/retirado:free") == "nuevo/vivo:free"
    assert P.elegir_modelo_gratuito(_catalogo("viejo/retirado:free"), "viejo/retirado:free") == ""


def test_entiende_el_catalogo_de_openrouter_por_su_precio():
    datos = {
        "data": [
            {"id": "google/gemini-3.5-flash", "pricing": {"prompt": "0.3", "completion": "2.5"}},
            {"id": "deepseek/deepseek-v4:free", "pricing": {"prompt": "0", "completion": "0"}},
        ]
    }
    assert P.elegir_modelo_gratuito(datos, "") == "deepseek/deepseek-v4:free"


def test_acepta_la_clave_models_y_el_catalogo_roto():
    assert P.elegir_modelo_gratuito({"models": [{"id": "x/free-model"}]}, "") == "x/free-model"
    assert P.elegir_modelo_gratuito(None, "") == ""
    assert P.elegir_modelo_gratuito({"data": [{"id": "solo/de-pago"}]}, "") == ""


# ── la E/S: una segunda sonda y ni una más ───────────────────────────────────

def _montar(monkeypatch, respuestas, catalogo=None):
    """Fake de urlopen: /models devuelve el catálogo; chat/completions, la cola dada."""
    visto = {"chat": [], "catalogo": 0}

    def falso(peticion, timeout=0):
        url = peticion.full_url
        if url.endswith("/models"):
            visto["catalogo"] += 1
            return _Resp(json.dumps(catalogo if catalogo is not None else _catalogo("nuevo/vivo:free")).encode())
        modelo = json.loads(peticion.data.decode("utf-8"))["model"]
        visto["chat"].append(modelo)
        codigo, cuerpo = respuestas[min(len(visto["chat"]) - 1, len(respuestas) - 1)]
        if codigo == 200:
            return _Resp(cuerpo.encode())
        raise urllib.error.HTTPError(url, codigo, "error", {}, io.BytesIO(cuerpo.encode()))

    monkeypatch.setattr(R.urllib.request, "urlopen", falso)
    monkeypatch.setattr(R, "SONDAS", [("xkiro", "https://api.xkiro.com/v1", "XKIRO_API_KEY", "viejo/retirado:free")])
    monkeypatch.setattr(R, "entorno_con_claves", lambda: {"XKIRO_API_KEY": "clave"})
    monkeypatch.setattr(R, "_consejero_jev", lambda: None)
    return visto


CUERPO_VIEJO = '{"error":{"message":"The model `viejo/retirado:free` does not exist"}}'
CUERPO_VIVO = '{"choices":[{"message":{"content":"ok"}}]}'


def test_ante_modelo_fuera_se_repite_una_vez_con_uno_del_catalogo(monkeypatch):
    visto = _montar(monkeypatch, [(404, CUERPO_VIEJO), (200, CUERPO_VIVO)])
    fila = R.pasada(1)[0]
    assert visto["chat"] == ["viejo/retirado:free", "nuevo/vivo:free"]
    assert visto["catalogo"] == 1
    assert fila["modelo"] == "nuevo/vivo:free"
    assert fila["modelo_anterior"] == "viejo/retirado:free"
    assert fila["estado"] == P.ESCRIBE


def test_si_la_pasarela_ya_escribe_no_pide_catalogo_ni_repite(monkeypatch):
    visto = _montar(monkeypatch, [(200, CUERPO_VIVO)])
    fila = R.pasada(1)[0]
    assert visto["chat"] == ["viejo/retirado:free"]
    assert visto["catalogo"] == 0
    assert fila["modelo"] == "viejo/retirado:free"
    assert "modelo_anterior" not in fila


def test_si_el_catalogo_no_tiene_gratuitos_no_hay_segunda_sonda(monkeypatch):
    visto = _montar(monkeypatch, [(404, CUERPO_VIEJO)], catalogo=_catalogo("solo/de-pago"))
    fila = R.pasada(1)[0]
    assert visto["chat"] == ["viejo/retirado:free"]
    assert visto["catalogo"] == 1
    assert fila["modelo"] == "viejo/retirado:free"
    assert fila["estado"] == P.MODELO_FUERA


def test_la_segunda_sonda_tambien_fuera_no_se_repite_una_tercera_vez(monkeypatch):
    visto = _montar(monkeypatch, [(404, CUERPO_VIEJO), (404, CUERPO_VIEJO)])
    fila = R.pasada(1)[0]
    assert visto["chat"] == ["viejo/retirado:free", "nuevo/vivo:free"]
    assert fila["modelo"] == "nuevo/vivo:free"
    assert fila["modelo_anterior"] == "viejo/retirado:free"
