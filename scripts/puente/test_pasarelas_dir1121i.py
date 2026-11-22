"""DIR1121I: la sonda de agy que reventaba, «Ya lo hice» sin nombre, las «sin clave» que no usan clave y el «se repone sola» falso."""
import importlib.util
import inspect
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import pasarelas as P  # noqa: E402


def _cargar(nombre, archivo):
    spec = importlib.util.spec_from_file_location(nombre, os.path.join(AQUI, archivo))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


R = _cargar("renovador_dir1121i", "renovador-pasarelas.py")
A = _cargar("acciones_dir1121i", "acciones-de-alex.py")


class _Res:
    def __init__(self, rc, out):
        self.returncode, self.stdout, self.stderr = rc, out, ""


def test_la_sonda_local_no_vuelve_a_importar_os_dentro():
    assert "import os" not in inspect.getsource(R._sondear_local)


def test_la_sonda_de_antigravity_ejecuta_agy_y_exige_que_liste_modelos(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda n: sys.executable)
    visto = {}

    def falso(orden, **k):
        visto["orden"], visto["timeout"] = orden, k.get("timeout")
        return _Res(0, "Fetching available models...\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\n")

    monkeypatch.setattr(subprocess, "run", falso)
    http, cuerpo, viva = R.sondear("local", None, "gemini-3.8-flash-medium", 25, nombre="antigravity")
    assert (http, viva) == (200, True) and "UnboundLocalError" not in cuerpo
    assert visto["orden"] == [sys.executable, "models"] and visto["timeout"] >= 60
    assert P.clasificar(http, cuerpo, viva) == P.ESCRIBE


def test_agy_sin_sesion_no_cuenta_como_vivo(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda n: sys.executable)
    monkeypatch.setattr(subprocess, "run", lambda orden, **k: _Res(0, "Fetching available models...\n"))
    http, cuerpo, viva = R.sondear("local", None, "gemini-3.8-flash-medium", 25, nombre="antigravity")
    assert http == 401 and viva is False
    assert P.clasificar(http, cuerpo, viva) == P.SIN_CLAVE


def test_una_pasarela_sin_variable_de_clave_no_carece_de_clave(monkeypatch):
    monkeypatch.setattr(R, "SONDAS", [("ollama-a1", "local", None, "m"), ("groq", "https://ejemplo.invalid/v1", "GROQ_API_KEY", "m")])
    monkeypatch.setattr(R, "entorno_con_claves", lambda: {})
    monkeypatch.setattr(R, "sondear", lambda *a, **k: (200, "ok", True))
    monkeypatch.setattr(R, "_consejero_jev", lambda: None)
    filas = {f["clave"]: f for f in R.pasada(1)}
    assert filas["ollama-a1"]["tiene_clave"] is True
    assert filas["groq"]["tiene_clave"] is False


def test_ya_lo_hice_mide_con_el_nombre_de_la_pasarela():
    assert "nombre=clave" in inspect.getsource(A.resondear)


MEDIDOS = (
    "Make a single top-up of $5 or more to unlock 25M free tokens daily for life. Top up at https://apinex.bond/billing",
    "Your account balance is insufficient. Please recharge your account to continue using the API.",
    "Insufficient Balance (request_id: x)",
    "Purchase pre-paid credits to continue using Inference Providers.",
    "Your team x has either used all available credits or reached its monthly spending limit.",
)


def test_la_que_pide_recarga_no_se_anuncia_como_se_repone_sola():
    for m in MEDIDOS:
        assert P.pide_recarga(m), m
        a = P.accion_de("apinex", P.SIN_CUPO, m)
        assert "NO se repone sola" in a["texto"] and a["humano"] is False
    codex = "escritura: cuota de ChatGPT agotada · la CLI: try again at Nov 22nd, 2026 7:45 PM"
    assert not P.pide_recarga(codex)
    assert P.accion_de("codex", P.SIN_CUPO, codex)["texto"] == "sin cupo hoy: se repone sola, apártala hasta mañana"
    assert P.accion_de("apinex", P.SIN_CUPO)["texto"] == "sin cupo hoy: se repone sola, apártala hasta mañana"
    texto = P.informe([{"clave": "apinex", "modelo": "x", "estado": P.SIN_CUPO, "mensaje": MEDIDOS[0]}])
    assert "NO se repone sola" in texto
    assert P.para_abrir([{"clave": "apinex", "estado": P.SIN_CUPO, "mensaje": MEDIDOS[0]}]) == []
