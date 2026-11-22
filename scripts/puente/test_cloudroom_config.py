#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de cloudroom_config: configuración, claves y activación, sin room-cli ni red."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as C  # noqa: E402

CONFIG = {
    "modelos": ["nvidia/z-ai/glm-5.3", "xkiro/qwen/qwen3-coder-plus:free", "mistral/devstral-medium-latest"],
    "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY", "mistral": "MISTRAL_API_KEY"},
    "simultaneos": {"nvidia": 2, "xkiro": 2},
}


def _archivo(contenido):
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    if isinstance(contenido, str):
        f.write(contenido)
    else:
        json.dump(contenido, f)
    f.close()
    return f.name


class Proceso:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode, self.stdout, self.stderr = returncode, stdout, stderr


class Config(unittest.TestCase):
    def test_lee_modelos_claves_y_topes(self):
        cfg = C.leer_config(_archivo(CONFIG))
        self.assertEqual(cfg["modelos"], CONFIG["modelos"])
        self.assertEqual(cfg["claves"]["nvidia"], "NVIDIA_API_KEY")
        self.assertEqual(cfg["simultaneos"]["nvidia"], 2)

    def test_json_roto_no_tumba(self):
        ruta = os.path.join(tempfile.mkdtemp(), "no-existe.json")
        self.assertEqual(C.leer_config(ruta)["modelos"], [])

    def test_claves_requeridas_solo_nombres(self):
        self.assertEqual(C.claves_requeridas(CONFIG),
                         ["MISTRAL_API_KEY", "NVIDIA_API_KEY", "XKIRO_API_KEY"])

    def test_claves_faltantes_y_sin_lectura(self):
        self.assertEqual(C.claves_faltantes(CONFIG, {"NVIDIA_API_KEY"}),
                         ["MISTRAL_API_KEY", "XKIRO_API_KEY"])
        self.assertEqual(C.claves_faltantes(CONFIG, None), [])

    def test_modelos_disponibles(self):
        self.assertEqual(C.modelos_disponibles(CONFIG, {"NVIDIA_API_KEY", "MISTRAL_API_KEY"}),
                         ["nvidia/z-ai/glm-5.3", "mistral/devstral-medium-latest"])

    def test_instrucciones_dan_comando_sin_valor(self):
        cmds = C.instrucciones("room-cli", CONFIG, {"NVIDIA_API_KEY"})
        self.assertIn("room-cli cloud env set XKIRO_API_KEY", cmds)
        self.assertFalse(any("sk-" in c for c in cmds))


class Diagnostico(unittest.TestCase):
    def test_app_ausente(self):
        d = C.diagnostico(None, None, None, CONFIG, errores=("app sin instalar",))
        self.assertEqual(d["estado"], "no_disponible")
        self.assertFalse(d["sesion"])

    def test_sin_sesion(self):
        d = C.diagnostico({"running": True}, {"authenticated": False}, None, CONFIG)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("sin iniciar sesión", str(d["detalle"]))

    def test_sesion_sin_claves_pide_las_que_faltan(self):
        d = C.diagnostico({"running": True}, {"authenticated": True}, {"NVIDIA_API_KEY"}, CONFIG, cli="room-cli")
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertTrue(d["sesion"])
        self.assertEqual(d["claves_faltantes"], ["MISTRAL_API_KEY", "XKIRO_API_KEY"])
        self.assertIn("room-cli cloud env set XKIRO_API_KEY", str(d["siguiente_paso"]))

    def test_todo_listo(self):
        d = C.diagnostico({"running": True}, {"authenticated": True},
                          {"NVIDIA_API_KEY", "XKIRO_API_KEY", "MISTRAL_API_KEY"}, CONFIG, {"count": 0})
        self.assertEqual(d["estado"], "listo")
        modelos = d["modelos"]
        self.assertIsInstance(modelos, list)
        self.assertEqual(len(modelos), 3)


class Activacion(unittest.TestCase):
    def setUp(self):
        self.setup = _archivo("#!/bin/sh\nproviders\n")
        self.config = _archivo(CONFIG)

    def test_aplicar_setup_pasa_el_script_por_stdin(self):
        visto = {}

        def falso(orden, **kw):
            visto["orden"], visto["entrada"] = orden, kw.get("input")
            return Proceso(0, "ok")

        with mock.patch.object(C, "RUTA_SETUP", self.setup):
            r = C.aplicar_setup(run=falso, cli="room-cli")
        self.assertTrue(r["aplicado"])
        self.assertEqual(visto["orden"], ["room-cli", "cloud", "setup", "set"])
        self.assertIn("providers", visto["entrada"])
        self.assertNotIn("API_KEY=", visto["entrada"])

    def test_aplicar_en_seco_no_ejecuta(self):
        def falso(*a, **k):
            raise AssertionError("no debe ejecutarse")

        with mock.patch.object(C, "RUTA_SETUP", self.setup):
            r = C.aplicar_setup(run=falso, cli="room-cli", seco=True)
        self.assertFalse(r["aplicado"])

    def test_sin_app_no_aplica(self):
        with mock.patch.object(C.medio_cloudroom, "cli_path", return_value=""):
            r = C.aplicar_setup(run=lambda *a, **k: (_ for _ in ()).throw(AssertionError()), cli=None)
        self.assertFalse(r["aplicado"])
        self.assertIn("app sin instalar", r["motivo"])

    def test_activar_no_aplica_sin_sesion(self):
        def falso(orden, **kw):
            if orden[1:] == ["status", "--json"]:
                return Proceso(0, '{"running": true}')
            if orden[1:] == ["cloud", "status", "--json"]:
                return Proceso(0, '{"authenticated": false}')
            return Proceso(0, "{}")

        r = C.activar(run=falso, cli="room-cli")
        self.assertFalse(r["setup"]["aplicado"])
        self.assertEqual(r["estado"], "requiere_alex")

    def test_activar_aplica_con_sesion_y_claves(self):
        llamadas = []

        def falso(orden, **kw):
            llamadas.append(orden[1:])
            if orden[1:] == ["status", "--json"]:
                return Proceso(0, '{"running": true}')
            if orden[1:] == ["cloud", "status", "--json"]:
                return Proceso(0, '{"authenticated": true}')
            if orden[1:] == ["cloud", "env", "list", "--json"]:
                return Proceso(0, '{"variables":[{"name":"NVIDIA_API_KEY"},'
                                  '{"name":"XKIRO_API_KEY"},{"name":"MISTRAL_API_KEY"}]}')
            if orden[1:] == ["cloud", "setup", "set"]:
                return Proceso(0, "ok")
            return Proceso(0, "{}")

        with mock.patch.object(C, "RUTA_SETUP", self.setup), mock.patch.object(C, "RUTA_MODELOS", self.config):
            r = C.activar(run=falso, cli="room-cli")
        self.assertTrue(r["setup"]["aplicado"])
        self.assertIn(["cloud", "setup", "set"], llamadas)


if __name__ == "__main__":
    unittest.main()
