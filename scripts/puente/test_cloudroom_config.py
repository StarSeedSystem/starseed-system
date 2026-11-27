"""Pruebas del configurador de Cloudroom: lógica pura y órdenes simuladas (nunca se ejecuta room-cli)."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import cloudroom_config as C  # noqa: E402

CLAVES = {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"}
REPO = "/tmp/repo-starseed"


def estado(**extra):
    base = {
        "cli": "/usr/local/bin/room-cli",
        "nube": {
            "authenticated": True,
            "github": True,
            "harnesses": [{"id": "codex", "available": True, "connected": True}],
        },
        "proyectos": [{"id": "p1", "sources": [{"path": REPO}]}],
        "env": {"NVIDIA_API_KEY", "XKIRO_API_KEY"},
    }
    base.update(extra)
    return base


def config(**extra):
    base = {
        "activo": False,
        "repo": REPO,
        "setup": "/tmp/setup-nube.sh",
        "claves": dict(CLAVES),
        "modelos": ["nvidia/z-ai/glm-5.3"],
        "setup_aplicado_t": 0,
        "activado_t": 0,
    }
    base.update(extra)
    return base


def escribir(ruta, datos):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    return ruta


class Configuracion(unittest.TestCase):
    def test_defectos_lee_claves_y_modelos_de_la_config_de_pi(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = escribir(os.path.join(d, "pi.json"), {
                "claves": {"NVIDIA": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"},
                "modelos": ["nvidia/z-ai/glm-5.3", "  "],
            })
            cfg = C.defectos(ruta)
        self.assertEqual(cfg["claves"], CLAVES)
        self.assertEqual(cfg["modelos"], ["nvidia/z-ai/glm-5.3"])
        self.assertFalse(cfg["activo"])
        self.assertTrue(cfg["setup"].endswith("setup-nube.sh"))

    def test_leer_fusiona_lo_guardado_y_ignora_basura(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = escribir(os.path.join(d, "c.json"), {
                "activo": True, "repo": "  /x  ", "claves": {"NVIDIA": "K"},
                "setup_aplicado_t": 5, "basura": 1, "modelos": "no",
            })
            with mock.patch.object(C, "defectos", return_value=config()):
                cfg = C.leer(ruta)
        self.assertTrue(cfg["activo"])
        self.assertEqual(cfg["repo"], "/x")
        self.assertEqual(cfg["claves"], {"nvidia": "K"})
        self.assertEqual(cfg["setup_aplicado_t"], 5.0)
        self.assertEqual(cfg["modelos"], ["nvidia/z-ai/glm-5.3"])


class Plan(unittest.TestCase):
    def test_todo_listo_activa(self):
        plan = C.pasos(estado(), config())
        act = C.activacion(plan)
        self.assertTrue(act["activar"])
        self.assertEqual(act["faltan"], [])
        self.assertTrue(all(p["estado"] == "listo" for p in plan if p["id"] != "modelos"))
        self.assertIn("listo para activar", act["texto"])

    def test_sin_app_ni_sesion_no_activa(self):
        plan = C.pasos(estado(cli="", nube={}), config())
        act = C.activacion(plan)
        self.assertFalse(act["activar"])
        self.assertEqual(sorted(act["faltan"]), ["app", "sesion"])
        self.assertIn("aún no se puede activar", act["texto"])

    def test_clave_ausente_es_manual_y_trae_su_comando(self):
        plan = C.pasos(estado(env={"NVIDIA_API_KEY"}), config())
        paso = next(p for p in plan if p["id"] == "clave:XKIRO_API_KEY")
        self.assertEqual(paso["estado"], "falta")
        self.assertTrue(paso["manual"])
        self.assertEqual(paso["comando"], ["room-cli", "cloud", "env", "set", "XKIRO_API_KEY"])
        self.assertIn("valor por la entrada estándar", paso["detalle"])

    def test_proyecto_se_compara_por_ruta_real(self):
        with tempfile.TemporaryDirectory() as repo:
            plan = C.pasos(estado(proyectos=[{"id": "p1", "sources": [{"path": repo}]}]), config(repo=repo))
            self.assertEqual(next(p for p in plan if p["id"] == "proyecto")["estado"], "listo")
            otro = C.pasos(estado(proyectos=[{"id": "p1", "sources": [{"path": "/otra"}]}]), config(repo=repo))
            self.assertEqual(next(p for p in otro if p["id"] == "proyecto")["estado"], "requiere_alex")

    def test_modelos_listo_solo_si_el_setup_ya_se_aplico(self):
        plan = C.pasos(estado(), config(setup_aplicado_t=123))
        paso = next(p for p in plan if p["id"] == "modelos")
        self.assertEqual(paso["estado"], "listo")
        self.assertEqual(paso["entrada"], "/tmp/setup-nube.sh")

    def test_activacion_avisa_de_las_claves_que_quedan(self):
        plan = C.pasos(estado(env={"NVIDIA_API_KEY"}), config())
        act = C.activacion(plan)
        self.assertTrue(act["activar"])
        self.assertEqual(act["manuales"], ["clave:XKIRO_API_KEY"])
        self.assertIn("quedan claves", act["texto"])


class Maquina(unittest.TestCase):
    def test_configurar_aplica_el_setup_y_guarda_la_activacion(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = escribir(os.path.join(d, "config.json"), {"repo": REPO})
            setup = escribir(os.path.join(d, "setup.sh"), "echo ok\n")
            ordenes = []

            def falso(argv, **kw):
                ordenes.append((argv, kw))
                return type("P", (), {"returncode": 0, "stdout": "", "stderr": ""})()

            with mock.patch.object(C, "sondear", return_value=estado()), \
                    mock.patch.object(C, "SETUP", setup):
                r = C.configurar(aplicar=True, run=falso, ruta=ruta)

            self.assertTrue(r["activacion"]["activar"])
            self.assertIn("room-cli cloud setup set", r["aplicados"])
            self.assertEqual(ordenes[0][0], ["room-cli", "cloud", "setup", "set"])
            self.assertIn("stdin", ordenes[0][1])
            with open(ruta, encoding="utf-8") as f:
                guardado = json.load(f)
        self.assertTrue(guardado["activo"])
        self.assertGreater(guardado["setup_aplicado_t"], 0)

    def test_configurar_sin_aplicar_no_ejecuta_ni_escribe(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "config.json")

            def prohibido(*a, **k):
                raise AssertionError("no debía ejecutar room-cli")

            with mock.patch.object(C, "sondear", return_value=estado()), \
                    mock.patch.object(C, "defectos", return_value=config()):
                r = C.configurar(aplicar=False, run=prohibido, ruta=ruta)
            self.assertEqual(r["aplicados"], [])
            self.assertFalse(os.path.exists(ruta))
            self.assertTrue(r["activacion"]["activar"])

    def test_sondear_lee_nombres_de_claves_y_nunca_valores(self):
        with tempfile.TemporaryDirectory() as d:
            cli = escribir(os.path.join(d, "room-cli"), "")
            respuestas = {
                ("cloud", "status"): {"authenticated": True},
                ("project", "list"): [{"id": "p1", "sources": [{"path": REPO}]}],
                ("cloud", "env", "list"): {"variables": [{"name": "NVIDIA_API_KEY"}, {"name": "XKIRO_API_KEY"}]},
            }

            def falso(argv, **kw):
                datos = respuestas[tuple(argv[1:-1])]
                return type("P", (), {"returncode": 0, "stdout": json.dumps(datos), "stderr": ""})()

            e = C.sondear(run=falso, env={"CLOUDROOM_CLI": cli})
        self.assertEqual(e["cli"], cli)
        self.assertTrue(e["nube"]["authenticated"])
        self.assertEqual(e["env"], {"NVIDIA_API_KEY", "XKIRO_API_KEY"})
        self.assertEqual(e["proyectos"][0]["id"], "p1")

    def test_sondear_sin_app_no_ejecuta_nada(self):
        def prohibido(*a, **k):
            raise AssertionError("no debía ejecutar room-cli")

        with mock.patch("medio_cloudroom.cli_path", return_value=""):
            e = C.sondear(run=prohibido, env={})
        self.assertEqual(e, {"cli": "", "nube": None, "proyectos": None, "env": None})


    def test_configurar_sin_app_no_intenta_ejecutar_room_cli(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "config.json")

            def prohibido(*a, **k):
                raise AssertionError("no debía ejecutar room-cli")

            with mock.patch.object(C, "sondear", return_value=estado(cli="", nube={})), \
                    mock.patch.object(C, "defectos", return_value=config()):
                r = C.configurar(aplicar=True, run=prohibido, ruta=ruta)
        self.assertEqual(r["aplicados"], [])
        self.assertFalse(r["activacion"]["activar"])


if __name__ == "__main__":
    unittest.main()
