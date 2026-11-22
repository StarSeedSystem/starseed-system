"""DIR1121H: tres avisos falsos de «te toca a ti» (Ollama del A1, Experiential Labs, apinex) y su causa."""
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


R = _cargar("renovador_dir1121h", "renovador-pasarelas.py")
A = _cargar("acciones_dir1121h", "acciones-de-alex.py")


def test_ollama_del_a1_no_se_sondea_por_una_direccion_privada_desde_la_mac():
    fila = [s for s in R.SONDAS if s[0] == "ollama-a1"][0]
    assert fila[1] == "local" and fila[2] is None


def test_el_estado_de_ollama_sale_del_a1(monkeypatch):
    monkeypatch.setattr(R, "_medio_ollama_a1", lambda: {"estado": "listo", "detalle": "A1 RUNNING · nodo MetaGenesis vivo"})
    http, cuerpo, viva = R.sondear("local", None, "qwen2.5:4b", 5, nombre="ollama-a1")
    assert (http, viva) == (200, True) and "A1" in cuerpo
    monkeypatch.setattr(R, "_medio_ollama_a1", lambda: {"estado": "requiere_alex", "detalle": "A1 no está RUNNING"})
    http, cuerpo, viva = R.sondear("local", None, "qwen2.5:4b", 5, nombre="ollama-a1")
    assert http == 503 and viva is False and http != 401


def test_una_pasarela_que_no_es_de_persona_nunca_pide_nada_a_alex():
    pas = [{"clave": "ollama-a1", "estado": "sin_clave", "http": 401, "modelo": "qwen2.5:4b"},
           {"clave": "groq", "estado": "sin_clave", "http": 401, "modelo": "x", "variable": "GROQ_API_KEY"}]
    ids = [a["id"] for a in A.construir_acciones(pas, set(), P.CATALOGO) if str(a.get("id", "")).startswith("pasarela-")]
    assert ids == ["pasarela-groq-sin_clave"]


class _Resp(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_experiential_labs_se_sonda_con_una_decision_no_con_un_chat(monkeypatch):
    visto = {}

    def falso(peticion, timeout=0):
        visto["url"] = peticion.full_url
        visto["cuerpo"] = json.loads(peticion.data.decode("utf-8"))
        return _Resp(json.dumps({"id": "decision_x", "model": "jev-latest", "answers": {"viva": {"type": "noul", "noul": 0.5}}}).encode())

    monkeypatch.setattr(R.urllib.request, "urlopen", falso)
    http, cuerpo, viva = R.sondear("https://api.experientiallabs.ai/v1", "clave-de-prueba", "jev-latest", 5, nombre="explabs")
    assert (http, viva) == (200, True)
    assert visto["url"].endswith("/v1/systemone") and "questions" in visto["cuerpo"] and "messages" not in visto["cuerpo"]


def test_experiential_labs_con_clave_rechazada_no_esta_viva(monkeypatch):
    def falso(peticion, timeout=0):
        raise urllib.error.HTTPError(peticion.full_url, 401, "Unauthorized", {}, io.BytesIO(b'{"error":{"message":"invalid api key"}}'))

    monkeypatch.setattr(R.urllib.request, "urlopen", falso)
    http, cuerpo, viva = R.sondear("https://api.experientiallabs.ai/v1", "mala", "jev-latest", 5, nombre="explabs")
    assert http == 401 and viva is False
    assert P.clasificar(http, cuerpo, viva) == P.SIN_CLAVE


def test_apinex_ya_no_manda_a_fichar():
    info = P.CATALOGO["apinex"]
    assert "top-up" in info["nota"] and "FICHAJE DIARIO" in info["nota"]
    cuerpo = '{"error":{"message":"Make a single top-up of $5 or more to unlock 25M free tokens daily for life.","type":"billing_error"}}'
    assert P.clasificar(402, cuerpo, False) == P.SIN_CUPO
