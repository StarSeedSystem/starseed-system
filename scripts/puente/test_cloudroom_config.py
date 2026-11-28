"""Pruebas de `cloudroom_config` (CAP1119): la decisión es pura y room-cli va simulado.
Nunca se ejecuta room-cli, no se sale a la red y no se lee ni escribe una clave."""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import cloudroom_config as C  # noqa: E402

CLAVES = {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY", "gemini": "GEMINI_API_KEY"}
NUBE = {"authenticated": True, "account": {"name": "Maggasukha"}}
TODO = {"variables": [{"name": n} for n in CLAVES.values()]}


def correr(respuestas=None):
    """room-cli simulado: {args: (código, stdout, stderr)}; devuelve (run, llamadas)."""
    respuestas, llamadas = respuestas or {}, []

    def run(orden, input=None, capture_output=True, text=True, timeout=None):
        llamadas.append((list(orden), input))
        codigo, salida, error = respuestas.get(tuple(orden), (0, "null", ""))
        return subprocess.CompletedProcess(orden, codigo, salida, error)
    return run, llamadas


def test_sin_app_no_puede_configurar():
    r = C.informe(None, None, None, CLAVES)
    assert r["estado"] == "sin_app"
    assert r["puede_configurar"] is False
    assert "instala Cloudroom" in r["siguiente_paso"]


def test_sin_sesion_es_de_maggasukha():
    r = C.informe({}, {"authenticated": False}, None, CLAVES)
    assert r["estado"] == "sin_sesion"
    assert r["puede_configurar"] is False
    assert "Maggasukha" in r["siguiente_paso"]


def test_sin_respuesta_de_la_cuenta():
    r = C.informe({"running": True}, None, None, CLAVES)
    assert r["estado"] == "sin_respuesta"
    assert r["puede_configurar"] is False


def test_sin_setup_no_aplica_nada():
    r = C.informe({}, NUBE, TODO, CLAVES, setup_ok=False)
    assert r["estado"] == "sin_setup"
    assert r["puede_configurar"] is False


def test_faltan_claves_y_solo_se_nombran():
    env = {"variables": [{"name": "XKIRO_API_KEY"}]}
    r = C.informe({}, NUBE, env, CLAVES)
    assert r["estado"] == "sin_claves"
    assert r["faltan"] == ["GEMINI_API_KEY", "NVIDIA_API_KEY"]
    assert "room-cli cloud env set GEMINI_API_KEY" in r["siguiente_paso"]
    assert r["puede_configurar"] is True


def test_entorno_ilegible_no_culpa_a_nadie():
    r = C.informe({}, NUBE, None, CLAVES)
    assert r["estado"] == "configurado"
    assert r["faltan"] == []


def test_configurado_con_sesion_setup_y_claves():
    r = C.informe({}, NUBE, TODO, CLAVES)
    assert r["estado"] == "configurado"
    assert r["puede_configurar"] is True
    assert r["siguiente_paso"].startswith("nada:")


def test_github_solo_cuenta_si_lo_dice_explicito():
    assert C.informe({}, NUBE, TODO, CLAVES, github=False)["estado"] == "sin_repo"
    assert C.informe({}, NUBE, TODO, CLAVES, github=True)["estado"] == "configurado"
    assert C.informe({}, NUBE, TODO, CLAVES, github=None)["estado"] == "configurado"


def test_orden_setup_es_la_verificada():
    assert C.orden_setup("room-cli") == ["room-cli", "cloud", "setup", "set"]


def test_seco_no_ejecuta_room_cli():
    run, llamadas = correr()
    r = C.configurar(run, "room-cli", "echo hola", CLAVES, lambda: ({}, NUBE, TODO), seco=True)
    assert r["aplicado"] is False
    assert llamadas == []


def test_sin_sesion_no_ejecuta_room_cli():
    run, llamadas = correr()
    r = C.configurar(run, "room-cli", "echo hola", CLAVES,
                     lambda: ({}, {"authenticated": False}, TODO))
    assert r["aplicado"] is False
    assert llamadas == []


def test_configurar_aplica_setup_y_verifica():
    run, llamadas = correr({("room-cli", "cloud", "setup", "set"): (0, "{}", "")})
    r = C.configurar(run, "room-cli", "echo hola", CLAVES, lambda: ({}, NUBE, TODO))
    assert r["estado"] == "configurado"
    assert r["aplicado"] is True
    assert llamadas == [(["room-cli", "cloud", "setup", "set"], "echo hola")]


def test_fallo_del_setup_no_se_tapa():
    run, _ = correr({("room-cli", "cloud", "setup", "set"): (1, "", "cuenta sin sesión\nboom")})
    r = C.configurar(run, "room-cli", "echo hola", CLAVES, lambda: ({}, NUBE, TODO))
    assert r["aplicado"] is False
    assert r["error"] == "boom"
