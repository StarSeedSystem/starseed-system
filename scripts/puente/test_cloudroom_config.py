# -*- coding: utf-8 -*-
"""Pruebas de `cloudroom_config` (CAP-cloudroom-config): configuración y prueba de Cloudroom.
Todo puro: sin room-cli, sin red y sin leer la config real de la máquina."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as CC  # noqa: E402

CONFIG = {
    "modelos": ["nvidia/z-ai/glm-5.3", "xkiro/qwen/qwen3-coder-plus:free", "gemini/gemini-3.6-flash"],
    "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY", "gemini": "GEMINI_API_KEY"},
}
LOCAL = {"running": True, "port": 5123}
NUBE = {"authenticated": True}
PROYECTOS = [{"id": "p1", "sources": [{"path": "/repo"}]}]


def env(*nombres):
    return {"variables": [{"name": n} for n in nombres]}


class TestEnvNombres:
    def test_lee_los_nombres(self):
        assert CC.env_nombres(env("NVIDIA_API_KEY")) == {"NVIDIA_API_KEY"}

    def test_lista_ilegible_es_none(self):
        assert CC.env_nombres("no-json") is None
        assert CC.env_nombres({}) is None


class TestClaves:
    def test_detecta_las_que_faltan(self):
        assert CC.claves_faltantes(CONFIG, {"NVIDIA_API_KEY"}) == [
            ("gemini", "GEMINI_API_KEY"), ("xkiro", "XKIRO_API_KEY")]

    def test_sin_lectura_no_acusa_a_nadie(self):
        assert CC.claves_faltantes(CONFIG, None) == []

    def test_todas_presentes(self):
        nombres = {"NVIDIA_API_KEY", "XKIRO_API_KEY", "GEMINI_API_KEY"}
        assert CC.claves_faltantes(CONFIG, nombres) == []


class TestModelos:
    def test_solo_los_que_tienen_su_clave(self):
        assert CC.modelos_disponibles(CONFIG, {"NVIDIA_API_KEY"}) == ["nvidia/z-ai/glm-5.3"]

    def test_sin_lectura_se_quedan_todos(self):
        assert len(CC.modelos_disponibles(CONFIG, None)) == 3


class TestInforme:
    def test_sin_app_no_disponible(self):
        r = CC.interpretar(CONFIG, None, None, None, None, None)
        assert r["estado"] == "no_disponible" and not r["listo"]
        assert any("instala" in s for s in r["siguiente"])

    def test_sin_sesion_requiere_a_alex(self):
        r = CC.interpretar(CONFIG, LOCAL, {"authenticated": False}, {"count": 0}, set(), [])
        assert r["estado"] == "requiere_alex"
        assert any("inicia sesión" in s for s in r["siguiente"])

    def test_configurado_y_listo(self):
        nombres = {"NVIDIA_API_KEY", "XKIRO_API_KEY", "GEMINI_API_KEY"}
        r = CC.interpretar(CONFIG, LOCAL, NUBE, {"count": 2}, nombres, PROYECTOS)
        assert r["listo"] is True and r["estado"] == "listo"
        assert r["proyecto"] == "p1"
        assert len(r["modelos"]) == 3

    def test_sin_claves_ni_proyecto_no_esta_listo(self):
        r = CC.interpretar(CONFIG, LOCAL, NUBE, {"count": 0}, set(), [])
        assert r["listo"] is False
        assert {p for p, _v in r["claves_faltantes"]} == {"nvidia", "xkiro", "gemini"}
        assert any("proyecto" in p for p in r["problemas"])

    def test_el_texto_dice_el_estado_y_lo_que_falta(self):
        r = CC.interpretar(CONFIG, LOCAL, NUBE, {"count": 0}, {"NVIDIA_API_KEY"}, [])
        t = CC.texto_informe(r)
        assert "Cloudroom" in t and "NVIDIA_API_KEY" not in t
        assert "GEMINI_API_KEY" in t


class TestConfigurar:
    def test_aplica_el_setup_por_la_entrada_estandar(self):
        visto = {}

        def falso(orden, **kw):
            visto["orden"], visto["input"] = orden, kw.get("input")
            return type("P", (), {"returncode": 0, "stdout": "ok", "stderr": ""})()

        r = CC.configurar(run=falso, cli="room-cli", ruta_setup=__file__)
        assert r["ok"] is True and r["aplicado"] is True
        assert visto["orden"] == ["room-cli", "cloud", "setup", "set"]
        assert "Pruebas" in visto["input"]

    def test_sin_cli_no_ejecuta_nada(self):
        def rompe(*_a, **_k):
            raise AssertionError("no debió ejecutar room-cli")

        r = CC.configurar(run=rompe, cli="")
        assert r["ok"] is False and "instalar" in r["detalle"]

    def test_si_el_comando_falla_lo_dice(self):
        def falso(_orden, **_kw):
            return type("P", (), {"returncode": 1, "stdout": "", "stderr": "sin sesión"})()

        r = CC.configurar(run=falso, cli="room-cli", ruta_setup=__file__)
        assert r["ok"] is False and "sin sesión" in r["detalle"]
